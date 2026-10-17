// Bestand: was ist da, wem gehört es, wo liegt es
import { S, go, memberName, qtyText, locName, catOf, manName, activeMembers, activeOf, lotLabel } from '../store.js';
import { el, icon, topbar, iconBtn, fmtMoney, fmtNum, empty, selectEl, toast, fmtQty } from '../ui.js';
import { getBarcode, barcodeLabel, barcodeIcon } from '../scanner.js';
import { exportStockCSV } from '../exports.js';
import { thumb, editItem, toggleArchive, kpi } from './masterdata.js';
import { entryList } from './history.js';

export function stock() {
  const f = (S.ui.stock ||= { text: '', person: '', loc: '', cat: '' });
  const search = el('input', { type: 'search', placeholder: 'Artikel, Nummer oder EAN', value: f.text, enterkeyhint: 'search', 'aria-label': 'Suchen' });
  const body = el('div');

  const draw = () => {
    f.text = search.value.trim();
    const t = f.text.toLowerCase();
    const items = activeOf('items')
      .filter((i) => !t || [i.name, i.sku, i.ean, manName(i.manufacturer_id), catOf(i.category_id)?.name].some((v) => v && v.toLowerCase().includes(t)))
      .filter((i) => !f.cat || i.category_id === f.cat)
      .filter((i) => !f.person || S.D.qty(i.id, f.person) > 0)
      .filter((i) => !f.loc || S.D.lotsOf(i.id).some((l) => l.location_id === f.loc && (!f.person || l.owner_id === f.person)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const low = items.filter(isLow).length;
    body.replaceChildren(
      el('p', { class: 'sub list-sum', text: `${items.length} Artikel` + (low ? ` · ${low} unter Mindestbestand` : '') }),
      items.length ? el('div', null, items.map((i) => itemCard(i, f))) : empty('box', t || f.person || f.loc || f.cat ? 'Nichts gefunden.' : 'Noch nichts im Lager. Tippe unten auf „Buchen“, um den ersten Einkauf einzutragen.'));
  };
  let tmr;
  search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(draw, 120); });
  const set = (k) => (e) => { f[k] = e.target.value; draw(); };

  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Person' },
    [['', 'Alle'], ...activeMembers().map((m) => [m.id, m.name])].map(([id, name]) =>
      el('button', { type: 'button', class: 'chip', 'aria-pressed': f.person === id ? 'true' : 'false', text: name, onclick: (e) => {
        f.person = id;
        chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        e.currentTarget.setAttribute('aria-pressed', 'true');
        draw();
      } })));

  draw();
  return el('div', null,
    topbar('Bestand', { actions: [
      iconBtn(barcodeIcon(), barcodeLabel(), async () => {
        const code = await getBarcode();
        if (!code) return;
        const hit = S.data.items.find((i) => i.ean === code);
        if (hit) go('#artikel/' + hit.id);
        else { search.value = code; draw(); toast('Kein Artikel mit diesem Barcode.', true); }
      }),
      iconBtn('download', 'Als CSV (Excel) speichern', exportStockCSV),
      iconBtn('print', 'Drucken / PDF', () => go('#bericht/bestand')),
    ].filter(Boolean) }),
    el('div', { class: 'search' }, icon('search'), search),
    chips,
    el('div', { class: 'filters' },
      selectEl([['', 'Alle Lagerorte'], ...activeOf('locations').map((l) => [l.id, l.name])], f.loc, { onchange: set('loc'), 'aria-label': 'Lagerort' }),
      selectEl([['', 'Alle Kategorien'], ...activeOf('categories').map((c) => [c.id, c.name])], f.cat, { onchange: set('cat'), 'aria-label': 'Kategorie' })),
    body);
}

export const isLow = (i) => i.min_qty != null && S.D.qty(i.id) < Number(i.min_qty);

function itemCard(i, f) {
  const total = S.D.qty(i.id);
  const shown = f.person ? S.D.qty(i.id, f.person) : total;
  const per = activeMembers().map((m) => [m, S.D.qty(i.id, m.id)]).filter(([, q]) => q > 0);
  const max = Math.max(...per.map(([, q]) => q), 1);
  const c = catOf(i.category_id);
  const locLots = f.loc ? S.D.lotsOf(i.id, f.person || null).filter((l) => l.location_id === f.loc) : [];
  return el('a', { class: 'card clickable item-card', href: '#artikel/' + i.id },
    el('div', { class: 'item-head' },
      thumb(i),
      el('div', { class: 'grow' },
        el('div', { class: 'item-name', text: i.name }),
        el('div', { class: 'sub' },
          c ? el('span', { class: 'cat-dot', style: { background: c.color } }) : null,
          [c?.name, manName(i.manufacturer_id)].filter(Boolean).join(' · ') || ' ')),
      el('div', { class: 'item-total' },
        el('div', { text: fmtQty(shown, i.unit) }),
        isLow(i) ? el('span', { class: 'badge warn' }, icon('alert', 'xs'), ' wenig') : null)),
    !f.person && per.length > 1 ? el('div', { class: 'split' }, per.map(([m, q]) =>
      el('div', { class: 'split-row' },
        el('span', { class: 'who', text: m.name }),
        el('span', { class: 'bar' }, el('span', { style: { width: `${(q / max) * 100}%` } })),
        el('span', { class: 'num', text: qtyText(i.id, q) })))) : null,
    !f.person && per.length === 1 ? el('div', { class: 'sub mt-s', text: `gehört ${per[0][0].name}` }) : null,
    locLots.length ? el('div', { class: 'sub mt-s', text: locLots.map((l) => `${memberName(l.owner_id)}${l.batch ? ' · ' + l.batch : ''}: ${qtyText(i.id, l.qty)}`).join(' | ') }) : null);
}

