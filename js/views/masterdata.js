// Stammdaten: Artikel, Hersteller, Kategorien, Lagerorte (archivieren statt löschen)
import { S, run, reload, qtyText, memberName, catOf, manName, optionsOf, itemName } from '../store.js';
import { el, icon, topbar, formDialog, fmtMoney, fmtNum, empty, toast, confirmBox } from '../ui.js';
import { friendlyError } from '../db.js';
import { canScan, scanBarcode } from '../scanner.js';

const UNITS = ['Stück', 'g', 'kg', 'ml', 'l', 'm', 'Packung', 'Dose', 'Karton', 'Rolle', 'Paar'];

export const TYPES = {
  artikel: {
    table: 'items', title: 'Artikel', one: 'Artikel', icon: 'box',
    sub: (x) => [catOf(x.category_id)?.name, manName(x.manufacturer_id), x.sku].filter(Boolean).join(' · '),
    right: (x) => qtyText(x.id, S.D.qty(x.id)),
    href: (x) => '#artikel/' + x.id,
  },
  hersteller: {
    table: 'manufacturers', title: 'Hersteller', one: 'Hersteller', icon: 'factory',
    fields: () => [
      { name: 'name', label: 'Name', required: true, max: 100 },
      { name: 'country', label: 'Land', max: 60, list: ['Deutschland', 'Österreich', 'Schweiz', 'Tschechien', 'Italien', 'USA'] },
      { name: 'website', label: 'Webseite', type: 'url', placeholder: 'https://…' },
      { name: 'notes', label: 'Notiz', type: 'textarea' },
    ],
    sub: (x) => x.country || '',
    right: (x) => `${S.data.items.filter((i) => i.manufacturer_id === x.id && !i.archived).length} Artikel`,
  },
  kategorien: {
    table: 'categories', title: 'Kategorien', one: 'Kategorie', icon: 'tag',
    fields: () => [{ name: 'name', label: 'Name', required: true, max: 60 }, { name: 'color', label: 'Farbe', type: 'color' }],
    sub: () => '',
    dot: (x) => el('span', { class: 'cat-dot big', style: { background: x.color } }),
    right: (x) => `${S.data.items.filter((i) => i.category_id === x.id && !i.archived).length} Artikel`,
  },
  lagerorte: {
    table: 'locations', title: 'Lagerorte', one: 'Lagerort', icon: 'pin',
    fields: () => [{ name: 'name', label: 'Name', required: true, max: 100, placeholder: 'z. B. Keller-Schrank' }, { name: 'description', label: 'Beschreibung', type: 'textarea', max: 500 }],
    sub: (x) => x.description || '',
    right: (x) => `${new Set([...S.D.lots.values()].filter((l) => l.location_id === x.id && l.qty > 0).map((l) => l.item_id)).size} Artikel`,
  },
};

export async function editRecord(typeKey, row) {
  const T = TYPES[typeKey];
  if (typeKey === 'artikel') return editItem(row);
  let saved = null;
  const res = await formDialog(row ? `${T.one} bearbeiten` : `${T.one} anlegen`, T.fields(), row || {}, {
    onSave: async (v) => { try { saved = row ? await S.backend.update(T.table, row.id, v) : await S.backend.insert(T.table, v); } catch (e) { throw friendlyError(e); } },
  });
  if (res) { toast('Gespeichert.'); await reload(); }
  return saved;
}

