// CSV-Exporte (Excel: Semikolon, Komma, UTF-8) und Datensicherung
import { S, memberName, itemName, unitOf, locName, manName, userName, inventoryLots } from './store.js';
import { downloadCSV, download, today, fmtDate, round2, round3 } from './ui.js';
import { REASONS } from './calc.js';
import { TABLES } from './db.js';
import { displayLogin } from './accounts.js';

const slug = (s) => String(s).toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c])).replace(/[^a-z0-9]+/g, '-');

// Inventurliste: Besitzer, Artikel, Hersteller, Charge, Lagerort, Menge, Einheit, Einzelwert, Gesamtwert
export function exportInventoryCSV(person = '') {
  const lots = inventoryLots(person);
  const rows = [
    ['Inventurliste', person ? memberName(person) : 'Alle Personen'],
    ['Stand', fmtDate(today())],
    [],
    ['Besitzer', 'Artikel', 'Hersteller', 'Charge', 'Lagerort', 'Menge', 'Einheit', 'Einzelwert (€)', 'Gesamtwert (€)'],
  ];
  let total = 0, owner = null, sub = 0;
  const subRow = () => { if (owner && !person) rows.push([`Summe ${memberName(owner)}`, '', '', '', '', '', '', '', round2(sub)]); };
  for (const l of lots) {
    if (l.owner_id !== owner) { subRow(); owner = l.owner_id; sub = 0; }
    rows.push([memberName(l.owner_id), l.item?.name, manName(l.item?.manufacturer_id) || null, l.batch, l.location_id ? locName(l.location_id) : null,
      round3(l.qty), l.item?.unit, l.unit == null ? null : Math.round(l.unit * 10000) / 10000, l.value == null ? null : round2(l.value)]);
    total += l.value || 0; sub += l.value || 0;
  }
  subRow();
  rows.push([], ['Gesamtwert', '', '', '', '', '', '', '', round2(total)]);
  downloadCSV(`inventurliste-${person ? slug(memberName(person)) + '-' : ''}${today()}.csv`, rows);
}

export function exportMovementsCSV(movements = S.data.movements) {
  const rows = [['Datum', 'Artikel', 'Person', 'Art', 'Grund', 'Menge', 'Einheit', 'Einzelwert (€)', 'Gesamtwert (€)', 'Lagerort', 'Charge', 'Notiz', 'Gebucht von', 'Gebucht am']];
  for (const m of movements) {
    const uv = m.unit_value == null ? null : Number(m.unit_value);
    rows.push([m.happened_on, itemName(m.item_id), memberName(m.owner_id), m.kind === 'in' ? 'Zugang' : 'Entnahme', REASONS[m.reason] || m.reason,
      Number(m.qty), unitOf(m.item_id), uv, uv == null ? null : round2(uv * Number(m.qty)), locName(m.location_id), m.batch, m.note,
      userName(m.created_by), (m.created_at || '').replace('T', ' ').slice(0, 16)]);
  }
  downloadCSV(`buchungen-${today()}.csv`, rows);
}

export function backupJSON() {
  const data = {};
  for (const t of TABLES) data[t] = S.data[t];
  data.members = data.members.map((m) => ({ ...m, login: displayLogin(m.email) }));
  download(`lager-sicherung-${today()}.json`, JSON.stringify({ app: 'lager', version: 2, exported_at: new Date().toISOString(), data }, null, 1), 'application/json');
}