// ---------- Artikel-Detail ----------
export function itemDetail(r) {
  const id = r.parts[1];
  const i = S.D.items.get(id);
  if (!i) return el('div', null, topbar('Nicht gefunden', { back: '#bestand' }), empty('box', 'Diesen Artikel gibt es nicht mehr.'));
  const total = S.D.qty(id);
  const avg = S.D.avgPrice(id);
  const c = catOf(i.category_id);
  const lots = S.D.lotsOf(id).sort((a, b) => memberName(a.owner_id).localeCompare(memberName(b.owner_id)) || lotLabel(a).localeCompare(lotLabel(b)));
  const per = S.data.members.map((m) => [m, S.D.qty(id, m.id)]).filter(([, q]) => q > 0);
  const max = Math.max(...per.map(([, q]) => q), 1);
  const photo = i.photo_path ? S.photos.get(i.photo_path) : null;
  const entries = S.D.entries.filter((e) => e.item_id === id);
  const q = `?item=${id}`;

  return el('div', null,
    topbar(i.name, { back: '#bestand', sub: [c?.name, manName(i.manufacturer_id)].filter(Boolean).join(' · ') + (i.archived ? ' · archiviert' : ''),
      actions: S.readonly ? [] : [iconBtn('edit', 'Bearbeiten', () => editItem(i)), iconBtn('archive', i.archived ? 'Wiederherstellen' : 'Archivieren', () => toggleArchive('artikel', i))] }),
    photo ? el('img', { class: 'hero-photo', src: photo, alt: i.name }) : null,
    el('div', { class: 'kpis three-kpi' },
      kpi('Bestand', fmtQty(total, i.unit), i.min_qty != null ? `Minimum ${fmtQty(i.min_qty, i.unit)}` : null, total < Number(i.min_qty ?? -1) ? 'warn' : ''),
      kpi('Wert', fmtMoney(S.D.value(id)), 'Ø Einkaufspreis'),
      kpi('Ø Preis', avg == null ? '–' : fmtMoney(avg), avg == null ? 'noch kein Preis' : `je ${i.unit}`)),
    S.readonly ? null : el('div', { class: 'quick' },
      el('a', { class: 'btn primary', href: '#buchen/einkauf' + q }, icon('plus'), 'Einkauf'),
      el('a', { class: 'btn', href: '#buchen/abgang' + q }, icon('minus'), 'Abgang'),
      el('a', { class: 'btn', href: '#buchen/uebertrag' + q }, icon('swap'), 'Übertrag')),
    el('section', { class: 'card' },
      el('h2', { text: 'Wem gehört was?' }),
      per.length ? el('div', { class: 'split' }, per.map(([m, qq]) => el('div', { class: 'split-row' },
        el('span', { class: 'who', text: m.name }),
        el('span', { class: 'bar' }, el('span', { style: { width: `${(qq / max) * 100}%` } })),
        el('span', { class: 'num', text: qtyText(id, qq) })))) : el('p', { class: 'sub', text: 'Kein Bestand.' })),
    lots.length ? el('section', { class: 'card' },
      el('h2', { text: 'Nach Lagerort und Charge' }),
      el('table', { class: 'tbl' },
        el('thead', null, el('tr', null, el('th', { text: 'Person' }), el('th', { text: 'Lagerort' }), el('th', { text: 'Charge' }), el('th', { class: 'r', text: 'Menge' }))),
        el('tbody', null, lots.map((l) => el('tr', null,
          el('td', { text: memberName(l.owner_id) }), el('td', { text: locName(l.location_id) }), el('td', { text: l.batch || '–' }),
          el('td', { class: 'r nowrap', text: qtyText(id, l.qty) })))))) : null,
    el('section', { class: 'card' },
      el('h2', { text: 'Angaben' }),
      el('dl', { class: 'kv' }, [
        ['Kategorie', c?.name], ['Hersteller', i.manufacturer_id ? el('a', { href: '#stammdaten/hersteller/' + i.manufacturer_id, text: manName(i.manufacturer_id) }) : null],
        ['Artikelnummer', i.sku], ['EAN / Barcode', i.ean], ['Einheit', i.unit],
        ['Standard-Lagerort', i.default_location_id ? locName(i.default_location_id) : null],
        ['Mindestbestand', i.min_qty != null ? fmtQty(i.min_qty, i.unit) : null], ['Notizen', i.notes],
      ].filter(([, v]) => v).map(([k, v]) => [el('dt', { text: k }), el('dd', { class: 'pre' }, v)]))),
    el('h2', { class: 'section', text: `Buchungen (${fmtNum(entries.length)})` }),
    entries.length ? entryList(entries.slice(0, 15)) : empty('list', 'Noch keine Buchungen.'),
    entries.length > 15 ? el('button', { class: 'btn block mt', onclick: () => { S.ui.hist = { person: '', item: id, type: '', text: '', limit: 60 }; go('#verlauf'); } }, 'Alle im Verlauf ansehen') : null);
}
