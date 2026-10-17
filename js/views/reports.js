// Berichte (drucken / PDF), Exporte, Datensicherung und globale Suche
import { S, reload, go, isDemo, memberName, itemName, qtyText, locName, supName, catOf } from '../store.js';
import { el, icon, topbar, fmtMoney, fmtDate, today, toast, empty, confirmBox } from '../ui.js';
import { canScan, scanBarcode } from '../scanner.js';
import { exportStockCSV, exportMovementsCSV, exportSettleCSV, exportMasterCSV, backupJSON } from '../exports.js';
import { TYPES, thumb } from './masterdata.js';
import { entrySummary } from './history.js';

export function reports() {
  const row = (ic, title, sub, onclick, href) => el('li', null,
    el(href ? 'a' : 'button', { class: 'row link', type: href ? null : 'button', href, onclick },
      el('span', { class: 'menu-ic' }, icon(ic)),
      el('span', { class: 'grow' }, el('strong', { class: 'block', text: title }), sub ? el('span', { class: 'sub', text: sub }) : null),
      icon(href ? 'right' : 'download')));
  const fileIn = el('input', { type: 'file', accept: 'application/json,.json', class: 'file-hidden', id: 'import-file', onchange: importFile });
  return el('div', null,
    topbar('Berichte & Export', { back: '#mehr' }),
    el('h2', { class: 'section', text: 'Drucken oder als PDF speichern' }),
    el('ul', { class: 'card list menu' },
      row('print', 'Bestandsliste', 'Alles, was da ist – je Person, Lagerort und Charge', null, '#bericht/bestand'),
      row('print', 'Verlauf', 'Alle Buchungen (mit den Filtern aus dem Verlauf)', null, '#bericht/verlauf'),
      row('print', 'Abrechnung', 'Kontostände, Ausgleich, Zahlungen', null, '#bericht/abrechnung')),
    el('h2', { class: 'section', text: 'Für Excel (CSV)' }),
    el('ul', { class: 'card list menu' },
      row('file', 'Bestand', null, exportStockCSV),
      row('file', 'Alle Buchungen', null, () => exportMovementsCSV()),
      row('file', 'Abrechnung', null, exportSettleCSV),
      ...Object.values(TYPES).map((T) => row('file', T.title, null, () => exportMasterCSV(T.table, T.title, T.csv)))),
    el('h2', { class: 'section', text: 'Datensicherung' }),
    el('ul', { class: 'card list menu' },
      row('database', 'Komplette Sicherung herunterladen', 'Alle Daten als JSON-Datei', backupJSON),
      isDemo() ? el('li', null, el('label', { class: 'row link', for: 'import-file' },
        el('span', { class: 'menu-ic' }, icon('upload')),
        el('span', { class: 'grow' }, el('strong', { class: 'block', text: 'Sicherung einspielen (nur Demo)' }), el('span', { class: 'sub', text: 'Ersetzt die Demo-Daten durch eine Sicherung' })),
        icon('upload')), fileIn) : null),
    isDemo() ? null : el('p', { class: 'sub', text: 'Tipp: Supabase sichert eure Datenbank zusätzlich selbst. Eine eigene Sicherung ab und zu schadet trotzdem nicht.' }));
}

async function importFile(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const json = JSON.parse(await f.text());
    if (!await confirmBox('Die aktuellen Demo-Daten werden durch die Sicherung ersetzt.', { ok: 'Einspielen', danger: true })) return;
    S.backend.importDemo(json);
    await reload();
    toast('Sicherung eingespielt.');
    go('#uebersicht');
  } catch (ex) { toast('Datei konnte nicht gelesen werden: ' + (ex.message || ex), true); }
}

// ---------- Druckansichten ----------
export function report(r) {
  const kind = r.parts[1];
  const titles = { bestand: 'Bestandsliste', verlauf: 'Verlauf', abrechnung: 'Abrechnung' };
  const title = titles[kind] || 'Bericht';
  const back = { bestand: '#bestand', verlauf: '#verlauf', abrechnung: '#abrechnung' }[kind] || '#berichte';
  const body = kind === 'bestand' ? stockReport() : kind === 'verlauf' ? historyReport() : kind === 'abrechnung' ? settleReport() : empty('print', 'Unbekannter Bericht.');
  return el('div', { class: 'report' },
    el('div', { class: 'no-print' },
      topbar(title, { back, sub: 'Druckansicht' }),
      el('button', { class: 'btn primary block', onclick: () => window.print() }, icon('print'), 'Drucken / als PDF speichern'),
      el('p', { class: 'sub mt', text: 'Zum Speichern als PDF im Druckdialog „Als PDF sichern“ bzw. „Speichern als PDF“ wählen.' })),
    el('header', { class: 'report-head' },
      el('h1', { text: title }),
      el('p', { class: 'sub', text: `Stand ${fmtDate(today())} · erstellt von ${S.me.name}` })),
    body);
}

