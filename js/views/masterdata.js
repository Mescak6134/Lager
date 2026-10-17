// Stammdaten: Artikel, Hersteller, Händler, Lagerorte, Kategorien
import { S, run, reload, go, itemName, qtyText, memberName, locName, catOf, manName, optionsOf } from '../store.js';
import { el, icon, topbar, iconBtn, formDialog, fmtMoney, fmtNum, empty, resizeImage, toast, confirmBox } from '../ui.js';
import { friendlyError } from '../db.js';
import { canScan, scanBarcode } from '../scanner.js';
import { exportMasterCSV } from '../exports.js';
import { entryList } from './history.js';

const UNITS = ['Stück', 'g', 'kg', 'ml', 'l', 'm', 'Packung', 'Dose', 'Karton', 'Rolle', 'Paar'];

export const TYPES = {
  artikel: {
    table: 'items', title: 'Artikel', one: 'Artikel', icon: 'box',
    sub: (x) => [catOf(x.category_id)?.name, manName(x.manufacturer_id), x.sku].filter(Boolean).join(' · '),
    right: (x) => qtyText(x.id, S.D.qty(x.id)),
    href: (x) => '#artikel/' + x.id,
    csv: [['name', 'Name'], ['sku', 'Artikelnr.'], ['ean', 'EAN'], ['category_id', 'Kategorie', (x) => catOf(x.category_id)?.name], ['manufacturer_id', 'Hersteller', (x) => manName(x.manufacturer_id)],
      ['unit', 'Einheit'], ['min_qty', 'Mindestbestand'], ['default_location_id', 'Standard-Lagerort', (x) => (x.default_location_id ? locName(x.default_location_id) : '')], ['notes', 'Notizen'], ['archived', 'Archiviert', (x) => (x.archived ? 'ja' : 'nein')]],
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
    csv: [['name', 'Name'], ['country', 'Land'], ['website', 'Webseite'], ['notes', 'Notiz']],
  },
  haendler: {
    table: 'suppliers', title: 'Händler', one: 'Händler', icon: 'truck',
    fields: () => [
      { name: 'name', label: 'Name', required: true, max: 100 },
      { name: 'address', label: 'Adresse', type: 'textarea', max: 300 },
      { name: 'phone', label: 'Telefon', type: 'tel', max: 60 },
      { name: 'email', label: 'E-Mail', type: 'email' },
      { name: 'website', label: 'Webseite', type: 'url', placeholder: 'https://…' },
      { name: 'customer_no', label: 'Unsere Kundennummer', max: 60 },
      { name: 'notes', label: 'Notiz', type: 'textarea' },
    ],
    sub: (x) => [x.customer_no ? `Kd.-Nr. ${x.customer_no}` : null, x.phone].filter(Boolean).join(' · '),
    right: (x) => fmtMoney(S.data.movements.filter((m) => m.supplier_id === x.id && m.reason === 'kauf').reduce((s, m) => s + Number(m.price_total || 0), 0)),
    csv: [['name', 'Name'], ['address', 'Adresse'], ['phone', 'Telefon'], ['email', 'E-Mail'], ['website', 'Webseite'], ['customer_no', 'Kundennummer'], ['notes', 'Notiz']],
  },
  lagerorte: {
    table: 'locations', title: 'Lagerorte', one: 'Lagerort', icon: 'pin',
    fields: () => [
      { name: 'name', label: 'Name', required: true, max: 100, placeholder: 'z. B. Keller-Schrank' },
      { name: 'description', label: 'Beschreibung', type: 'textarea', max: 500 },
    ],
    sub: (x) => x.description || '',
    right: (x) => `${new Set([...S.D.lots.values()].filter((l) => l.location_id === x.id && l.qty > 0).map((l) => l.item_id)).size} Artikel`,
    csv: [['name', 'Name'], ['description', 'Beschreibung']],
  },
  kategorien: {
    table: 'categories', title: 'Kategorien', one: 'Kategorie', icon: 'tag',
    fields: () => [
      { name: 'name', label: 'Name', required: true, max: 60 },
      { name: 'color', label: 'Farbe', type: 'color' },
    ],
    sub: () => '',
    dot: (x) => el('span', { class: 'cat-dot big', style: { background: x.color } }),
    right: (x) => `${S.data.items.filter((i) => i.category_id === x.id && !i.archived).length} Artikel`,
    csv: [['name', 'Name'], ['color', 'Farbe']],
  },
};

