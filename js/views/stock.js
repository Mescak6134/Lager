// Bestand (Startseite): was gehört wem – Menge, Einzelwert (Ø), Gesamtwert
import { S, go, memberName, qtyText, locName, catOf, manName, activeMembers, activeOf, lotLabel, ownedPositions, isLow, isDemo } from '../store.js';
import { el, icon, topbar, iconBtn, fmtMoney, fmtUnitMoney, fmtNum, fmtQty, empty, selectEl, toast } from '../ui.js';
import { getBarcode, barcodeLabel, barcodeIcon } from '../scanner.js';
import { editItem, toggleArchive, kpi } from './masterdata.js';
import { entryList } from './history.js';

export function stock() {
  const f = (S.ui.stock ||= { text: '', person: '', cat: '', sort: 'name' });
  const search = el('input', { type: 'search', placeholder: 'Suchen …', value: f.text, enterkeyhint: 'search', 'aria-label': 'Suchen' });
  const hero = el('section', { class: 'card hero', 'aria-live': 'polite' });
  const personChips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Person' });
  const body = el('div');

  const byName = (a, b) => a.item.name.localeCompare(b.item.name, 'de') || memberName(a.owner_id).localeCompare(memberName(b.owner_id), 'de');
  const sorters = { name: byName, wert: (a, b) => (b.value ?? -1) - (a.value ?? -1) || byName(a, b), menge: (a, b) => b.qty - a.qty || byName(a, b) };

  const draw = () => {
    f.text = search.value.trim();
    const all = ownedPositions({ cat: f.cat, text: f.text });          // für Summen je Person
    const rows = (f.person ? all.filter((r) => r.owner_id === f.person) : all).sort(sorters[f.sort] || byName);
    const total = rows.reduce((s, r) => s + (r.value || 0), 0);
    const per = new Map(); for (const r of all) per.set(r.owner_id, (per.get(r.owner_id) || 0) + (r.value || 0));
    const low = new Set(rows.filter((r) => isLow(r.item)).map((r) => r.item.id)).size;
    const noValue = rows.filter((r) => r.value == null).length;
    hero.replaceChildren(
      el('span', { class: 'kpi-l', text: f.person ? `Gesamtwert ${memberName(f.person)}` : (f.cat || f.text) ? 'Gesamtwert (gefiltert)' : 'Gesamtwert' }),
      el('strong', { class: 'hero-v', text: fmtMoney(total) }),
      el('span', { class: 'kpi-s', text: [`${rows.length} Position${rows.length === 1 ? '' : 'en'}`, low ? `${low} unter Mindestbestand` : null, noValue ? `${noValue} ohne Wert` : null].filter(Boolean).join(' · ') }));
    // Personen-Chips mit ihrem Wert
    personChips.replaceChildren(...[['', 'Alle', [...per.values()].reduce((s, v) => s + v, 0)], ...activeMembers().map((m) => [m.id, m.name, per.get(m.id) || 0])]
      .map(([id, name, v]) => el('button', { type: 'button', class: 'chip chip-v', 'aria-pressed': f.person === id ? 'true' : 'false', onclick: () => { f.person = id; draw(); } },
        el('span', { text: name }), el('small', { text: fmtMoney(v) }))));
    body.replaceChildren(rows.length ? list(rows)
      : empty('box', f.text || f.cat || f.person ? 'Nichts gefunden.' : 'Noch nichts im Bestand.',
        f.text || f.cat || f.person || S.readonly ? null : el('a', { class: 'btn primary', href: '#plus/zugang' }, icon('plus'), 'Ersten Zugang eintragen')));
  };
  let tmr;
  search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(draw, 120); });

  const cats = activeOf('categories');
  const catChips = cats.length ? el('div', { class: 'chips chips-small', role: 'group', 'aria-label': 'Kategorie' },
    [['', 'Alle Kategorien'], ...cats.map((c) => [c.id, c.name, c.color])].map(([id, name, color]) =>
      el('button', { type: 'button', class: 'chip', 'aria-pressed': f.cat === id ? 'true' : 'false', onclick: (e) => {
        f.cat = id;
        e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        e.currentTarget.setAttribute('aria-pressed', 'true');
        draw();
      } }, color ? el('span', { class: 'cat-dot', style: { background: color } }) : null, name))) : null;

  draw();
  return el('div', null,
    topbar('Bestand', { sub: isDemo() ? 'Demo – Beispieldaten' : null, actions: [
      iconBtn(barcodeIcon(), barcodeLabel(), async () => {
        const code = await getBarcode();
        if (!code) return;
        const hit = S.data.items.find((i) => i.ean === code);
        if (hit) go('#artikel/' + hit.id); else { search.value = code; draw(); toast('Kein Artikel mit diesem Barcode.', true); }
      }),
    ] }),
    hero,
    personChips,
    catChips,
    el('div', { class: 'with-btn' },
      el('div', { class: 'search grow' }, icon('search'), search),
      selectEl([['name', 'Nach Name'], ['wert', 'Nach Wert'], ['menge', 'Nach Menge']], f.sort, { class: 'sort', 'aria-label': 'Sortieren nach', onchange: (e) => { f.sort = e.target.value; draw(); } })),
    body);
}