export async function editItem(row) {
  let saved = null;
  const res = await formDialog(row ? 'Artikel bearbeiten' : 'Neuer Artikel', [
    { name: 'name', label: 'Name', required: true, max: 100 },
    { name: 'manufacturer_id', label: 'Hersteller', type: 'select', options: optionsOf('manufacturers', '— keiner —') },
    { name: 'category_id', label: 'Kategorie', type: 'select', options: optionsOf('categories', '— keine —') },
    { name: 'unit', label: 'Einheit', required: true, max: 20, list: UNITS, hint: 'z. B. Stück, g, kg, Packung' },
    { name: 'min_qty', label: 'Mindestbestand (alle zusammen)', type: 'number', hint: 'Darunter gibt es eine Warnung. Leer = keine Warnung.' },
    { name: 'default_location_id', label: 'Standard-Lagerort', type: 'select', options: optionsOf('locations', '— keiner —') },
    { name: 'sku', label: 'Artikelnummer', max: 60 },
    { name: 'ean', label: 'EAN / Barcode', max: 32, scan: canScan() ? scanBarcode : null, inputmode: 'numeric' },
    { name: 'notes', label: 'Notizen', type: 'textarea' },
  ], { unit: 'Stück', ...(row || {}) }, {
    onSave: async (v) => { try { saved = row ? await S.backend.update('items', row.id, v) : await S.backend.insert('items', v); } catch (e) { throw friendlyError(e); } },
  });
  if (res) { toast('Artikel gespeichert.'); await reload(); }
  return saved;
}

export async function toggleArchive(typeKey, row) {
  const T = TYPES[typeKey];
  if (!row.archived && typeKey === 'artikel' && S.D.qty(row.id) > 0
    && !await confirmBox(`„${row.name}“ hat noch Bestand (${qtyText(row.id, S.D.qty(row.id))}). Trotzdem archivieren? Der Bestand bleibt erhalten.`, { ok: 'Archivieren' })) return;
  await run(() => S.backend.update(T.table, row.id, { archived: !row.archived }), row.archived ? 'Wiederhergestellt.' : 'Archiviert.');
}

export function masterdata(r) {
  const [, typeKey, id] = r.parts;
  if (!typeKey || !TYPES[typeKey]) return hub();
  return id ? detail(typeKey, id) : list(typeKey);
}

function hub() {
  return el('div', null,
    topbar('Stammdaten', { back: '#mehr', sub: 'Einmal anlegen, immer wieder auswählen' }),
    el('ul', { class: 'card list menu' }, Object.entries(TYPES).map(([k, T]) =>
      el('li', null, el('a', { class: 'row link', href: '#stammdaten/' + k },
        el('span', { class: 'menu-ic' }, icon(T.icon)), el('span', { class: 'grow' }, el('strong', { text: T.title })),
        el('span', { class: 'sub', text: String(S.data[T.table].filter((x) => !x.archived).length) }), icon('right'))))));
}

