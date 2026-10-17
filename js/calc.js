// Reine Berechnungen: Bestand je Person/Lagerort/Charge, Einzelwert (Ø), Buchungs-Einträge.

export const EPS = 1e-9;
export const lotKey = (item, owner, loc, batch) => `${item}|${owner}|${loc || ''}|${batch || ''}`;

export const REASONS = {
  zugang: 'Zugang', verbrauch: 'Verbrauch', uebertrag: 'Übertrag', korrektur: 'Korrektur', sonstiges: 'Sonstiges',
};

export function derive(d) {
  const map = (arr) => new Map((arr || []).map((x) => [x.id, x]));
  const D = {
    members: map(d.members), items: map(d.items), categories: map(d.categories), manufacturers: map(d.manufacturers), locations: map(d.locations),
    memberByUser: new Map((d.members || []).filter((m) => m.user_id).map((m) => [m.user_id, m])),
    lots: new Map(), stock: new Map(), total: new Map(), worth: new Map(), groups: new Map(), entries: [],
  };
  const movements = (d.movements || []).map((m) => ({ ...m, qty: Number(m.qty), unit_value: m.unit_value == null ? null : Number(m.unit_value) }));
  for (const m of movements) {
    const sign = m.kind === 'in' ? 1 : -1;
    const k = lotKey(m.item_id, m.owner_id, m.location_id, m.batch);
    const lot = D.lots.get(k) || { item_id: m.item_id, owner_id: m.owner_id, location_id: m.location_id || null, batch: m.batch || null, qty: 0 };
    lot.qty += sign * m.qty;
    D.lots.set(k, lot);
    if (!D.stock.has(m.item_id)) D.stock.set(m.item_id, new Map());
    const s = D.stock.get(m.item_id);
    s.set(m.owner_id, (s.get(m.owner_id) || 0) + sign * m.qty);
    D.total.set(m.item_id, (D.total.get(m.item_id) || 0) + sign * m.qty);
    // Einzelwert = Ø aller Zugänge mit Wert (gewichtet nach Menge)
    if (m.kind === 'in' && m.unit_value != null) {
      const w = D.worth.get(m.item_id) || { qty: 0, sum: 0 };
      w.qty += m.qty; w.sum += m.qty * m.unit_value;
      D.worth.set(m.item_id, w);
    }
    if (m.group_id) {
      if (!D.groups.has(m.group_id)) D.groups.set(m.group_id, []);
      D.groups.get(m.group_id).push(m);
    }
  }
  for (const lot of D.lots.values()) if (Math.abs(lot.qty) < EPS) lot.qty = 0;

  const clean = (n) => (Math.abs(n) < EPS ? 0 : n);
  D.unitValue = (itemId) => { const w = D.worth.get(itemId); return w && w.qty > 0 ? w.sum / w.qty : null; };
  D.qty = (itemId, ownerId) => clean(ownerId ? D.stock.get(itemId)?.get(ownerId) || 0 : D.total.get(itemId) || 0);
  D.value = (itemId, ownerId) => { const u = D.unitValue(itemId); return u == null ? 0 : D.qty(itemId, ownerId) * u; };
  D.lotsOf = (itemId, ownerId) => [...D.lots.values()].filter((l) => l.item_id === itemId && (!ownerId || l.owner_id === ownerId) && l.qty > EPS);

  const seen = new Set();
  for (const m of movements) {
    if (m.group_id) {
      if (seen.has(m.group_id)) continue;
      seen.add(m.group_id);
      D.entries.push(makeEntry(D.groups.get(m.group_id)));
    } else D.entries.push(makeEntry([m]));
  }
  D.entries.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
  return D;
}

// Zusammengehörige Buchungen (aufgeteilter Zugang, Übertrag) als ein Eintrag
function makeEntry(rows) {
  const first = rows[0];
  const ins = rows.filter((r) => r.kind === 'in');
  const outs = rows.filter((r) => r.kind === 'out');
  let type;
  if (first.reason === 'uebertrag' && ins.length && outs.length) type = ins[0].owner_id === outs[0].owner_id ? 'umlagern' : 'uebertrag';
  else type = first.kind === 'in' ? 'zugang' : 'entnahme';
  const qty = type === 'uebertrag' || type === 'umlagern' ? ins.reduce((s, r) => s + r.qty, 0) : rows.reduce((s, r) => s + r.qty, 0);
  const hasValue = rows.some((r) => r.unit_value != null);
  return {
    id: first.id, group_id: first.group_id || null, rows, type, item_id: first.item_id, reason: first.reason,
    date: first.happened_on, created_at: first.created_at, created_by: first.created_by,
    qty, unit_value: first.unit_value, value: hasValue ? rows.reduce((s, r) => s + r.qty * (r.unit_value || 0), 0) : null,
    note: first.note, batch: first.batch, location_id: first.location_id,
    from: outs[0]?.owner_id, to: ins[0]?.owner_id, from_loc: outs[0]?.location_id, to_loc: ins[0]?.location_id,
    owners: [...new Set(rows.map((r) => r.owner_id))],
  };
}
