// Gemeinsamer Zustand der App + kleine Helfer für alle Ansichten.
import { derive } from './calc.js';
import { friendlyError } from './db.js';
import { toast, fmtQty, el } from './ui.js';

export const S = {
  backend: null,      // Supabase oder Demo
  session: null,
  me: null,           // eigene Person (members-Zeile)
  data: null,         // Rohdaten
  D: null,            // berechnet: Bestand, Einzelwerte, Einträge
  readonly: false,    // offline → nur ansehen
  snapshotAt: null,
  mfa: null,          // eingerichteter Zwei-Faktor (nur Supabase)
  maxMembers: 3,      // aus der Datenbank (public.max_members)
  ui: {},             // Filter und Eingaben je Ansicht
  installPrompt: null,
};
export const hooks = { render: () => {}, logout: () => {} };

const SNAP_KEY = 'lager-snapshot';

export function setData(data) { S.data = data; S.D = derive(data); }

export async function reload({ silent = false } = {}) {
  const data = await S.backend.loadAll();
  setData(data);
  S.readonly = false;
  S.snapshotAt = null;
  if (S.backend.mode === 'supabase') saveSnapshot();
  if (!silent) hooks.render();
}

export function saveSnapshot() {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify({ at: new Date().toISOString(), me: S.me, data: S.data })); } catch { /* voll */ }
}
export function loadSnapshot() {
  try { const s = JSON.parse(localStorage.getItem(SNAP_KEY)); if (s && s.data && s.me) return s; } catch { /* */ }
  return null;
}
export function clearSnapshot() { try { localStorage.removeItem(SNAP_KEY); } catch { /* */ } }

// Schreib-Aktion: Fehler freundlich melden, danach neu laden
export async function run(fn, okMsg) {
  if (S.readonly) { toast('Offline – bitte warten, bis wieder Internet da ist.', true); return false; }
  try {
    const res = await fn();
    if (okMsg) toast(okMsg);
    await reload();
    return res ?? true;
  } catch (e) {
    toast(friendlyError(e).message, true);
    return false;
  }
}

// ---------- Nachschlagen ----------
export const memberName = (id) => S.D?.members.get(id)?.name || '—';
export const itemOf = (id) => S.D?.items.get(id);
export const itemName = (id) => itemOf(id)?.name || '—';
export const unitOf = (id) => itemOf(id)?.unit || '';
export const qtyText = (itemId, q) => fmtQty(q, unitOf(itemId));
export const locName = (id) => (id ? S.D?.locations.get(id)?.name || '—' : 'ohne Lagerort');
export const catOf = (id) => (id ? S.D?.categories.get(id) : null);
export const manName = (id) => (id ? S.D?.manufacturers.get(id)?.name || '' : '');
export const userName = (uid) => S.D?.memberByUser.get(uid)?.name || 'Unbekannt';
export const isAdmin = () => S.me?.role === 'admin' && S.me?.active;
export const isDemo = () => S.backend?.mode === 'demo';

export const activeMembers = () => S.data.members.filter((m) => m.active);
export const activeOf = (table) => S.data[table].filter((x) => !x.archived);
export const optionsOf = (table, emptyLabel) => [...(emptyLabel ? [['', emptyLabel]] : []), ...activeOf(table).map((x) => [x.id, x.name])];
export const lotLabel = (lot) => [locName(lot.location_id), lot.batch ? `Charge ${lot.batch}` : null].filter(Boolean).join(' · ');

export function canDeleteEntry(e) {
  if (S.readonly) return false;
  if (isAdmin()) return true;
  const uid = S.session?.user?.id;
  return e.rows.some((r) => r.created_by === uid || r.owner_id === S.me.id);
}

// Was gehört wem? Eine Zeile je Artikel und Person.
export function ownedPositions({ person = '', cat = '', text = '' } = {}) {
  const t = text.trim().toLowerCase();
  const out = [];
  for (const it of S.data.items) {
    if (cat && it.category_id !== cat) continue;
    if (t && ![it.name, it.sku, it.ean, manName(it.manufacturer_id), catOf(it.category_id)?.name].some((v) => v && String(v).toLowerCase().includes(t))) continue;
    const unit = S.D.unitValue(it.id);
    for (const m of S.data.members) {
      if (person && m.id !== person) continue;
      const qty = S.D.qty(it.id, m.id);
      if (qty > 0) out.push({ item: it, owner_id: m.id, qty, unit, value: unit == null ? null : qty * unit });
    }
  }
  return out;
}

// Inventurliste: eine Zeile je Person, Artikel, Lagerort und Charge
export function inventoryLots(person = '') {
  return [...S.D.lots.values()]
    .filter((l) => l.qty > 0 && (!person || l.owner_id === person))
    .map((l) => { const unit = S.D.unitValue(l.item_id); return { ...l, item: S.D.items.get(l.item_id), unit, value: unit == null ? null : l.qty * unit }; })
    .sort((a, b) => memberName(a.owner_id).localeCompare(memberName(b.owner_id), 'de') || (a.item?.name || '').localeCompare(b.item?.name || '', 'de')
      || locName(a.location_id).localeCompare(locName(b.location_id), 'de') || String(a.batch || '').localeCompare(String(b.batch || '')));
}

export const isLow = (i) => i.min_qty != null && S.D.qty(i.id) < Number(i.min_qty);
export function catDot(catId) {
  const c = catOf(catId);
  return c ? el('span', { class: 'cat-dot', style: { background: c.color }, title: c.name }) : null;
}
export const go = (hash) => { if (location.hash === hash) hooks.render(); else location.hash = hash; };
