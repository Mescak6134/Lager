// Reine Berechnungen ohne Oberfläche: Bestand, Werte, Schulden, Ausgleich.

export const EPS = 1e-9;
export const lotKey = (item, owner, loc, batch) => `${item}|${owner}|${loc || ''}|${batch || ''}`;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const REASONS = {
  kauf: 'Einkauf', verbrauch: 'Verbrauch', uebertrag: 'Übertrag', korrektur: 'Korrektur', verkauf: 'Verkauf', sonstiges: 'Sonstiges',
};

export function derive(d) {
  const map = (arr) => new Map((arr || []).map((x) => [x.id, x]));
  const D = {
    members: map(d.members), items: map(d.items), categories: map(d.categories), manufacturers: map(d.manufacturers),
    suppliers: map(d.suppliers), locations: map(d.locations),
    memberByUser: new Map((d.members || []).filter((m) => m.user_id).map((m) => [m.user_id, m])),
    lots: new Map(), stock: new Map(), total: new Map(), buy: new Map(), last: new Map(),
    groups: new Map(), entries: [],
  };

  const movements = (d.movements || []).map((m) => ({ ...m, qty: Number(m.qty), price_total: m.price_total == null ? null : Number(m.price_total) }));
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
    if (m.kind === 'in' && m.reason === 'kauf' && m.price_total != null && m.qty > 0) {
      const b = D.buy.get(m.item_id) || { qty: 0, cost: 0 };
      b.qty += m.qty; b.cost += m.price_total;
      D.buy.set(m.item_id, b);
    }
    const prev = D.last.get(m.item_id);
    if (!prev || m.happened_on > prev) D.last.set(m.item_id, m.happened_on);
    if (m.group_id) {
      if (!D.groups.has(m.group_id)) D.groups.set(m.group_id, []);
      D.groups.get(m.group_id).push(m);
    }
  }
  // Rundungsrauschen entfernen
  for (const lot of D.lots.values()) if (Math.abs(lot.qty) < EPS) lot.qty = 0;

  D.avgPrice = (itemId) => { const b = D.buy.get(itemId); return b && b.qty > 0 ? b.cost / b.qty : null; };
  D.qty = (itemId, ownerId) => {
    if (!ownerId) return clean(D.total.get(itemId) || 0);
    return clean(D.stock.get(itemId)?.get(ownerId) || 0);
  };
  D.value = (itemId, ownerId) => { const p = D.avgPrice(itemId); return p == null ? 0 : D.qty(itemId, ownerId) * p; };
  D.lotsOf = (itemId, ownerId) => [...D.lots.values()].filter((l) => l.item_id === itemId && (!ownerId || l.owner_id === ownerId) && l.qty > EPS);

  // Buchungen zu Einträgen zusammenfassen (aufgeteilter Einkauf, Übertrag)
  const seen = new Set();
  for (const m of movements) {
    if (m.group_id) {
      if (seen.has(m.group_id)) continue;
      seen.add(m.group_id);
      D.entries.push(makeEntry(D.groups.get(m.group_id)));
    } else D.entries.push(makeEntry([m]));
  }
  D.entries.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || ''));

  // Schulden
  D.ledger = ledger(movements, d.settlements || []);
  return D;
}

const clean = (n) => (Math.abs(n) < EPS ? 0 : n);

function makeEntry(rows) {
  const first = rows[0];
  const ins = rows.filter((r) => r.kind === 'in');
  const outs = rows.filter((r) => r.kind === 'out');
  let type;
  if (first.reason === 'uebertrag' && ins.length && outs.length) {
    type = ins[0].owner_id === outs[0].owner_id ? 'umlagern' : 'uebertrag';
  } else if (first.reason === 'kauf' && first.kind === 'in') type = 'kauf';
  else type = first.kind === 'in' ? 'zugang' : 'abgang';
  const qty = type === 'uebertrag' || type === 'umlagern' ? ins.reduce((s, r) => s + r.qty, 0) : rows.reduce((s, r) => s + r.qty, 0);
  const price = rows.reduce((s, r) => s + (r.price_total || 0), 0);
  return {
    id: first.id, group_id: first.group_id || null, rows, type, item_id: first.item_id,
    date: first.happened_on, created_at: first.created_at, created_by: first.created_by,
    qty, price: rows.some((r) => r.price_total != null) ? price : null,
    paid_by: first.paid_by || null, reason: first.reason, note: first.note, batch: first.batch,
    location_id: first.location_id, supplier_id: first.supplier_id, invoice_no: first.invoice_no,
    from: outs[0]?.owner_id, to: ins[0]?.owner_id, from_loc: outs[0]?.location_id, to_loc: ins[0]?.location_id,
    owners: [...new Set(rows.map((r) => r.owner_id))],
  };
}

