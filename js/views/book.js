// Buchen: Einkauf, Abgang, Übertragen
import { S, run, go, memberName, qtyText, unitOf, activeMembers, activeOf, optionsOf, lotLabel, itemOf } from '../store.js';
import { el, icon, topbar, fmtMoney, fmtQty, parseNum, today, round3, selectEl, field, toast, confirmBox } from '../ui.js';
import { splitPrice, lotKey, EPS } from '../calc.js';
import { canScan, scanBarcode } from '../scanner.js';
import { editItem, editRecord } from './masterdata.js';

const TABS = [['einkauf', 'Einkauf'], ['abgang', 'Abgang'], ['uebertrag', 'Übertragen']];

export function book(r) {
  const tab = TABS.some(([k]) => k === r.parts[1]) ? r.parts[1] : 'einkauf';
  const B = (S.ui.book ||= {});
  const st = (B[tab] ||= freshState(tab));
  if (r.q.item && st._preset !== r.key) {
    st._preset = r.key;
    st.item_id = r.q.item;
    if (tab === 'einkauf') st.location_id = itemOf(r.q.item)?.default_location_id || st.location_id;
    else st.lot = '';
  }
  if (r.q.owner && tab !== 'einkauf') { st.owner = r.q.owner; st.from = r.q.owner; }

  const head = el('div', null,
    topbar('Buchen'),
    el('div', { class: 'seg', role: 'tablist' }, TABS.map(([k, label]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', text: label, onclick: () => go('#buchen/' + k) }))));
  if (S.readonly) return el('div', null, head, el('div', { class: 'info', text: 'Du bist offline. Buchen geht erst wieder mit Internet.' }));
  if (!activeMembers().length) return el('div', null, head, el('div', { class: 'info', text: 'Es gibt noch keine Personen.' }));
  const form = tab === 'einkauf' ? purchaseForm(st) : tab === 'abgang' ? outForm(st) : transferForm(st);
  return el('div', null, head, form);
}

function freshState(tab) {
  const me = S.me?.id;
  const base = { item_id: '', date: today(), qty: '', note: '' };
  if (tab === 'einkauf') return { ...base, price: '', paid_by: me, supplier_id: '', location_id: '', batch: '', invoice_no: '', mode: 'one', owner: me, splits: {} };
  if (tab === 'abgang') return { ...base, owner: me, lot: '', reason: 'verbrauch', price: '' };
  return { ...base, from: me, lot: '', to: activeMembers().find((m) => m.id !== me)?.id || me, to_location: '' };
}

// Eingabefeld mit Zustand verbinden
function bind(st, key, node, onChange) {
  node.value = st[key] ?? '';
  node.addEventListener(node.tagName === 'SELECT' ? 'change' : 'input', () => { st[key] = node.value; onChange && onChange(); });
  return node;
}
const numInput = (props = {}) => el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', ...props });

function itemPicker(st, onChange, { withStock } = {}) {
  const opts = [['', '— Artikel wählen —'], ...activeOf('items').sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((i) => [i.id, withStock ? `${i.name} (${fmtQty(S.D.qty(i.id), i.unit)})` : i.name])];
  const sel = bind(st, 'item_id', selectEl(opts, st.item_id, { 'aria-label': 'Artikel' }), onChange);
  return el('label', { class: 'field' },
    el('span', { class: 'lbl', text: 'Artikel *' }),
    el('div', { class: 'with-btn' }, sel,
      canScan() ? el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Barcode scannen', onclick: async (e) => {
        e.preventDefault();
        const code = await scanBarcode();
        if (!code) return;
        const hit = S.data.items.find((i) => i.ean === code && !i.archived);
        if (hit) { st.item_id = hit.id; sel.value = hit.id; onChange && onChange(); toast(`Gefunden: ${hit.name}`); return; }
        if (await confirmBox(`Kein Artikel mit dem Barcode ${code}. Neuen Artikel anlegen?`, { ok: 'Anlegen', title: 'Unbekannter Barcode' })) {
          const saved = await editItem(null, { ean: code });
          if (saved) { st.item_id = saved.id; go(location.hash); }
        }
      } }, icon('scan')) : null,
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Neuer Artikel', title: 'Neuer Artikel', onclick: async (e) => {
        e.preventDefault();
        const saved = await editItem(null);
        if (saved) { st.item_id = saved.id; if ('location_id' in st) st.location_id = saved.default_location_id || st.location_id; go(location.hash); }
      } }, icon('plus'))));
}

