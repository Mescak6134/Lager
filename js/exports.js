// CSV-Exporte und Datensicherung
import { S, memberName, itemName, unitOf, locName, supName, manName, catOf, userName } from './store.js';
import { downloadCSV, download, today, round2, round3 } from './ui.js';
import { REASONS } from './calc.js';
import { TABLES } from './db.js';

const stamp = () => today();

export function exportStockCSV() {
  const rows = [['Artikel', 'Artikelnr.', 'EAN', 'Kategorie', 'Hersteller', 'Person', 'Lagerort', 'Charge', 'Menge', 'Einheit', 'Ø Einkaufspreis je Einheit (€)', 'Wert (€)']];
  const lots = [...S.D.lots.values()].filter((l) => l.qty > 0)
    .sort((a, b) => itemName(a.item_id).localeCompare(itemName(b.item_id)) || memberName(a.owner_id).localeCompare(memberName(b.owner_id)));
  for (const l of lots) {
    const it = S.D.items.get(l.item_id);
    const p = S.D.avgPrice(l.item_id);
    rows.push([it?.name, it?.sku, it?.ean, catOf(it?.category_id)?.name, manName(it?.manufacturer_id), memberName(l.owner_id), locName(l.location_id), l.batch,
      round3(l.qty), it?.unit, p == null ? null : round3(p), p == null ? null : round2(p * l.qty)]);
  }
  downloadCSV(`bestand-${stamp()}.csv`, rows);
}

export function exportMovementsCSV(movements = S.data.movements) {
  const rows = [['Datum', 'Artikel', 'Person', 'Art', 'Grund', 'Menge', 'Einheit', 'Lagerort', 'Charge', 'Preis (€)', 'Bezahlt von', 'Händler', 'Rechnungsnr.', 'Notiz', 'Gebucht von', 'Gebucht am']];
  for (const m of movements) {
    rows.push([m.happened_on, itemName(m.item_id), memberName(m.owner_id), m.kind === 'in' ? 'Zugang' : 'Abgang', REASONS[m.reason] || m.reason,
      Number(m.qty), unitOf(m.item_id), locName(m.location_id), m.batch, m.price_total == null ? null : Number(m.price_total),
      m.paid_by ? memberName(m.paid_by) : null, supName(m.supplier_id) || null, m.invoice_no, m.note, userName(m.created_by), (m.created_at || '').replace('T', ' ').slice(0, 16)]);
  }
  downloadCSV(`buchungen-${stamp()}.csv`, rows);
}

export function exportSettleCSV() {
  const L = S.D.ledger;
  const rows = [['Abrechnung vom', today()], [], ['Person', 'Bezahlt (€)', 'Anteil an Einkäufen (€)', 'Saldo (€)']];
  for (const m of S.data.members) {
    rows.push([m.name, round2(L.spent.get(m.id) || 0), round2(L.share.get(m.id) || 0), round2(L.net.get(m.id) || 0)]);
  }
  rows.push([], ['Vorschlag zum Ausgleichen'], ['Von', 'An', 'Betrag (€)']);
  for (const p of L.plan) rows.push([memberName(p.from), memberName(p.to), p.amount]);
  rows.push([], ['Bisherige Ausgleichszahlungen'], ['Datum', 'Von', 'An', 'Betrag (€)', 'Notiz']);
  for (const s of S.data.settlements) rows.push([s.happened_on, memberName(s.from_member), memberName(s.to_member), Number(s.amount), s.note]);
  downloadCSV(`abrechnung-${stamp()}.csv`, rows);
}

export function exportMasterCSV(table, title, cols) {
  const rows = [cols.map((c) => c[1])];
  for (const r of S.data[table]) rows.push(cols.map(([k, , fn]) => (fn ? fn(r) : r[k])));
  downloadCSV(`${title.toLowerCase()}-${stamp()}.csv`, rows);
}

export function backupJSON() {
  const data = {};
  for (const t of TABLES) data[t] = S.data[t];
  download(`lager-backup-${stamp()}.json`, JSON.stringify({ app: 'lager', version: 2, exported_at: new Date().toISOString(), data }, null, 1), 'application/json');
}