function list(typeKey) {
  const T = TYPES[typeKey];
  const f = (S.ui['md_' + typeKey] ||= { text: '', archived: false });
  const search = el('input', { type: 'search', placeholder: `${T.title} durchsuchen`, value: f.text, 'aria-label': 'Suchen' });
  const body = el('div');
  const draw = () => {
    f.text = search.value.trim();
    const t = f.text.toLowerCase();
    const rows = S.data[T.table].filter((x) => (f.archived ? x.archived : !x.archived))
      .filter((x) => !t || [x.name, x.sku, x.ean, x.country, x.description, x.notes].some((v) => v && String(v).toLowerCase().includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    body.replaceChildren(rows.length
      ? el('ul', { class: 'card list' }, rows.map((x) => el('li', null,
        el('a', { class: 'row link', href: T.href ? T.href(x) : `#stammdaten/${typeKey}/${x.id}` },
          T.dot ? T.dot(x) : thumb(typeKey === 'artikel' ? x : null, T.icon),
          el('span', { class: 'grow' }, el('strong', { class: 'ellipsis block', text: x.name }), el('span', { class: 'sub ellipsis block', text: T.sub(x) })),
          el('span', { class: 'sub nowrap', text: T.right(x) }), icon('right')))))
      : empty(T.icon, f.archived ? 'Nichts archiviert.' : `Noch keine ${T.title}. Tippe auf „Neu“.`));
  };
  search.addEventListener('input', draw);
  draw();
  return el('div', null,
    topbar(T.title, { back: '#stammdaten' }),
    el('div', { class: 'search' }, icon('search'), search),
    el('div', { class: 'row-actions' },
      el('label', { class: 'checkrow small' }, el('input', { type: 'checkbox', checked: f.archived, onchange: (e) => { f.archived = e.target.checked; draw(); } }), el('span', { text: 'Archivierte zeigen' })),
      S.readonly ? null : el('button', { class: 'btn primary small', onclick: () => editRecord(typeKey) }, icon('plus'), 'Neu')),
    body);
}

export function thumb(item, ic = 'box') {
  const c = item ? catOf(item.category_id) : null;
  return el('span', { class: 'thumb sm ph', style: c ? { background: c.color + '22', color: c.color } : null }, icon(ic));
}

function detail(typeKey, id) {
  const T = TYPES[typeKey];
  const x = S.data[T.table].find((r) => r.id === id);
  if (!x) return el('div', null, topbar('Nicht gefunden', { back: '#stammdaten/' + typeKey }), empty('info', 'Diesen Eintrag gibt es nicht mehr.'));
  const actions = S.readonly ? [] : [
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bearbeiten', onclick: () => editRecord(typeKey, x) }, icon('edit')),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': x.archived ? 'Wiederherstellen' : 'Archivieren', onclick: () => toggleArchive(typeKey, x) }, icon('archive')),
  ];
  let info = null, related;
  if (typeKey === 'hersteller') {
    const rows = [['Land', x.country], ['Webseite', x.website ? el('a', { href: x.website, text: x.website, target: '_blank', rel: 'noopener' }) : null], ['Notiz', x.notes]].filter(([, v]) => v);
    info = rows.length ? el('dl', { class: 'kv' }, rows.map(([k, v]) => [el('dt', { text: k }), el('dd', null, v)])) : null;
    related = itemsBlock(S.data.items.filter((i) => i.manufacturer_id === id), 'Artikel von diesem Hersteller');
  } else if (typeKey === 'kategorien') {
    info = el('p', null, el('span', { class: 'cat-dot big', style: { background: x.color } }));
    related = itemsBlock(S.data.items.filter((i) => i.category_id === id), 'Artikel in dieser Kategorie');
  } else {
    info = x.description ? el('p', { text: x.description }) : null;
    const lots = [...S.D.lots.values()].filter((l) => l.location_id === id && l.qty > 0).sort((a, b) => itemName(a.item_id).localeCompare(itemName(b.item_id), 'de'));
    related = el('div', null, el('h2', { class: 'section', text: 'Was liegt hier?' }),
      lots.length ? el('ul', { class: 'card list' }, lots.map((l) => el('li', null, el('a', { class: 'row link', href: '#artikel/' + l.item_id },
        el('span', { class: 'grow' }, el('strong', { class: 'block', text: itemName(l.item_id) }), el('span', { class: 'sub', text: memberName(l.owner_id) + (l.batch ? ` · Charge ${l.batch}` : '') })),
        el('span', { class: 'nowrap', text: qtyText(l.item_id, l.qty) }))))) : empty('pin', 'Hier liegt gerade nichts.'));
  }
  return el('div', null,
    topbar(x.name, { back: '#stammdaten/' + typeKey, sub: T.one + (x.archived ? ' · archiviert' : ''), actions }),
    info ? el('div', { class: 'card' }, info) : null,
    related);
}

function itemsBlock(items, title) {
  const active = items.filter((i) => !i.archived);
  const value = active.reduce((s, i) => s + S.D.value(i.id), 0);
  return el('div', null,
    el('div', { class: 'kpis' }, kpi('Artikel', fmtNum(active.length)), kpi('Gesamtwert', fmtMoney(value))),
    el('h2', { class: 'section', text: title }),
    active.length ? el('ul', { class: 'card list' }, active.map((i) => el('li', null, el('a', { class: 'row link', href: '#artikel/' + i.id },
      thumb(i), el('span', { class: 'grow' }, el('strong', { class: 'block ellipsis', text: i.name }), el('span', { class: 'sub', text: fmtMoney(S.D.value(i.id)) })),
      el('span', { class: 'nowrap', text: qtyText(i.id, S.D.qty(i.id)) }))))) : empty('box', 'Keine Artikel.'));
}

export function kpi(label, value, sub, cls = '') {
  return el('div', { class: 'kpi ' + cls }, el('span', { class: 'kpi-l', text: label }), el('strong', { class: 'kpi-v', text: value }), sub ? el('span', { class: 'kpi-s', text: sub }) : null);
}