function pickWithAdd(label, st, key, table, typeKey, emptyLabel) {
  const sel = bind(st, key, selectEl(optionsOf(table, emptyLabel), st[key]));
  return el('label', { class: 'field' }, el('span', { class: 'lbl', text: label }),
    el('div', { class: 'with-btn' }, sel,
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Neu anlegen', title: 'Neu anlegen', onclick: async (e) => {
        e.preventDefault();
        const saved = await editRecord(typeKey);
        if (saved) { st[key] = saved.id; go(location.hash); }
      } }, icon('plus'))));
}

function errorBox() { return el('div', { class: 'error', hidden: true, role: 'alert' }); }
function showErr(box, msg) { box.textContent = msg; box.hidden = false; box.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

// ---------------------------------------------------------------------
//  Einkauf
// ---------------------------------------------------------------------
function purchaseForm(st) {
  const err = errorBox();
  const unitLbls = [];
  const unitLbl = () => { const u = el('span', { class: 'unit', text: unitOf(st.item_id) }); unitLbls.push(u); return u; };
  const splitBox = el('div');
  const preview = el('div', { class: 'cost-preview' });

  const update = () => {
    unitLbls.forEach((u) => { u.textContent = unitOf(st.item_id); });
    drawSplit();
    drawPreview();
  };

  const members = activeMembers();
  function drawSplit() {
    if (st.mode === 'one') {
      splitBox.replaceChildren(field('Gehört', bind(st, 'owner', selectEl(members.map((m) => [m.id, m.id === S.me.id ? `${m.name} (ich)` : m.name]), st.owner), drawPreview)));
      return;
    }
    const total = parseNum(st.qty);
    const sum = members.reduce((s, m) => s + (parseNum(st.splits[m.id]) || 0), 0);
    const okSum = total != null && !Number.isNaN(total) && Math.abs(sum - total) < 1e-6;
    const sumEl = el('div', { class: 'split-sum ' + (okSum ? 'ok' : 'bad') },
      total ? `Verteilt: ${fmtQty(round3(sum), unitOf(st.item_id))} von ${fmtQty(total, unitOf(st.item_id))}` + (okSum ? ' ✓' : (sum < total ? ` – noch ${fmtQty(round3(total - sum), unitOf(st.item_id))}` : ' – zu viel')) : 'Erst oben die Gesamtmenge eintragen.');
    splitBox.replaceChildren(el('div', { class: 'split-box' },
      members.map((m) => {
        const inp = numInput({ value: st.splits[m.id] ?? '', placeholder: '0', 'aria-label': `Menge für ${m.name}` });
        inp.addEventListener('input', () => { st.splits[m.id] = inp.value; refreshSum(); drawPreview(); });
        return el('div', { class: 'split-line' }, el('span', { class: 'ellipsis', text: m.name + (m.id === S.me.id ? ' (ich)' : '') }), el('div', { class: 'with-unit' }, inp, unitLbl()));
      }),
      el('div', { class: 'row-actions' }, sumEl,
        el('button', { type: 'button', class: 'btn small', text: 'Gleich verteilen', onclick: () => {
          const t = parseNum(st.qty);
          if (!t || Number.isNaN(t)) return showErr(err, 'Bitte zuerst die Gesamtmenge eintragen.');
          const each = Math.floor((t / members.length) * 1000) / 1000;
          members.forEach((m, i) => { st.splits[m.id] = String(i === members.length - 1 ? round3(t - each * (members.length - 1)) : each).replace('.', ','); });
          drawSplit(); drawPreview();
        } }))));
    function refreshSum() {
      const s2 = members.reduce((s, m) => s + (parseNum(st.splits[m.id]) || 0), 0);
      const ok2 = total != null && Math.abs(s2 - total) < 1e-6;
      sumEl.className = 'split-sum ' + (ok2 ? 'ok' : 'bad');
      sumEl.textContent = total ? `Verteilt: ${fmtQty(round3(s2), unitOf(st.item_id))} von ${fmtQty(total, unitOf(st.item_id))}` + (ok2 ? ' ✓' : (s2 < total ? ` – noch ${fmtQty(round3(total - s2), unitOf(st.item_id))}` : ' – zu viel')) : 'Erst oben die Gesamtmenge eintragen.';
    }
  }

  function currentSplits() {
    if (st.mode === 'one') return [{ owner_id: st.owner, qty: parseNum(st.qty) }];
    return members.map((m) => ({ owner_id: m.id, qty: parseNum(st.splits[m.id]) })).filter((s) => s.qty > 0);
  }

  function drawPreview() {
    const price = parseNum(st.price);
    const splits = currentSplits().filter((s) => s.qty > 0 && !Number.isNaN(s.qty));
    if (!price || Number.isNaN(price) || !splits.length) { preview.replaceChildren(); return; }
    const parts = splitPrice(price, splits.map((s) => s.qty));
    const lines = splits.map((s, i) => ({ ...s, price: parts[i] }));
    const debts = lines.filter((l) => l.owner_id !== st.paid_by && l.price > 0);
    preview.replaceChildren(el('div', { class: 'info' },
      el('strong', { text: 'Kosten: ' }),
      lines.map((l) => `${memberName(l.owner_id)} ${fmtMoney(l.price)}`).join(' · '),
      el('br'),
      debts.length ? debts.map((l) => `${memberName(l.owner_id)} schuldet ${memberName(st.paid_by)} ${fmtMoney(l.price)}`).join(' · ') : 'Niemand schuldet jemandem etwas.'));
  }

  const qty = bind(st, 'qty', numInput({ placeholder: 'z. B. 500' }), () => { if (st.mode === 'split') drawSplit(); drawPreview(); });
  const price = bind(st, 'price', numInput({ placeholder: 'optional' }), drawPreview);
  const modeRow = el('div', { class: 'radio-row', role: 'radiogroup', 'aria-label': 'Aufteilung' },
    [['one', 'Gehört einer Person'], ['split', 'Aufteilen']].map(([v, l]) => el('label', null,
      el('input', { type: 'radio', name: 'mode', value: v, checked: st.mode === v, onchange: () => { st.mode = v; drawSplit(); drawPreview(); } }), l)));

  const submit = el('button', { type: 'submit', class: 'btn primary block' }, icon('check'), 'Einkauf speichern');
  const form = el('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.hidden = true;
    const total = parseNum(st.qty), pr = parseNum(st.price);
    if (!st.item_id) return showErr(err, 'Bitte einen Artikel wählen.');
    if (!total || Number.isNaN(total) || total <= 0) return showErr(err, 'Bitte eine Menge größer als 0 eintragen.');
    if (Number.isNaN(pr) || (pr != null && pr < 0)) return showErr(err, 'Der Preis ist keine gültige Zahl.');
    const splits = currentSplits();
    if (splits.some((s) => Number.isNaN(s.qty))) return showErr(err, 'Eine Menge bei der Aufteilung ist keine gültige Zahl.');
    if (!splits.length) return showErr(err, 'Bitte die Menge auf die Personen verteilen.');
    if (st.mode === 'split' && Math.abs(splits.reduce((s, x) => s + x.qty, 0) - total) > 1e-6) return showErr(err, 'Die Aufteilung ergibt nicht die Gesamtmenge.');
    if (!st.date) return showErr(err, 'Bitte ein Datum wählen.');
    submit.disabled = true;
    const okRun = await run(() => S.backend.bookPurchase({
      item_id: st.item_id, splits, happened_on: st.date, paid_by: pr != null ? st.paid_by : null, price_total: pr,
      location_id: st.location_id || null, supplier_id: st.supplier_id || null, batch: st.batch.trim() || null,
      invoice_no: st.invoice_no.trim() || null, note: st.note.trim() || null,
    }), `Einkauf gespeichert: ${fmtQty(total, unitOf(st.item_id))} ${itemOf(st.item_id)?.name}`);
    submit.disabled = false;
    if (okRun) Object.assign(st, { qty: '', price: '', batch: '', invoice_no: '', note: '', splits: {} });
  } },
  err,
  itemPicker(st, () => { const it = itemOf(st.item_id); if (it?.default_location_id) st.location_id = it.default_location_id; go(location.hash); }),
  el('div', { class: 'two' },
    field('Menge gesamt *', el('div', { class: 'with-unit' }, qty, unitLbl())),
    field('Preis gesamt', el('div', { class: 'with-unit' }, price, el('span', { class: 'unit', text: '€' })))),
  el('div', { class: 'two' },
    field('Datum *', bind(st, 'date', el('input', { type: 'date', max: today() }))),
    field('Bezahlt von', bind(st, 'paid_by', selectEl(members.map((m) => [m.id, m.name]), st.paid_by), drawPreview))),
  el('span', { class: 'lbl block', text: 'Wem gehört es?' }),
  modeRow,
  splitBox,
  preview,
  el('details', { class: 'more-fields', open: !!(st.supplier_id || st.location_id || st.batch || st.invoice_no || st.note) },
    el('summary', { text: 'Händler, Lagerort, Charge, Rechnung …' }),
    pickWithAdd('Händler', st, 'supplier_id', 'suppliers', 'haendler', '— keiner —'),
    pickWithAdd('Lagerort', st, 'location_id', 'locations', 'lagerorte', '— ohne Lagerort —'),
    el('div', { class: 'two' },
      field('Charge / Los', bind(st, 'batch', el('input', { type: 'text', maxlength: 60, autocomplete: 'off' }))),
      field('Rechnungsnr.', bind(st, 'invoice_no', el('input', { type: 'text', maxlength: 60, autocomplete: 'off' })))),
    field('Notiz', bind(st, 'note', el('textarea', { maxlength: 500, rows: 2 })))),
  submit);
  update();
  return form;
}