// ---------- Bearbeiten ----------
export async function editRecord(typeKey, row) {
  const T = TYPES[typeKey];
  if (typeKey === 'artikel') return editItem(row);
  let saved = null;
  const res = await formDialog(row ? `${T.one} bearbeiten` : `${T.one} anlegen`, T.fields(), row || {}, {
    onSave: async (v) => {
      try { saved = row ? await S.backend.update(T.table, row.id, v) : await S.backend.insert(T.table, v); } catch (e) { throw friendlyError(e); }
    },
  });
  if (res) { toast('Gespeichert.'); await reload(); }
  return saved;
}

export async function editItem(row, preset = {}) {
  const photoUrl = row?.photo_path ? S.photos.get(row.photo_path) : null;
  const fields = [
    { name: 'name', label: 'Name', required: true, max: 100 },
    { name: 'category_id', label: 'Kategorie', type: 'select', options: optionsOf('categories', '— keine —') },
    { name: 'manufacturer_id', label: 'Hersteller', type: 'select', options: optionsOf('manufacturers', '— keiner —') },
    { name: 'unit', label: 'Einheit', required: true, max: 20, list: UNITS, hint: 'z. B. Stück, g, kg, Packung' },
    { name: 'min_qty', label: 'Mindestbestand (gesamt)', type: 'number', hint: 'Bei weniger gibt es eine Warnung. Leer lassen = keine Warnung.' },
    { name: 'default_location_id', label: 'Standard-Lagerort', type: 'select', options: optionsOf('locations', '— keiner —') },
    { name: 'sku', label: 'Artikelnummer', max: 60 },
    { name: 'ean', label: 'EAN / Barcode', max: 32, scan: canScan() ? scanBarcode : null, autocomplete: 'off', inputmode: 'numeric', hint: canScan() ? null : 'Die Zahl unter dem Strichcode eintippen.' },
    { name: 'notes', label: 'Notizen', type: 'textarea' },
    { name: 'photo', label: 'Foto', type: 'photo', current: photoUrl },
  ];
  let saved = null;
  const res = await formDialog(row ? 'Artikel bearbeiten' : 'Neuer Artikel', fields, { unit: 'Stück', ...preset, ...(row || {}) }, {
    onSave: async (v) => {
      const { photo, ...vals } = v;
      try {
        saved = row ? await S.backend.update('items', row.id, vals) : await S.backend.insert('items', vals);
        if (photo?.file) {
          const blob = await resizeImage(photo.file);
          const path = await S.backend.uploadPhoto(saved.id, blob);
          saved = await S.backend.update('items', saved.id, { photo_path: path });
          if (row?.photo_path) S.backend.deletePhoto(row.photo_path).catch(() => {});
        } else if (photo?.remove && row?.photo_path) {
          saved = await S.backend.update('items', saved.id, { photo_path: null });
          S.backend.deletePhoto(row.photo_path).catch(() => {});
        }
      } catch (e) { throw friendlyError(e); }
    },
  });
  if (res) { toast('Artikel gespeichert.'); await reload(); }
  return saved;
}

export async function toggleArchive(typeKey, row) {
  const T = TYPES[typeKey];
  if (!row.archived && typeKey === 'artikel' && S.D.qty(row.id) > 0) {
    if (!await confirmBox(`"${row.name}" hat noch Bestand (${qtyText(row.id, S.D.qty(row.id))}). Trotzdem archivieren? Der Bestand bleibt erhalten.`, { ok: 'Archivieren' })) return;
  }
  await run(() => S.backend.update(T.table, row.id, { archived: !row.archived }), row.archived ? 'Wiederhergestellt.' : 'Archiviert.');
}