function stockReport() {
  const items = S.data.items.filter((i) => S.D.qty(i.id) > 0 || !i.archived).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  let grand = 0;
  const rows = [];
  for (const i of items) {
    const lots = S.D.lotsOf(i.id).sort((a, b) => memberName(a.owner_id).localeCompare(memberName(b.owner_id)));
    const p = S.D.avgPrice(i.id);
    const total = S.D.qty(i.id);
    grand += S.D.value(i.id);
    rows.push(el('tr', { class: 'grp' }, el('td', { colspan: 4 }, el('strong', { text: i.name }), i.sku ? ` · ${i.sku}` : ''),
      el('td', { class: 'r', text: qtyText(i.id, total) }), el('td', { class: 'r', text: p == null ? '–' : fmtMoney(S.D.value(i.id)) })));
    for (const l of lots) rows.push(el('tr', null, el('td'), el('td', { text: memberName(l.owner_id) }), el('td', { text: locName(l.location_id) }), el('td', { text: l.batch || '–' }),
      el('td', { class: 'r', text: qtyText(i.id, l.qty) }), el('td', { class: 'r', text: p == null ? '' : fmtMoney(p * l.qty) })));
  }
  return el('div', null,
    el('table', { class: 'tbl print-tbl' },
      el('thead', null, el('tr', null, ['Artikel', 'Person', 'Lagerort', 'Charge'].map((h) => el('th', { text: h })), el('th', { class: 'r', text: 'Menge' }), el('th', { class: 'r', text: 'Wert' }))),
      el('tbody', null, rows),
      el('tfoot', null, el('tr', null, el('td', { colspan: 5, text: 'Gesamtwert (zum Ø Einkaufspreis)' }), el('td', { class: 'r', text: fmtMoney(grand) })))));
}

function historyReport() {
  const f = S.ui.hist || {};
  const entries = S.D.entries.filter((e) => (!f.person || e.owners.includes(f.person) || e.paid_by === f.person) && (!f.item || e.item_id === f.item) && (!f.type || e.type === f.type || (f.type === 'korrektur' && e.reason === 'korrektur')));
  const filt = [f.person ? `Person: ${memberName(f.person)}` : null, f.item ? `Artikel: ${itemName(f.item)}` : null].filter(Boolean).join(' · ');
  return el('div', null,
    filt ? el('p', { class: 'sub', text: 'Filter: ' + filt }) : null,
    el('table', { class: 'tbl print-tbl' },
      el('thead', null, el('tr', null, ['Datum', 'Artikel', 'Vorgang'].map((h) => el('th', { text: h })), el('th', { class: 'r', text: 'Menge' }), el('th', { class: 'r', text: 'Preis' }))),
      el('tbody', null, entries.slice(0, 2000).map((e) => el('tr', null,
        el('td', { class: 'nowrap', text: fmtDate(e.date) }),
        el('td', { text: itemName(e.item_id) }),
        el('td', null, entrySummary(e), [e.batch ? ` · Charge ${e.batch}` : '', e.invoice_no ? ` · RE ${e.invoice_no}` : '', e.supplier_id ? ` · ${supName(e.supplier_id)}` : '', e.note ? ` · ${e.note}` : ''].join('')),
        el('td', { class: 'r nowrap', text: (e.type === 'abgang' ? '−' : e.type === 'kauf' || e.type === 'zugang' ? '+' : '') + qtyText(e.item_id, e.qty) }),
        el('td', { class: 'r nowrap', text: e.price != null ? fmtMoney(e.price) : '' }))))),
    el('p', { class: 'sub', text: `${entries.length} Einträge` }));
}

function settleReport() {
  const L = S.D.ledger;
  return el('div', null,
    el('h2', { text: 'Kontostand' }),
    el('table', { class: 'tbl print-tbl' },
      el('thead', null, el('tr', null, el('th', { text: 'Person' }), el('th', { class: 'r', text: 'Bezahlt' }), el('th', { class: 'r', text: 'Anteil' }), el('th', { class: 'r', text: 'Saldo' }))),
      el('tbody', null, S.data.members.map((m) => el('tr', null, el('td', { text: m.name }),
        el('td', { class: 'r', text: fmtMoney(L.spent.get(m.id) || 0) }), el('td', { class: 'r', text: fmtMoney(L.share.get(m.id) || 0) }),
        el('td', { class: 'r', text: fmtMoney(L.net.get(m.id) || 0) }))))),
    el('h2', { text: 'Zum Ausgleichen' }),
    L.plan.length ? el('ul', null, L.plan.map((p) => el('li', { text: `${memberName(p.from)} zahlt ${memberName(p.to)} ${fmtMoney(p.amount)}` }))) : el('p', { text: 'Alles ausgeglichen.' }),
    el('h2', { text: 'Bisherige Ausgleichszahlungen' }),
    S.data.settlements.length ? el('table', { class: 'tbl print-tbl' },
      el('thead', null, el('tr', null, ['Datum', 'Von', 'An', 'Notiz'].map((h) => el('th', { text: h })), el('th', { class: 'r', text: 'Betrag' }))),
      el('tbody', null, S.data.settlements.map((s) => el('tr', null, el('td', { text: fmtDate(s.happened_on) }), el('td', { text: memberName(s.from_member) }),
        el('td', { text: memberName(s.to_member) }), el('td', { text: s.note || '' }), el('td', { class: 'r', text: fmtMoney(s.amount) }))))) : el('p', { text: 'Keine.' }));
}