// ---------------------------------------------------------------------
//  Abgang
// ---------------------------------------------------------------------
function lotPicker(st, ownerKey, onChange) {
  const lots = st.item_id ? S.D.lotsOf(st.item_id, st[ownerKey]) : [];
  if (lots.length && !lots.some((l) => lotKey(l.item_id, l.owner_id, l.location_id, l.batch) === st.lot)) {
    const big = [...lots].sort((a, b) => b.qty - a.qty)[0];
    st.lot = lotKey(big.item_id, big.owner_id, big.location_id, big.batch);
  }
  if (!lots.length) st.lot = '';
  const sel = bind(st, 'lot', selectEl(lots.map((l) => [lotKey(l.item_id, l.owner_id, l.location_id, l.batch), `${lotLabel(l)} — ${qtyText(l.item_id, l.qty)}`]), st.lot), onChange);
  return { lots, node: st.item_id ? (lots.length ? field('Aus welchem Bestand?', sel) : el('div', { class: 'info', text: `${memberName(st[ownerKey])} hat von diesem Artikel nichts.` })) : null };
}
const selectedLot = (st, ownerKey) => S.D.lotsOf(st.item_id, st[ownerKey]).find((l) => lotKey(l.item_id, l.owner_id, l.location_id, l.batch) === st.lot);

