// Inventur: Artikel der Reihe nach zählen, Unterschiede automatisch als Korrektur buchen
import { S, run, go, memberName, qtyText, locName, activeMembers, activeOf, optionsOf, lotLabel, itemOf } from '../store.js';
import { el, icon, topbar, fmtDate, parseNum, round3, selectEl, field, today, confirmBox } from '../ui.js';
import { lotKey } from '../calc.js';
import { thumb } from './masterdata.js';

export function inventory() {
  const st = (S.ui.inv ||= { step: 'setup', loc: '', person: '', withEmpty: false, items: [], idx: 0, counts: {}, extra: [], date: today(), result: null });
  const head = topbar('Inventur', { back: '#mehr', sub: 'Zählen, vergleichen, korrigieren' });
  if (S.readonly) return el('div', null, head, el('div', { class: 'info', text: 'Inventur geht nur mit Internet.' }));
  if (st.step === 'count') return el('div', null, head, countStep(st));
  if (st.step === 'summary') return el('div', null, head, summaryStep(st));
  if (st.step === 'done') return el('div', null, head, doneStep(st));
  return el('div', null, head, setupStep(st));
}

const lotsFor = (st, itemId) => S.D.lotsOf(itemId)
  .filter((l) => (!st.loc || l.location_id === st.loc) && (!st.person || l.owner_id === st.person))
  .sort((a, b) => memberName(a.owner_id).localeCompare(memberName(b.owner_id)) || lotLabel(a).localeCompare(lotLabel(b)));

function setupStep(st) {
  const items = () => activeOf('items').filter((i) => st.withEmpty || lotsFor(st, i.id).length).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const count = el('p', { class: 'sub' });
  const upd = () => { count.textContent = `${items().length} Artikel werden gezählt.`; };
  upd();
  return el('div', null,
    el('div', { class: 'card' },
      el('h2', { text: 'So geht\'s' }),
      el('ol', { class: 'steps' },
        el('li', { text: 'Auswählen, was gezählt wird (z. B. nur ein Lagerort).' }),
        el('li', { text: 'Artikel für Artikel die tatsächliche Menge eintragen. Vorausgefüllt ist, was laut App da sein sollte.' }),
        el('li', { text: 'Am Ende siehst du alle Unterschiede und kannst sie mit einem Tipp als Korrektur buchen.' }))),
    el('div', { class: 'card' },
      field('Lagerort', selectEl([['', 'Alle Lagerorte'], ...activeOf('locations').map((l) => [l.id, l.name])], st.loc, { onchange: (e) => { st.loc = e.target.value; upd(); } })),
      field('Person', selectEl([['', 'Alle Personen'], ...activeMembers().map((m) => [m.id, m.name])], st.person, { onchange: (e) => { st.person = e.target.value; upd(); } })),
      field('Datum der Inventur', el('input', { type: 'date', value: st.date, max: today(), onchange: (e) => { st.date = e.target.value || today(); } })),
      el('label', { class: 'checkrow' }, el('input', { type: 'checkbox', checked: st.withEmpty, onchange: (e) => { st.withEmpty = e.target.checked; upd(); } }),
        el('span', { text: 'Auch Artikel ohne Bestand anzeigen (falls doch etwas gefunden wird)' })),
      count,
      el('button', { class: 'btn primary block mt', onclick: () => {
        const list = items();
        if (!list.length) return;
        Object.assign(st, { step: 'count', items: list.map((i) => i.id), idx: 0, counts: {}, extra: [], result: null });
        go('#inventur');
      } }, icon('clipboard'), 'Inventur starten')));
}

