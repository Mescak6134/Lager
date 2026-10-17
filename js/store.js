// Gemeinsamer Zustand der App + kleine Helfer für alle Ansichten.
import { derive } from './calc.js';
import { friendlyError } from './db.js';
import { toast, fmtQty, el } from './ui.js';

export const S = {
  backend: null,      // Datenzugriff (Supabase oder Demo)
  session: null,
  me: null,           // eigene Person (members-Zeile)
  data: null,         // Rohdaten aller Tabellen
  D: null,            // berechnete Werte (Bestand, Schulden …)
  readonly: false,    // offline → nur ansehen
  snapshotAt: null,
  photos: new Map(),  // photo_path → anzeigbare URL
  ui: {},             // Filter, Eingaben usw. pro Ansicht
  installPrompt: null,
};
export const hooks = { render: () => {}, logout: () => {} };

const SNAP_KEY = 'lager-snapshot';

export function setData(data) {
  S.data = data;
  S.D = derive(data);
}

export async function reload({ silent = false } = {}) {
  const data = await S.backend.loadAll();
  setData(data);
  S.readonly = false;
  S.snapshotAt = null;
  if (S.backend.mode === 'supabase') saveSnapshot();
  refreshPhotos();
  if (!silent) hooks.render();
}

async function refreshPhotos() {
  try {
    const paths = S.data.items.map((i) => i.photo_path).filter((p) => p && !S.photos.has(p));
    if (!paths.length) return;
    const urls = await S.backend.photoUrls(paths);
    let changed = false;
    for (const [p, u] of urls) { S.photos.set(p, u); changed = true; }
    if (changed) hooks.render();
  } catch { /* Fotos sind nicht wichtig */ }
}

export function saveSnapshot() {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify({ at: new Date().toISOString(), me: S.me, data: S.data })); } catch { /* voll */ }
}
export function loadSnapshot() {
  try {
    const s = JSON.parse(localStorage.getItem(SNAP_KEY));
    if (s && s.data && s.me) return s;
  } catch { /* */ }
  return null;
}
export function clearSnapshot() { try { localStorage.removeItem(SNAP_KEY); } catch { /* */ } }

// Schreib-Aktion ausführen: Fehler freundlich melden, danach neu laden
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

// ---------- Namen nachschlagen ----------
export const memberName = (id) => S.D?.members.get(id)?.name || '—';
export const itemOf = (id) => S.D?.items.get(id);
export const itemName = (id) => itemOf(id)?.name || '—';
export const unitOf = (id) => itemOf(id)?.unit || '';
export const qtyText = (itemId, q) => fmtQty(q, unitOf(itemId));
export const locName = (id) => (id ? S.D?.locations.get(id)?.name || '—' : 'ohne Lagerort');
export const supName = (id) => (id ? S.D?.suppliers.get(id)?.name || '—' : '');
export const catOf = (id) => (id ? S.D?.categories.get(id) : null);
export const manName = (id) => (id ? S.D?.manufacturers.get(id)?.name || '' : '');
export const userName = (uid) => S.D?.memberByUser.get(uid)?.name || 'Unbekannt';
export const isAdmin = () => S.me?.role === 'admin' && S.me?.active;
export const isDemo = () => S.backend?.mode === 'demo';

export const activeMembers = () => S.data.members.filter((m) => m.active);
export const memberOptions = (withAll) => [...(withAll ? [['', withAll]] : []), ...activeMembers().map((m) => [m.id, m.id === S.me?.id ? `${m.name} (ich)` : m.name])];
export const activeOf = (table) => S.data[table].filter((x) => !x.archived);
export const optionsOf = (table, emptyLabel) => [...(emptyLabel ? [['', emptyLabel]] : []), ...activeOf(table).map((x) => [x.id, x.name])];

export function lotLabel(lot) {
  const parts = [locName(lot.location_id)];
  if (lot.batch) parts.push(`Charge ${lot.batch}`);
  return parts.join(' · ');
}

export function canDeleteEntry(e) {
  if (S.readonly) return false;
  if (isAdmin()) return true;
  const uid = S.session?.user?.id;
  return e.rows.some((r) => r.created_by === uid || r.owner_id === S.me.id || r.paid_by === S.me.id);
}

export function catDot(catId) {
  const c = catOf(catId);
  if (!c) return null;
  return el('span', { class: 'cat-dot', style: { background: c.color }, title: c.name });
}

export const go = (hash) => { if (location.hash === hash) hooks.render(); else location.hash = hash; };