// ---------- Ansichten ----------
export function masterdata(r) {
  const [, typeKey, id] = r.parts;
  if (!typeKey) return hub();
  if (!TYPES[typeKey]) return hub();
  if (id) return detail(typeKey, id);
  return list(typeKey);
}

function hub() {
  return el('div', null,
    topbar('Stammdaten', { back: '#mehr', sub: 'Alles, was man einmal anlegt und immer wieder braucht' }),
    el('ul', { class: 'card list menu' }, Object.entries(TYPES).map(([k, T]) =>
      el('li', null, el('a', { class: 'row link', href: '#stammdaten/' + k },
        el('span', { class: 'menu-ic' }, icon(T.icon)),
        el('span', { class: 'grow' }, el('strong', { text: T.title })),
        el('span', { class: 'sub', text: String(S.data[T.table].filter((x) => !x.archived).length) }),
        icon('right'))))));
}

function list(typeKey) {
  const T = TYPES[typeKey];
  const f = (S.ui['md_' + typeKey] ||= { text: '', archived: false });
  const search = el('input', { type: 'search', placeholder: `${T.title} durchsuchen`, value: f.text });
  const body = el('div');
  const draw = () => {
    f.text = search.value.trim();
    const filtered = S.data[T.table]
      .filter((x) => (f.archived ? x.archived : !x.archived))
      .filter((x) => !f.text || [x.name, x.sku, x.ean, x.country, x.customer_no, x.description, x.notes].some((v) => v && String(v).toLowerCase().includes(f.text.toLowerCase())))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    body.replaceChildren(filtered.length
      ? el('ul', { class: 'card list' }, filtered.map((x) => el('li', null,
        el('a', { class: 'row link', href: T.href ? T.href(x) : `#stammdaten/${typeKey}/${x.id}` },
          T.dot ? T.dot(x) : (typeKey === 'artikel' ? thumb(x) : null),
          el('span', { class: 'grow' }, el('strong', { class: 'ellipsis block', text: x.name }), el('span', { class: 'sub ellipsis block', text: T.sub(x) })),
          el('span', { class: 'sub nowrap', text: T.right(x) }),
          icon('right')))))
      : empty(T.icon, f.archived ? 'Nichts archiviert.' : `Noch keine ${T.title}. Tippe auf „+ Neu“.`));
  };
  search.addEventListener('input', draw);
  draw();
  return el('div', null,
    topbar(T.title, { back: '#stammdaten', actions: [
      iconBtn('download', 'Als CSV speichern', () => exportMasterCSV(T.table, T.title, T.csv)),
    ] }),
    el('div', { class: 'search' }, icon('search'), search),
    el('div', { class: 'row-actions' },
      el('label', { class: 'checkrow small' }, el('input', { type: 'checkbox', checked: f.archived, onchange: (e) => { f.archived = e.target.checked; go(location.hash); } }), el('span', { text: 'Archivierte zeigen' })),
      !S.readonly ? el('button', { class: 'btn primary small', onclick: () => editRecord(typeKey) }, icon('plus'), 'Neu') : null),
    body);
}

export function thumb(item, size = 'sm') {
  const url = item.photo_path ? S.photos.get(item.photo_path) : null;
  if (url) return el('img', { class: 'thumb ' + size, src: url, alt: '', loading: 'lazy' });
  const c = catOf(item.category_id);
  return el('span', { class: 'thumb ' + size + ' ph', style: c ? { background: c.color + '22', color: c.color } : null }, icon('box'));
}