function countStep(st) {
  const itemId = st.items[st.idx];
  const it = itemOf(itemId);
  if (!it) { st.step = 'summary'; return summaryStep(st); }
  const lots = lotsFor(st, itemId);
  const pct = Math.round(((st.idx + 1) / st.items.length) * 100);
  const extras = st.extra.filter((x) => x.item_id === itemId);
  const members = activeMembers();

  const lotRow = (l) => {
    const k = lotKey(l.item_id, l.owner_id, l.location_id, l.batch);
    if (st.counts[k] == null) st.counts[k] = String(round3(l.qty)).replace('.', ',');
    const inp = el('input', { type: 'text', inputmode: 'decimal', value: st.counts[k], 'aria-label': `Gezählt: ${lotLabel(l)}`, onfocus: (e) => e.target.select(), oninput: (e) => { st.counts[k] = e.target.value; mark(); } });
    const diff = el('span', { class: 'inv-diff' });
    const mark = () => {
      const c = parseNum(st.counts[k]);
      const d = c == null || Number.isNaN(c) ? null : round3(c - l.qty);
      diff.textContent = d == null ? '?' : d === 0 ? '✓' : (d > 0 ? '+' : '') + String(d).replace('.', ',');
      diff.className = 'inv-diff ' + (d == null ? 'bad' : d === 0 ? 'ok' : 'chg');
    };
    mark();
    return el('div', { class: 'inv-row' },
      el('div', { class: 'grow' }, el('strong', { class: 'block', text: memberName(l.owner_id) }), el('span', { class: 'sub', text: `${lotLabel(l)} · Soll ${qtyText(itemId, l.qty)}` })),
      el('div', { class: 'with-unit inv-in' }, inp, el('span', { class: 'unit', text: it.unit })), diff);
  };

  const extraRow = (x) => el('div', { class: 'inv-extra card' },
    el('div', { class: 'two' },
      field('Person', selectEl(members.map((m) => [m.id, m.name]), x.owner_id, { onchange: (e) => { x.owner_id = e.target.value; } })),
      field('Lagerort', selectEl(optionsOf('locations', '— ohne —'), x.location_id, { onchange: (e) => { x.location_id = e.target.value; } }))),
    el('div', { class: 'two' },
      field('Charge', el('input', { type: 'text', value: x.batch || '', maxlength: 60, oninput: (e) => { x.batch = e.target.value; } })),
      field('Gefunden', el('div', { class: 'with-unit' }, el('input', { type: 'text', inputmode: 'decimal', value: x.qty || '', oninput: (e) => { x.qty = e.target.value; } }), el('span', { class: 'unit', text: it.unit })))),
    el('button', { class: 'btn small danger', onclick: () => { st.extra = st.extra.filter((y) => y !== x); go('#inventur'); } }, icon('trash'), 'Entfernen'));

  return el('div', null,
    el('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, el('span', { style: { width: pct + '%' } })),
    el('p', { class: 'sub center', text: `Artikel ${st.idx + 1} von ${st.items.length}` }),
    el('div', { class: 'card' },
      el('div', { class: 'item-head' }, thumb(it), el('div', { class: 'grow' }, el('div', { class: 'item-name', text: it.name }), el('div', { class: 'sub', text: [it.sku, it.ean].filter(Boolean).join(' · ') }))),
      lots.length ? el('div', { class: 'mt' }, lots.map(lotRow)) : el('p', { class: 'sub mt', text: 'Laut App ist hiervon nichts da.' }),
      extras.map(extraRow),
      el('button', { class: 'btn small mt', onclick: () => {
        st.extra.push({ item_id: itemId, owner_id: st.person || S.me.id, location_id: st.loc || it.default_location_id || '', batch: '', qty: '' });
        go('#inventur');
      } }, icon('plus'), 'Weiteren Posten gefunden')),
    el('div', { class: 'actions mt' },
      el('button', { class: 'btn', disabled: st.idx === 0, onclick: () => { st.idx--; go('#inventur'); } }, icon('left'), 'Zurück'),
      el('button', { class: 'btn primary', onclick: () => {
        if (st.idx < st.items.length - 1) { st.idx++; go('#inventur'); } else { st.step = 'summary'; go('#inventur'); }
      } }, st.idx < st.items.length - 1 ? 'Weiter' : 'Fertig gezählt', icon('right'))),
    el('div', { class: 'center' }, el('button', { class: 'linkbtn', text: 'Inventur abbrechen', onclick: async () => {
      if (await confirmBox('Inventur abbrechen? Die gezählten Werte gehen verloren.', { ok: 'Abbrechen', danger: true, title: 'Abbrechen?' })) { S.ui.inv = null; go('#inventur'); }
    } })));
}

function diffs(st) {
  const out = [];
  const bad = [];
  for (const itemId of st.items) {
    for (const l of lotsFor(st, itemId)) {
      const k = lotKey(l.item_id, l.owner_id, l.location_id, l.batch);
      if (st.counts[k] == null) continue;
      const c = parseNum(st.counts[k]);
      if (c == null || Number.isNaN(c) || c < 0) { bad.push(`${itemOf(itemId)?.name} (${lotLabel(l)})`); continue; }
      const d = round3(c - l.qty);
      if (d !== 0) out.push({ item_id: itemId, owner_id: l.owner_id, location_id: l.location_id, batch: l.batch, soll: l.qty, ist: c, diff: d });
    }
  }
  for (const x of st.extra) {
    const q = parseNum(x.qty);
    if (!q) continue;
    if (Number.isNaN(q) || q < 0) { bad.push(`${itemOf(x.item_id)?.name} (zusätzlicher Posten)`); continue; }
    const batch = (x.batch || '').trim() || null;
    const existing = S.D.lots.get(lotKey(x.item_id, x.owner_id, x.location_id || null, batch));
    const soll = existing?.qty || 0;
    out.push({ item_id: x.item_id, owner_id: x.owner_id, location_id: x.location_id || null, batch, soll, ist: soll + q, diff: q, extra: true });
  }
  return { out, bad };
}

function summaryStep(st) {
  const { out, bad } = diffs(st);
  return el('div', null,
    el('div', { class: 'card' },
      el('h2', { text: 'Zusammenfassung' }),
      el('p', { class: 'sub', text: `${st.items.length} Artikel gezählt · Stichtag ${fmtDate(st.date)}` }),
      bad.length ? el('div', { class: 'error', text: 'Bitte prüfen (keine gültige Zahl): ' + bad.join(', ') }) : null,
      out.length ? el('table', { class: 'tbl mt' },
        el('thead', null, el('tr', null, el('th', { text: 'Artikel / Posten' }), el('th', { class: 'r', text: 'Soll' }), el('th', { class: 'r', text: 'Ist' }), el('th', { class: 'r', text: 'Diff.' }))),
        el('tbody', null, out.map((d) => el('tr', null,
          el('td', null, el('strong', { class: 'block', text: itemOf(d.item_id)?.name }), el('span', { class: 'sub', text: `${memberName(d.owner_id)} · ${locName(d.location_id)}${d.batch ? ' · ' + d.batch : ''}` })),
          el('td', { class: 'r nowrap', text: String(round3(d.soll)).replace('.', ',') }),
          el('td', { class: 'r nowrap', text: String(round3(d.ist)).replace('.', ',') }),
          el('td', { class: 'r nowrap ' + (d.diff > 0 ? 'pos-t' : 'neg-t'), text: (d.diff > 0 ? '+' : '') + String(d.diff).replace('.', ',') })))))
        : bad.length ? null : el('p', { class: 'ok-line' }, icon('check'), ' Alles stimmt – keine Unterschiede.')),
    el('div', { class: 'actions mt' },
      el('button', { class: 'btn', onclick: () => { st.step = 'count'; st.idx = st.items.length - 1; go('#inventur'); } }, icon('left'), 'Zurück'),
      out.length
        ? el('button', { class: 'btn primary', disabled: bad.length > 0, onclick: async (e) => {
          e.currentTarget.disabled = true;
          const rows = out.map((d) => ({
            item_id: d.item_id, owner_id: d.owner_id, kind: d.diff > 0 ? 'in' : 'out', qty: Math.abs(d.diff), happened_on: st.date,
            reason: 'korrektur', location_id: d.location_id, batch: d.batch, note: `Inventur ${fmtDate(st.date)}`,
          }));
          const ok = await run(() => S.backend.bookMovements(rows), `${rows.length} Korrektur${rows.length === 1 ? '' : 'en'} gebucht.`);
          if (ok) { st.result = out; st.step = 'done'; go('#inventur'); } else e.currentTarget.disabled = false;
        } }, icon('check'), `${out.length} Korrektur${out.length === 1 ? '' : 'en'} buchen`)
        : el('button', { class: 'btn primary', disabled: bad.length > 0, onclick: () => { st.result = []; st.step = 'done'; go('#inventur'); } }, 'Abschließen')));
}

function doneStep(st) {
  const n = st.result?.length || 0;
  return el('div', null,
    el('div', { class: 'card center' },
      el('div', { class: 'big-check' }, icon('check')),
      el('h2', { text: 'Inventur abgeschlossen' }),
      el('p', { text: n ? `${n} Korrektur${n === 1 ? '' : 'en'} gebucht. Du findest sie im Verlauf unter „Korrekturen“.` : 'Es gab keine Unterschiede.' })),
    el('div', { class: 'actions mt' },
      el('button', { class: 'btn', onclick: () => { S.ui.hist = { person: '', item: '', type: 'korrektur', text: '', limit: 60 }; go('#verlauf'); } }, 'Im Verlauf ansehen'),
      el('button', { class: 'btn primary', onclick: () => { S.ui.inv = null; go('#uebersicht'); } }, 'Fertig')));
}
