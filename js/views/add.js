// ＋ Hinzufügen: Zugang, Entnahme, Übertragen
import { S, run, go, memberName, qtyText, unitOf, activeMembers, activeOf, optionsOf, lotLabel, itemOf } from '../store.js';
import { el, icon, topbar, fmtMoney, fmtUnitMoney, fmtQty, parseNum, today, round2, round3, selectEl, field, toast, confirmBox } from '../ui.js';
import { lotKey, EPS } from '../calc.js';
import { friendlyError } from '../db.js';
import { getBarcode, barcodeLabel, barcodeIcon } from '../scanner.js';

const TABS = [['zugang', 'Zugang'], ['entnahme', 'Entnahme'], ['uebertrag', 'Übertragen']];
const UNITS = ['Stück', 'g', 'kg', 'ml', 'l', 'm', 'Packung', 'Dose', 'Karton', 'Rolle', 'Paar'];

export function add(r) {
  const tab = TABS.some(([k]) => k === r.parts[1]) ? r.parts[1] : 'zugang';
  const B = (S.ui.add ||= {});
  const st = (B[tab] ||= fresh(tab));
  if (r.q.item && st._preset !== r.key) {
    st._preset = r.key; st.item_id = r.q.item; st.lot = ''; st.newItem = false;
    if (tab === 'zugang') st.location_id = itemOf(r.q.item)?.default_location_id || st.location_id;
  }
  const head = el('div', null,
    topbar('Hinzufügen'),
    el('div', { class: 'seg', role: 'tablist' }, TABS.map(([k, label]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', text: label, onclick: () => go('#plus/' + k) }))));
  if (S.readonly) return el('div', null, head, el('div', { class: 'info', text: 'Du bist offline. Buchen geht erst wieder mit Internet.' }));
  return el('div', null, head, tab === 'zugang' ? inForm(st) : tab === 'entnahme' ? outForm(st) : transferForm(st));
}

function fresh(tab) {
  const me = S.me?.id;
  const base = { item_id: '', date: today(), qty: '', note: '' };
  if (tab === 'zugang') return { ...base, unitValue: '', location_id: '', batch: '', split: false, owner: me, splits: {}, newItem: false, ni: { name: '', manufacturer: '', category_id: '', unit: 'Stück' } };
  if (tab === 'entnahme') return { ...base, owner: me, lot: '', reason: 'verbrauch' };
  return { ...base, from: me, lot: '', to: activeMembers().find((m) => m.id !== me)?.id || me, to_location: '' };
}

// Eingabe mit Zustand verbinden
function bind(st, key, node, onChange) {
  node.value = st[key] ?? '';
  node.addEventListener(node.tagName === 'SELECT' ? 'change' : 'input', () => { st[key] = node.value; onChange && onChange(); });
  return node;
}
const numInput = (props = {}) => el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', ...props });
const errorBox = () => el('div', { class: 'error', hidden: true, role: 'alert' });
function showErr(box, msg) { box.textContent = msg; box.hidden = false; box.scrollIntoView({ block: 'center', behavior: 'smooth' }); return false; }

function itemPicker(st, { withStock, allowNew } = {}) {
  const opts = [['', '— Artikel wählen —'], ...activeOf('items').sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((i) => [i.id, withStock ? `${i.name} (${fmtQty(S.D.qty(i.id), i.unit)})` : i.name])];
  const sel = bind(st, 'item_id', selectEl(opts, st.item_id, { 'aria-label': 'Artikel' }), () => {
    const it = itemOf(st.item_id);
    if (it && 'location_id' in st) st.location_id = it.default_location_id || st.location_id;
    st.lot = '';
    go(location.hash);
  });
  return el('label', { class: 'field' },
    el('span', { class: 'lbl', text: 'Artikel *' }),
    el('div', { class: 'with-btn' }, sel,
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': barcodeLabel(), title: barcodeLabel(), onclick: async (e) => {
        e.preventDefault();
        const code = await getBarcode();
        if (!code) return;
        const hit = S.data.items.find((i) => i.ean === code && !i.archived);
        if (hit) { st.item_id = hit.id; st.lot = ''; st.newItem = false; go(location.hash); toast(`Gefunden: ${hit.name}`); return; }
        if (allowNew && await confirmBox(`Kein Artikel mit dem Barcode ${code}. Neuen Artikel anlegen?`, { ok: 'Anlegen', title: 'Unbekannter Barcode' })) {
          st.newItem = true; st.ni.ean = code; go(location.hash);
        } else if (!allowNew) toast('Kein Artikel mit diesem Barcode.', true);
      } }, icon(barcodeIcon())),
      allowNew ? el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Neuer Artikel', title: 'Neuer Artikel', onclick: (e) => { e.preventDefault(); st.newItem = true; go(location.hash); } }, icon('plus')) : null));
}

// ---------------------------------------------------------------------
//  Zugang
// ---------------------------------------------------------------------
function inForm(st) {
  const err = errorBox();
  const members = activeMembers();
  const unitTxt = () => (st.newItem ? st.ni.unit : unitOf(st.item_id)) || '';
  const unitLbls = [];
  const unitLbl = () => { const u = el('span', { class: 'unit', text: unitTxt() }); unitLbls.push(u); return u; };
  const totalEl = el('output', { class: 'total-value', 'aria-live': 'polite' }, '—');
  const splitBox = el('div');
  const avg = !st.newItem && st.item_id ? S.D.unitValue(st.item_id) : null;

  const refresh = () => {
    unitLbls.forEach((u) => { u.textContent = unitTxt(); });
    const q = parseNum(st.qty), u = parseNum(st.unitValue);
    totalEl.textContent = q > 0 && u != null && !Number.isNaN(u) ? fmtMoney(round2(q * u)) : '—';
  };
  const splitsNow = () => (st.split
    ? members.map((m) => ({ owner_id: m.id, qty: parseNum(st.splits[m.id]) })).filter((s) => s.qty > 0 || Number.isNaN(s.qty))
    : [{ owner_id: st.owner, qty: parseNum(st.qty) }]);
  function drawSplit() {
    if (!st.split) {
      splitBox.replaceChildren(field('Besitzer', bind(st, 'owner', selectEl(members.map((m) => [m.id, m.id === S.me.id ? `${m.name} (ich)` : m.name]), st.owner))));
      return;
    }
    const sumEl = el('div', { class: 'split-sum' });
    const upd = () => {
      const total = parseNum(st.qty), sum = members.reduce((s, m) => s + (parseNum(st.splits[m.id]) || 0), 0);
      const okSum = total > 0 && Math.abs(sum - total) < 1e-6;
      sumEl.className = 'split-sum ' + (okSum ? 'ok' : 'bad');
      sumEl.textContent = total > 0 ? `Verteilt: ${fmtQty(round3(sum), unitTxt())} von ${fmtQty(total, unitTxt())}` + (okSum ? ' ✓' : sum < total ? ` – noch ${fmtQty(round3(total - sum), unitTxt())}` : ' – zu viel') : 'Erst oben die Menge eintragen.';
    };
    splitBox.replaceChildren(el('div', { class: 'split-box' },
      members.map((m) => {
        const inp = numInput({ value: st.splits[m.id] ?? '', placeholder: '0', 'aria-label': `Menge für ${m.name}` });
        inp.addEventListener('input', () => { st.splits[m.id] = inp.value; upd(); });
        return el('div', { class: 'split-line' }, el('span', { class: 'ellipsis', text: m.name + (m.id === S.me.id ? ' (ich)' : '') }), el('div', { class: 'with-unit' }, inp, unitLbl()));
      }),
      el('div', { class: 'row-actions' }, sumEl, el('button', { type: 'button', class: 'btn small', text: 'Gleich verteilen', onclick: () => {
        const t = parseNum(st.qty);
        if (!(t > 0)) return showErr(err, 'Bitte zuerst die Menge eintragen.');
        const each = Math.floor((t / members.length) * 1000) / 1000;
        members.forEach((m, i) => { st.splits[m.id] = String(i === members.length - 1 ? round3(t - each * (members.length - 1)) : each).replace('.', ','); });
        drawSplit();
      } }))));
    upd();
  }

  const newItemBox = st.newItem ? el('div', { class: 'new-item' },
    el('div', { class: 'row-actions' }, el('strong', { text: 'Neuer Artikel' }),
      el('button', { type: 'button', class: 'linkbtn', text: 'Bestehenden wählen', onclick: () => { st.newItem = false; go(location.hash); } })),
    field('Name *', bind(st.ni, 'name', el('input', { type: 'text', maxlength: 100, autocomplete: 'off', placeholder: 'z. B. Pulver Typ C' }))),
    field('Hersteller', bind(st.ni, 'manufacturer', el('input', { type: 'text', maxlength: 100, autocomplete: 'off', list: 'dl-man', placeholder: 'optional' })),
      'Neuer Name wird automatisch angelegt.'),
    el('datalist', { id: 'dl-man' }, activeOf('manufacturers').map((m) => el('option', { value: m.name }))),
    el('div', { class: 'two' },
      field('Kategorie', bind(st.ni, 'category_id', selectEl(optionsOf('categories', '— keine —'), st.ni.category_id))),
      field('Einheit *', bind(st.ni, 'unit', el('input', { type: 'text', maxlength: 20, autocomplete: 'off', list: 'dl-unit' }), refresh))),
    el('datalist', { id: 'dl-unit' }, UNITS.map((u) => el('option', { value: u })))) : itemPicker(st, { allowNew: true });

  const submit = el('button', { type: 'submit', class: 'btn primary block' }, icon('check'), 'Zugang speichern');
  const form = el('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    const total = parseNum(st.qty), uv = parseNum(st.unitValue);
    if (st.newItem ? !st.ni.name.trim() || !st.ni.unit.trim() : !st.item_id) return showErr(err, st.newItem ? 'Bitte Name und Einheit des neuen Artikels eintragen.' : 'Bitte einen Artikel wählen.');
    if (!(total > 0)) return showErr(err, 'Bitte eine Menge größer als 0 eintragen.');
    if (Number.isNaN(uv) || (uv != null && uv < 0)) return showErr(err, 'Der Einzelwert ist keine gültige Zahl.');
    const splits = splitsNow();
    if (splits.some((s) => Number.isNaN(s.qty))) return showErr(err, 'Eine Menge bei der Aufteilung ist keine gültige Zahl.');
    if (!splits.length) return showErr(err, 'Bitte die Menge auf die Personen verteilen.');
    if (st.split && Math.abs(splits.reduce((s, x) => s + x.qty, 0) - total) > 1e-6) return showErr(err, 'Die Aufteilung ergibt nicht die Menge.');
    if (!st.date) return showErr(err, 'Bitte ein Datum wählen.');
    submit.disabled = true;
    let itemId = st.item_id;
    if (st.newItem) {
      try {
        let manId = null;
        const mn = st.ni.manufacturer.trim();
        if (mn) {
          manId = S.data.manufacturers.find((m) => m.name.trim().toLowerCase() === mn.toLowerCase())?.id;
          if (!manId) manId = (await S.backend.insert('manufacturers', { name: mn })).id;
        }
        const created = await S.backend.insert('items', { name: st.ni.name.trim(), manufacturer_id: manId, category_id: st.ni.category_id || null, unit: st.ni.unit.trim(), default_location_id: st.location_id || null, ean: st.ni.ean || null });
        itemId = created.id;
      } catch (ex) { submit.disabled = false; return showErr(err, friendlyError(ex).message); }
    }
    const name = st.newItem ? st.ni.name.trim() : itemOf(itemId)?.name;
    const okRun = await run(() => S.backend.bookIn({
      item_id: itemId, splits, unit_value: uv, happened_on: st.date, location_id: st.location_id || null, batch: st.batch.trim() || null, note: st.note.trim() || null,
    }), `Zugang gespeichert: ${fmtQty(total, unitTxt())} ${name}`);
    submit.disabled = false;
    if (okRun) Object.assign(st, { item_id: itemId, newItem: false, ni: { name: '', manufacturer: '', category_id: '', unit: 'Stück' }, qty: '', unitValue: '', batch: '', note: '', splits: {} });
    else if (st.newItem) { st.newItem = false; st.item_id = itemId; go(location.hash); } // Artikel ist angelegt – nur die Buchung fehlt
  } },
  err,
  newItemBox,
  el('div', { class: 'two' },
    field('Menge *', el('div', { class: 'with-unit' }, bind(st, 'qty', numInput({ placeholder: 'z. B. 500' }), () => { refresh(); if (st.split) drawSplit(); }), unitLbl())),
    field('Einzelwert (€ je Einheit)', el('div', { class: 'with-unit' }, bind(st, 'unitValue', numInput({ placeholder: 'optional', 'aria-label': 'Einzelwert in Euro je Einheit' }), refresh), el('span', { class: 'unit', text: '€' })),
      avg != null ? `Bisher Ø ${fmtUnitMoney(avg)}` : null)),
  el('div', { class: 'total-row' }, el('span', { text: 'Gesamtwert' }), totalEl),
  el('label', { class: 'checkrow' }, el('input', { type: 'checkbox', checked: st.split, onchange: (e) => { st.split = e.target.checked; drawSplit(); } }), el('span', { text: 'Auf mehrere Personen aufteilen' })),
  splitBox,
  field('Datum *', bind(st, 'date', el('input', { type: 'date', max: today() }))),
  el('details', { class: 'more-fields', open: !!(st.batch || st.note) },
    el('summary', { text: 'Lagerort, Charge, Notiz' }),
    field('Lagerort', bind(st, 'location_id', selectEl(optionsOf('locations', '— ohne Lagerort —'), st.location_id))),
    field('Charge / Los', bind(st, 'batch', el('input', { type: 'text', maxlength: 60, autocomplete: 'off' }))),
    field('Notiz', bind(st, 'note', el('textarea', { maxlength: 500, rows: 2 })))),
  submit);
  drawSplit(); refresh();
  return form;
}

// ---------------------------------------------------------------------
//  Entnahme / Übertragen: aus welchem Bestand?
// ---------------------------------------------------------------------
function lotPicker(st, ownerKey, onChange) {
  const lots = st.item_id ? S.D.lotsOf(st.item_id, st[ownerKey]) : [];
  if (lots.length && !lots.some((l) => lotKey(l.item_id, l.owner_id, l.location_id, l.batch) === st.lot)) {
    const big = [...lots].sort((a, b) => b.qty - a.qty)[0];
    st.lot = lotKey(big.item_id, big.owner_id, big.location_id, big.batch);
  }
  if (!lots.length) st.lot = '';
  if (!st.item_id) return null;
  if (!lots.length) return el('div', { class: 'info', text: `${memberName(st[ownerKey])} hat von diesem Artikel nichts.` });
  if (lots.length === 1) return el('p', { class: 'sub lot-one', text: `Aus: ${lotLabel(lots[0])} — vorhanden ${qtyText(lots[0].item_id, lots[0].qty)}` });
  return field('Aus welchem Bestand?', bind(st, 'lot', selectEl(lots.map((l) => [lotKey(l.item_id, l.owner_id, l.location_id, l.batch), `${lotLabel(l)} — ${qtyText(l.item_id, l.qty)}`]), st.lot), onChange));
}
const selectedLot = (st, ownerKey) => S.D.lotsOf(st.item_id, st[ownerKey]).find((l) => lotKey(l.item_id, l.owner_id, l.location_id, l.batch) === st.lot);
const allBtn = (st, ownerKey, input) => el('button', { type: 'button', class: 'btn small', text: 'Alles', onclick: () => { const l = selectedLot(st, ownerKey); if (l) { st.qty = String(round3(l.qty)).replace('.', ','); input.value = st.qty; } } });

function outForm(st) {
  const err = errorBox();
  const members = activeMembers();
  const qty = bind(st, 'qty', numInput({ placeholder: 'Menge' }));
  const submit = el('button', { type: 'submit', class: 'btn primary block' }, icon('check'), 'Entnahme speichern');
  return el('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    const q = parseNum(st.qty), lot = selectedLot(st, 'owner');
    if (!st.item_id) return showErr(err, 'Bitte einen Artikel wählen.');
    if (!lot) return showErr(err, 'Diese Person hat von diesem Artikel nichts.');
    if (!(q > 0)) return showErr(err, 'Bitte eine Menge größer als 0 eintragen.');
    if (q > lot.qty + EPS) return showErr(err, `So viel ist nicht da. Vorhanden: ${qtyText(st.item_id, lot.qty)}.`);
    submit.disabled = true;
    const okRun = await run(() => S.backend.bookMovements([{
      item_id: st.item_id, owner_id: st.owner, kind: 'out', qty: q, happened_on: st.date, reason: st.reason, location_id: lot.location_id, batch: lot.batch, note: st.note.trim() || null,
    }]), `Entnahme gespeichert: ${qtyText(st.item_id, q)}`);
    submit.disabled = false;
    if (okRun) Object.assign(st, { qty: '', note: '' });
  } },
  err,
  itemPicker(st, { withStock: true }),
  field('Von wem?', bind(st, 'owner', selectEl(members.map((m) => [m.id, m.id === S.me.id ? `${m.name} (ich)` : m.name]), st.owner), () => { st.lot = ''; go(location.hash); })),
  lotPicker(st, 'owner'),
  el('div', { class: 'two' },
    field('Menge *', el('div', { class: 'with-unit' }, qty, allBtn(st, 'owner', qty))),
    field('Datum *', bind(st, 'date', el('input', { type: 'date', max: today() })))),
  field('Grund', bind(st, 'reason', selectEl([['verbrauch', 'Verbrauch'], ['korrektur', 'Korrektur (fehlt / kaputt)'], ['sonstiges', 'Sonstiges']], st.reason))),
  field('Notiz', bind(st, 'note', el('textarea', { maxlength: 500, rows: 2 }))),
  submit);
}