function outForm(st) {
  const err = errorBox();
  const members = activeMembers();
  const { node: lotNode } = lotPicker(st, 'owner', () => {});
  const qty = bind(st, 'qty', numInput({ placeholder: 'Menge' }));
  const priceWrap = el('div', { hidden: st.reason !== 'verkauf' }, field('Verkaufspreis (optional)', el('div', { class: 'with-unit' }, bind(st, 'price', numInput()), el('span', { class: 'unit', text: '€' }))));
  const submit = el('button', { type: 'submit', class: 'btn primary block' }, icon('check'), 'Abgang speichern');
  return el('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    const q = parseNum(st.qty);
    const lot = selectedLot(st, 'owner');
    if (!st.item_id) return showErr(err, 'Bitte einen Artikel wählen.');
    if (!lot) return showErr(err, 'Diese Person hat von diesem Artikel nichts.');
    if (!q || Number.isNaN(q) || q <= 0) return showErr(err, 'Bitte eine Menge größer als 0 eintragen.');
    if (q > lot.qty + EPS) return showErr(err, `So viel ist nicht da. Vorhanden: ${qtyText(st.item_id, lot.qty)}.`);
    const pr = st.reason === 'verkauf' ? parseNum(st.price) : null;
    if (Number.isNaN(pr)) return showErr(err, 'Der Preis ist keine gültige Zahl.');
    submit.disabled = true;
    const okRun = await run(() => S.backend.bookMovements([{
      item_id: st.item_id, owner_id: st.owner, kind: 'out', qty: q, happened_on: st.date, reason: st.reason,
      location_id: lot.location_id, batch: lot.batch, price_total: pr, note: st.note.trim() || null,
    }]), `Abgang gespeichert: ${qtyText(st.item_id, q)}`);
    submit.disabled = false;
    if (okRun) Object.assign(st, { qty: '', note: '', price: '' });
  } },
  err,
  itemPicker(st, () => go(location.hash), { withStock: true }),
  field('Von wem?', bind(st, 'owner', selectEl(members.map((m) => [m.id, m.id === S.me.id ? `${m.name} (ich)` : m.name]), st.owner), () => go(location.hash))),
  lotNode,
  el('div', { class: 'two' },
    field('Menge *', el('div', { class: 'with-unit' }, qty, el('button', { type: 'button', class: 'btn small', text: 'Alles', onclick: () => { const l = selectedLot(st, 'owner'); if (l) { st.qty = String(round3(l.qty)).replace('.', ','); qty.value = st.qty; } } }))),
    field('Datum *', bind(st, 'date', el('input', { type: 'date', max: today() })))),
  field('Grund', bind(st, 'reason', selectEl([['verbrauch', 'Verbrauch'], ['verkauf', 'Verkauf'], ['korrektur', 'Korrektur (Fehlbestand)'], ['sonstiges', 'Sonstiges']], st.reason), () => { priceWrap.hidden = st.reason !== 'verkauf'; })),
  priceWrap,
  field('Notiz', bind(st, 'note', el('textarea', { maxlength: 500, rows: 2 }))),
  submit);
}