function infoRows(pairs) {
  const rows = pairs.filter(([, v]) => v);
  if (!rows.length) return null;
  return el('dl', { class: 'kv' }, rows.map(([k, v]) => [el('dt', { text: k }), el('dd', null, v)]));
}
const link = (href, text) => el('a', { href, text, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener' });

function detail(typeKey, id) {
  const T = TYPES[typeKey];
  const x = S.data[T.table].find((r) => r.id === id);
  if (!x) return el('div', null, topbar('Nicht gefunden', { back: '#stammdaten/' + typeKey }), empty('info', 'Dieser Eintrag existiert nicht mehr.'));
  const actions = S.readonly ? [] : [
    iconBtn('edit', 'Bearbeiten', () => editRecord(typeKey, x)),
    iconBtn('archive', x.archived ? 'Wiederherstellen' : 'Archivieren', () => toggleArchive(typeKey, x)),
  ];
  let info, related;
  if (typeKey === 'hersteller') {
    info = infoRows([['Land', x.country], ['Webseite', x.website ? link(x.website, x.website) : null], ['Notiz', x.notes]]);
    related = itemsBlock(S.data.items.filter((i) => i.manufacturer_id === id), 'Artikel von diesem Hersteller');
  } else if (typeKey === 'haendler') {
    info = infoRows([['Adresse', x.address], ['Telefon', x.phone ? link('tel:' + x.phone.replace(/[^\d+]/g, ''), x.phone) : null],
      ['E-Mail', x.email ? link('mailto:' + x.email, x.email) : null], ['Webseite', x.website ? link(x.website, x.website) : null],
      ['Kundennr.', x.customer_no], ['Notiz', x.notes]]);
    const buys = S.D.entries.filter((e) => e.type === 'kauf' && e.supplier_id === id);
    const total = buys.reduce((s, e) => s + (e.price || 0), 0);
    related = el('div', null,
      el('div', { class: 'kpis two-kpi' }, kpi('Einkäufe', fmtNum(buys.length)), kpi('Ausgegeben', fmtMoney(total))),
      buys.length ? [el('h2', { class: 'section', text: 'Letzte Einkäufe' }), entryList(buys.slice(0, 20))] : empty('truck', 'Hier wurde noch nichts gekauft.'));
  } else if (typeKey === 'lagerorte') {
    info = infoRows([['Beschreibung', x.description]]);
    const lots = [...S.D.lots.values()].filter((l) => l.location_id === id && l.qty > 0)
      .sort((a, b) => itemName(a.item_id).localeCompare(itemName(b.item_id)));
    related = el('div', null, el('h2', { class: 'section', text: 'Was liegt hier?' }),
      lots.length ? el('ul', { class: 'card list' }, lots.map((l) => el('li', null, el('a', { class: 'row link', href: '#artikel/' + l.item_id },
        el('span', { class: 'grow' }, el('strong', { class: 'block', text: itemName(l.item_id) }), el('span', { class: 'sub', text: memberName(l.owner_id) + (l.batch ? ` · Charge ${l.batch}` : '') })),
        el('span', { class: 'nowrap', text: qtyText(l.item_id, l.qty) })))))
        : empty('pin', 'Hier liegt gerade nichts.'));
  } else if (typeKey === 'kategorien') {
    info = el('p', null, el('span', { class: 'cat-dot big', style: { background: x.color } }), ' ', x.color);
    related = itemsBlock(S.data.items.filter((i) => i.category_id === id), 'Artikel in dieser Kategorie');
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
    el('div', { class: 'kpis two-kpi' }, kpi('Artikel', fmtNum(active.length)), kpi('Bestandswert', fmtMoney(value))),
    el('h2', { class: 'section', text: title }),
    active.length ? el('ul', { class: 'card list' }, active.map((i) => el('li', null, el('a', { class: 'row link', href: '#artikel/' + i.id },
      thumb(i), el('span', { class: 'grow' }, el('strong', { class: 'block ellipsis', text: i.name }), el('span', { class: 'sub', text: fmtMoney(S.D.value(i.id)) })),
      el('span', { class: 'nowrap', text: qtyText(i.id, S.D.qty(i.id)) })))))
      : empty('box', 'Keine Artikel.'));
}

export function kpi(label, value, sub, cls = '') {
  return el('div', { class: 'kpi ' + cls }, el('span', { class: 'kpi-l', text: label }), el('strong', { class: 'kpi-v', text: value }), sub ? el('span', { class: 'kpi-s', text: sub }) : null);
}