// ---------- Globale Suche ----------
export function search() {
  const st = (S.ui.search ||= { text: '' });
  const input = el('input', { type: 'search', placeholder: 'Name, Nummer, EAN, Charge, Rechnung …', value: st.text, autofocus: true, enterkeyhint: 'search', 'aria-label': 'Suchen' });
  const out = el('div');
  const draw = () => {
    st.text = input.value.trim();
    const t = st.text.toLowerCase();
    if (t.length < 2) { out.replaceChildren(el('p', { class: 'sub center mt', text: 'Mindestens 2 Zeichen eingeben.' })); return; }
    const has = (...vals) => vals.some((v) => v && String(v).toLowerCase().includes(t));
    const items = S.data.items.filter((i) => has(i.name, i.sku, i.ean, i.notes));
    const mans = S.data.manufacturers.filter((x) => has(x.name, x.country, x.notes));
    const sups = S.data.suppliers.filter((x) => has(x.name, x.customer_no, x.email, x.phone, x.address, x.notes));
    const locs = S.data.locations.filter((x) => has(x.name, x.description));
    const cats = S.data.categories.filter((x) => has(x.name));
    const batches = new Map();
    const invoices = new Map();
    for (const m of S.data.movements) {
      if (m.batch && m.batch.toLowerCase().includes(t)) batches.set(`${m.item_id}|${m.batch}`, m);
      if (m.invoice_no && m.invoice_no.toLowerCase().includes(t)) invoices.set(`${m.invoice_no}|${m.item_id}`, m);
    }
    const sec = (title, arr, render) => (arr.length ? [el('h2', { class: 'section', text: `${title} (${arr.length})` }), el('ul', { class: 'card list' }, arr.slice(0, 30).map(render))] : []);
    const link = (href, main, sub, left, right) => el('li', null, el('a', { class: 'row link', href }, left || null,
      el('span', { class: 'grow' }, el('strong', { class: 'block ellipsis', text: main }), sub ? el('span', { class: 'sub block ellipsis', text: sub }) : null),
      right ? el('span', { class: 'sub nowrap', text: right }) : null, icon('right')));
    const res = [
      ...sec('Artikel', items, (i) => link('#artikel/' + i.id, i.name, [i.sku, i.ean, catOf(i.category_id)?.name].filter(Boolean).join(' · '), thumb(i), qtyText(i.id, S.D.qty(i.id)))),
      ...sec('Chargen', [...batches.values()], (m) => link('#artikel/' + m.item_id, `Charge ${m.batch}`, itemName(m.item_id))),
      ...sec('Rechnungen', [...invoices.values()], (m) => link('#artikel/' + m.item_id, `Rechnung ${m.invoice_no}`, `${itemName(m.item_id)} · ${fmtDate(m.happened_on)} · ${supName(m.supplier_id)}`)),
      ...sec('Hersteller', mans, (x) => link('#stammdaten/hersteller/' + x.id, x.name, x.country)),
      ...sec('Händler', sups, (x) => link('#stammdaten/haendler/' + x.id, x.name, x.customer_no ? `Kd.-Nr. ${x.customer_no}` : x.email)),
      ...sec('Lagerorte', locs, (x) => link('#stammdaten/lagerorte/' + x.id, x.name, x.description)),
      ...sec('Kategorien', cats, (x) => link('#stammdaten/kategorien/' + x.id, x.name)),
    ];
    out.replaceChildren(...(res.length ? res : [empty('search', `Nichts gefunden für „${st.text}“.`)]));
  };
  let tmr;
  input.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(draw, 150); });
  draw();
  setTimeout(() => input.focus(), 50);
  return el('div', null,
    topbar('Suche', { back: '#mehr' }),
    el('div', { class: 'with-btn' },
      el('div', { class: 'search grow' }, icon('search'), input),
      canScan() ? el('button', { class: 'icon-btn', 'aria-label': 'Barcode scannen', onclick: async () => { const c = await scanBarcode(); if (c) { input.value = c; draw(); } } }, icon('scan')) : null),
    out);
}