function transferForm(st) {
  const err = errorBox();
  const members = activeMembers();
  const picker = lotPicker(st, 'from', () => { const l = selectedLot(st, 'from'); st.to_location = l?.location_id || ''; toLoc.value = st.to_location; label(); });
  const lot1 = selectedLot(st, 'from');
  if (lot1 && st._lotFor !== st.lot) { st._lotFor = st.lot; st.to_location = lot1.location_id || ''; }
  const qty = bind(st, 'qty', numInput({ placeholder: 'Menge' }));
  const toLoc = bind(st, 'to_location', selectEl(optionsOf('locations', '— ohne Lagerort —'), st.to_location), () => label());
  const hint = el('p', { class: 'sub' });
  const btnText = el('span', { text: 'Übertragen' });
  const submit = el('button', { type: 'submit', class: 'btn primary block' }, icon('swap'), btnText);
  function label() {
    const same = st.from === st.to;
    hint.textContent = same ? 'Gleiche Person: Das ist eine Umlagerung an einen anderen Lagerort.' : `${memberName(st.from)} gibt ${memberName(st.to)} etwas ab.`;
    btnText.textContent = same ? 'Umlagern' : 'Übertragen';
  }
  const form = el('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    const q = parseNum(st.qty), lot = selectedLot(st, 'from');
    if (!st.item_id) return showErr(err, 'Bitte einen Artikel wählen.');
    if (!lot) return showErr(err, `${memberName(st.from)} hat von diesem Artikel nichts.`);
    if (!(q > 0)) return showErr(err, 'Bitte eine Menge größer als 0 eintragen.');
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
  itemPicker(st, { withStock: true }),
  field('Von', bind(st, 'from', selectEl(members.map((m) => [m.id, m.name]), st.from), () => { st.lot = ''; go(location.hash); })),
  picker,
  el('div', { class: 'two' },
    field('Menge *', el('div', { class: 'with-unit' }, qty, allBtn(st, 'from', qty))),
    field('Datum *', bind(st, 'date', el('input', { type: 'date', max: today() })))),
  field('An', bind(st, 'to', selectEl(members.map((m) => [m.id, m.name]), st.to), () => label())),
  field('Nach Lagerort', toLoc),
  hint,
  field('Notiz', bind(st, 'note', el('textarea', { maxlength: 500, rows: 2 }))),
  submit);
  label();
  return form;
}