// ---------------------------------------------------------------------
//  Übertragen / Umlagern
// ---------------------------------------------------------------------
function transferForm(st) {
  const err = errorBox();
  const members = activeMembers();
  const { node: lotNode } = lotPicker(st, 'from', () => { const l = selectedLot(st, 'from'); st.to_location = l?.location_id || ''; toLoc.value = st.to_location; label(); });
  const lot0 = selectedLot(st, 'from');
  if (lot0 && st._lotFor !== st.lot) { st._lotFor = st.lot; st.to_location = lot0.location_id || ''; }
  const qty = bind(st, 'qty', numInput({ placeholder: 'Menge' }));
  const toLoc = bind(st, 'to_location', selectEl(optionsOf('locations', '— ohne Lagerort —'), st.to_location), () => label());
  const hint = el('p', { class: 'sub' });
  const submit = el('button', { type: 'submit', class: 'btn primary block' }, icon('swap'), 'Übertragen');
  function label() {
    const same = st.from === st.to;
    hint.textContent = same ? 'Gleiche Person: Das ist eine Umlagerung an einen anderen Lagerort.' : `${memberName(st.from)} gibt ${memberName(st.to)} etwas ab.`;
    submit.lastChild.textContent = same ? 'Umlagern' : 'Übertragen';
  }
  const form = el('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    const q = parseNum(st.qty);
    const lot = selectedLot(st, 'from');
    if (!st.item_id) return showErr(err, 'Bitte einen Artikel wählen.');
    if (!lot) return showErr(err, `${memberName(st.from)} hat von diesem Artikel nichts.`);
    if (!q || Number.isNaN(q) || q <= 0) return showErr(err, 'Bitte eine Menge größer als 0 eintragen.');
    if (q > lot.qty + EPS) return showErr(err, `So viel ist nicht da. Vorhanden: ${qtyText(st.item_id, lot.qty)}.`);
    if (st.from === st.to && (st.to_location || null) === (lot.location_id || null)) return showErr(err, 'Bitte eine andere Person oder einen anderen Lagerort wählen.');
    submit.disabled = true;
    const okRun = await run(() => S.backend.bookTransfer({
      item_id: st.item_id, from: st.from, to: st.to, qty: q, happened_on: st.date, note: st.note.trim() || null,
      from_location: lot.location_id, batch: lot.batch, to_location: st.to_location || null,
    }), st.from === st.to ? 'Umgelagert.' : 'Übertragen.');
    submit.disabled = false;
    if (okRun) Object.assign(st, { qty: '', note: '' });
  } },
  err,
  itemPicker(st, () => go(location.hash), { withStock: true }),
  field('Von', bind(st, 'from', selectEl(members.map((m) => [m.id, m.name]), st.from), () => go(location.hash))),
  lotNode,
  el('div', { class: 'two' },
    field('Menge *', el('div', { class: 'with-unit' }, qty, el('button', { type: 'button', class: 'btn small', text: 'Alles', onclick: () => { const l = selectedLot(st, 'from'); if (l) { st.qty = String(round3(l.qty)).replace('.', ','); qty.value = st.qty; } } }))),
    field('Datum *', bind(st, 'date', el('input', { type: 'date', max: today() })))),
  field('An', bind(st, 'to', selectEl(members.map((m) => [m.id, m.name]), st.to), () => label())),
  field('Nach Lagerort', toLoc),
  hint,
  field('Notiz', bind(st, 'note', el('textarea', { maxlength: 500, rows: 2 }))),
  submit);
  label();
  return form;
}