// owes: Map "schuldner|gläubiger" → Betrag ; net: Map person → +bekommt / −schuldet
export function ledger(movements, settlements) {
  const owes = new Map();
  const add = (a, b, amt) => {
    if (!a || !b || a === b || !amt) return;
    const k1 = `${a}|${b}`, k2 = `${b}|${a}`;
    // gegenseitige Schulden direkt verrechnen
    const back = owes.get(k2) || 0;
    if (back > 0) {
      const m = Math.min(back, amt);
      owes.set(k2, back - m); amt -= m;
    }
    if (amt > 0) owes.set(k1, (owes.get(k1) || 0) + amt);
  };
  const spent = new Map(); // wer hat wie viel bezahlt
  const share = new Map(); // Warenwert, der jemandem gehört
  for (const m of movements) {
    if (m.reason !== 'kauf' || m.kind !== 'in' || m.price_total == null) continue;
    const price = Number(m.price_total);
    if (m.paid_by) spent.set(m.paid_by, (spent.get(m.paid_by) || 0) + price);
    share.set(m.owner_id, (share.get(m.owner_id) || 0) + price);
    if (m.paid_by && m.paid_by !== m.owner_id) add(m.owner_id, m.paid_by, price);
  }
  // Ausgleich: from zahlt to → verringert, was from an to schuldet
  for (const s of settlements) add(s.to_member, s.from_member, Number(s.amount));

  const net = new Map();
  for (const [k, v] of owes) {
    if (v < 0.005) continue;
    const [a, b] = k.split('|');
    net.set(a, (net.get(a) || 0) - v);
    net.set(b, (net.get(b) || 0) + v);
  }
  for (const [k, v] of net) net.set(k, r2(v));
  const pairs = [...owes].filter(([, v]) => v >= 0.005).map(([k, v]) => { const [from, to] = k.split('|'); return { from, to, amount: r2(v) }; });
  const plan = settlePlan(net);
  return { owes, net, pairs, plan, spent, share, open: r2(plan.reduce((s, p) => s + p.amount, 0)) };
}

// Möglichst wenige Zahlungen, damit alle bei 0 sind
export function settlePlan(net) {
  const cred = [], debt = [];
  for (const [id, v] of net) {
    if (v > 0.004) cred.push({ id, v });
    else if (v < -0.004) debt.push({ id, v: -v });
  }
  cred.sort((a, b) => b.v - a.v); debt.sort((a, b) => b.v - a.v);
  const plan = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = r2(Math.min(debt[i].v, cred[j].v));
    if (amt >= 0.01) plan.push({ from: debt[i].id, to: cred[j].id, amount: amt });
    debt[i].v = r2(debt[i].v - amt); cred[j].v = r2(cred[j].v - amt);
    if (debt[i].v < 0.01) i++;
    if (cred[j].v < 0.01) j++;
  }
  return plan;
}

// Preis nach Menge aufteilen, auf Cent genau (Rest beim Letzten) – wie in der Datenbank
export function splitPrice(total, qtys) {
  if (total == null) return qtys.map(() => null);
  const sum = qtys.reduce((s, q) => s + q, 0);
  let rest = r2(total);
  return qtys.map((q, i) => {
    if (i === qtys.length - 1) return r2(rest);
    const p = r2(total * q / sum);
    rest = r2(rest - p);
    return p;
  });
}

// Ausgaben je Monat (letzte n Monate), optional je Zahler
export function monthlySpending(movements, n = 12) {
  const now = new Date();
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const sums = new Map(months.map((m) => [m, 0]));
  for (const m of movements) {
    if (m.reason !== 'kauf' || m.kind !== 'in' || m.price_total == null) continue;
    const ym = String(m.happened_on).slice(0, 7);
    if (sums.has(ym)) sums.set(ym, sums.get(ym) + Number(m.price_total));
  }
  return months.map((m) => ({ month: m, value: r2(sums.get(m)) }));
}