// Tabelle auf breiten Bildschirmen, Karten auf dem Handy – gleiche Zeilen, CSS entscheidet
function list(rows) {
  return el('table', { class: 'inv-table' },
    el('thead', null, el('tr', null, el('th', { text: 'Artikel' }), el('th', { text: 'Besitzer' }), el('th', { class: 'r', text: 'Menge' }),
      el('th', { class: 'r', text: 'Einzelwert (Ø)' }), el('th', { class: 'r', text: 'Gesamtwert' }))),
    el('tbody', null, rows.map((r) => el('tr', { onclick: (e) => { if (!e.target.closest('a')) go('#artikel/' + r.item.id); } },
      el('td', { class: 'c-name' },
        el('a', { href: '#artikel/' + r.item.id, class: 'inv-name', text: r.item.name }),
        isLow(r.item) ? el('span', { class: 'badge warn', title: 'Unter Mindestbestand' }, icon('alert', 'xs'), ' wenig') : null,
        manName(r.item.manufacturer_id) ? el('span', { class: 'inv-man', text: manName(r.item.manufacturer_id) }) : null),
      el('td', { class: 'c-owner', text: memberName(r.owner_id) }),
      el('td', { class: 'c-qty r' }, el('span', { text: fmtQty(r.qty, r.item.unit) }), el('span', { class: 'u-m', text: r.unit == null ? '' : ` × ${fmtUnitMoney(r.unit)}` })),
      el('td', { class: 'c-unit r', text: fmtUnitMoney(r.unit) }),
      el('td', { class: 'c-value r', text: r.value == null ? '—' : fmtMoney(r.value) })))));
}

// ---------- Artikel-Detail ----------
export function itemDetail(r) {
  const id = r.parts[1];
  const i = S.D.items.get(id);
  if (!i) return el('div', null, topbar('Nicht gefunden', { back: '#bestand' }), empty('box', 'Diesen Artikel gibt es nicht mehr.'));
  const total = S.D.qty(id), unit = S.D.unitValue(id), c = catOf(i.category_id);
  const lots = S.D.lotsOf(id).sort((a, b) => memberName(a.owner_id).localeCompare(memberName(b.owner_id), 'de') || lotLabel(a).localeCompare(lotLabel(b), 'de'));
  const per = S.data.members.map((m) => [m, S.D.qty(id, m.id)]).filter(([, q]) => q > 0);
  const max = Math.max(...per.map(([, q]) => q), 1);
  const entries = S.D.entries.filter((e) => e.item_id === id);
  const q = `?item=${id}`;
  return el('div', null,
    topbar(i.name, { back: '#bestand', sub: [c?.name, manName(i.manufacturer_id)].filter(Boolean).join(' · ') + (i.archived ? ' · archiviert' : ''),
      actions: S.readonly ? [] : [iconBtn('edit', 'Bearbeiten', () => editItem(i)), iconBtn('archive', i.archived ? 'Wiederherstellen' : 'Archivieren', () => toggleArchive('artikel', i))] }),
    el('div', { class: 'kpis three-kpi' },
      kpi('Bestand', fmtQty(total, i.unit), i.min_qty != null ? `Minimum ${fmtQty(i.min_qty, i.unit)}` : null, isLow(i) ? 'warn' : ''),
      kpi('Einzelwert', unit == null ? '—' : fmtUnitMoney(unit), unit == null ? 'noch kein Wert' : `Ø je ${i.unit}`),
      kpi('Gesamtwert', unit == null ? '—' : fmtMoney(total * unit))),
    S.readonly ? null : el('div', { class: 'quick' },
      el('a', { class: 'btn primary', href: '#plus/zugang' + q }, icon('plus'), 'Zugang'),
      el('a', { class: 'btn', href: '#plus/entnahme' + q }, icon('minus'), 'Entnahme'),
      el('a', { class: 'btn', href: '#plus/uebertrag' + q }, icon('swap'), 'Übertrag')),
    el('section', { class: 'card' },
      el('h2', { text: 'Wem gehört was?' }),
      per.length ? el('div', { class: 'split' }, per.map(([m, qq]) => el('div', { class: 'split-row' },
        el('span', { class: 'who', text: m.name }),
        el('span', { class: 'bar' }, el('span', { style: { width: `${(qq / max) * 100}%` } })),
        el('span', { class: 'num', text: qtyText(id, qq) + (unit == null ? '' : ` · ${fmtMoney(qq * unit)}`) })))) : el('p', { class: 'sub', text: 'Kein Bestand.' })),
    lots.length ? el('section', { class: 'card' },
      el('h2', { text: 'Nach Lagerort und Charge' }),
      el('table', { class: 'tbl' },
        el('thead', null, el('tr', null, el('th', { text: 'Person' }), el('th', { text: 'Lagerort' }), el('th', { text: 'Charge' }), el('th', { class: 'r', text: 'Menge' }))),
        el('tbody', null, lots.map((l) => el('tr', null,
          el('td', { text: memberName(l.owner_id) }), el('td', { text: locName(l.location_id) }), el('td', { text: l.batch || '–' }), el('td', { class: 'r nowrap', text: qtyText(id, l.qty) })))))) : null,
    el('section', { class: 'card' },
      el('h2', { text: 'Angaben' }),
      el('dl', { class: 'kv' }, [
        ['Kategorie', c?.name], ['Hersteller', manName(i.manufacturer_id)], ['Artikelnummer', i.sku], ['EAN / Barcode', i.ean], ['Einheit', i.unit],
        ['Standard-Lagerort', i.default_location_id ? locName(i.default_location_id) : null],
        ['Mindestbestand', i.min_qty != null ? fmtQty(i.min_qty, i.unit) : null], ['Notizen', i.notes],
      ].filter(([, v]) => v).map(([k, v]) => [el('dt', { text: k }), el('dd', { class: 'pre', text: v })]))),
    el('h2', { class: 'section', text: `Letzte Buchungen (${fmtNum(entries.length)})` }),
    entries.length ? entryList(entries.slice(0, 10)) : empty('list', 'Noch keine Buchungen.'),
    entries.length > 10 ? el('button', { class: 'btn block mt', onclick: () => { S.ui.hist = { person: '', item: id, type: '', text: '', limit: 60 }; go('#verlauf'); } }, 'Alle im Verlauf ansehen') : null);
}
