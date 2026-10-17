// Datenzugriff: entweder echte Supabase-Datenbank oder lokale Demo (nur auf diesem Gerät).
// Beide haben genau dieselben Funktionen, damit die Oberfläche nichts davon merkt.

import { splitPrice, lotKey, EPS } from './calc.js';

export const TABLES = ['members', 'categories', 'manufacturers', 'suppliers', 'locations', 'items', 'movements', 'settlements'];
const SUPABASE_LIB = 'vendor/supabase-2.117.3.js';
const BUCKET = 'lager-fotos';

// ---------- Fehlermeldungen verständlich machen ----------
export function friendlyError(e) {
  if (!e) return new Error('Unbekannter Fehler.');
  const msg = String(e.message || e.error_description || e.msg || e);
  const code = e.code || '';
  const has = (s) => msg.toLowerCase().includes(s.toLowerCase());
  let out = msg;
  if (has('Failed to fetch') || has('NetworkError') || has('Load failed') || has('network request failed')) out = 'Keine Verbindung zum Server. Bitte Internet prüfen.';
  else if (has('Invalid login credentials')) out = 'E-Mail oder Passwort falsch.';
  else if (has('Email not confirmed')) out = 'Bitte zuerst den Bestätigungs-Link in deiner E-Mail antippen.';
  else if (has('Database error saving new user') || has('nicht eingeladen')) out = 'Diese E-Mail-Adresse ist nicht eingeladen. Bitte frag euren Admin, ob er dich in der App einlädt.';
  else if (has('User already registered') || has('already been registered')) out = 'Für diese E-Mail gibt es schon ein Konto. Bitte einfach einloggen.';
  else if (has('Password should be') || has('weak_password') || has('Password is known')) out = 'Das Passwort ist zu kurz oder zu einfach. Bitte mindestens 8 Zeichen verwenden.';
  else if (has('rate limit') || has('too many') || code === 'over_email_send_rate_limit') out = 'Zu viele Versuche. Bitte ein paar Minuten warten.';
  else if (has('JWT expired') || has('invalid JWT') || code === 'PGRST301') out = 'Deine Anmeldung ist abgelaufen. Bitte neu einloggen.';
  else if (code === '23505') out = 'Diesen Namen bzw. diese E-Mail gibt es schon.';
  else if (code === '23503') out = 'Das wird noch verwendet (z. B. in Buchungen) und kann nicht gelöscht werden. Du kannst es stattdessen deaktivieren bzw. archivieren.';
  else if (code === '23514') out = 'Eine Eingabe ist ungültig (z. B. zu lang oder kleiner als 0).';
  else if (has('row-level security') || has('permission denied')) out = 'Dafür hast du keine Berechtigung.';
  else if (has('Bucket not found')) out = 'Foto-Speicher fehlt. Bitte das Datenbank-Skript (supabase-setup.sql) nochmal ausführen.';
  else if (has('relation') && has('does not exist')) out = 'Die Datenbank ist noch nicht eingerichtet. Bitte das Skript supabase-setup.sql in Supabase ausführen.';
  const err = new Error(out);
  err.code = code; err.original = msg;
  return err;
}

const ok = ({ data, error }) => { if (error) throw friendlyError(error); return data; };

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Programmteil konnte nicht geladen werden. Bitte Internet prüfen.'));
    document.head.append(s);
  });
}

// =====================================================================
//  Supabase
// =====================================================================
export async function createSupabaseBackend(url, key) {
  if (!window.supabase) await loadScript(SUPABASE_LIB);
  const sb = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'lager-auth' },
  });

  async function fetchAll(table, order) {
    const out = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      let q = sb.from(table).select('*').range(from, from + page - 1);
      for (const [col, asc] of order) q = q.order(col, { ascending: asc });
      const rows = ok(await q);
      out.push(...rows);
      if (rows.length < page) break;
    }
    return out;
  }

  return {
    mode: 'supabase',
    async getSession() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuthChange(cb) { sb.auth.onAuthStateChange((event, session) => cb(event, session)); },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password) {
      const data = ok(await sb.auth.signUp({ email, password, options: { emailRedirectTo: baseUrl() } }));
      // Supabase verrät bei schon registrierten Adressen nichts – leere identities heißt "gibt es schon"
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error('Für diese E-Mail gibt es schon ein Konto. Bitte einfach einloggen.');
      }
      return { needsConfirm: !data.session };
    },
    async signOut() { try { await sb.auth.signOut(); } catch { /* offline ist ok */ } },
    async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: baseUrl() })); },
    async updatePassword(password) { ok(await sb.auth.updateUser({ password })); },
    async claimMembership() { return ok(await sb.rpc('claim_membership')); },

    async loadAll() {
      const [members, categories, manufacturers, suppliers, locations, items, movements, settlements] = await Promise.all([
        fetchAll('members', [['name', true]]),
        fetchAll('categories', [['name', true]]),
        fetchAll('manufacturers', [['name', true]]),
        fetchAll('suppliers', [['name', true]]),
        fetchAll('locations', [['name', true]]),
        fetchAll('items', [['name', true]]),
        fetchAll('movements', [['happened_on', false], ['created_at', false], ['id', true]]),
        fetchAll('settlements', [['happened_on', false], ['created_at', false]]),
      ]);
      return { members, categories, manufacturers, suppliers, locations, items, movements, settlements };
    },
    async loadLog(limit = 200) { return ok(await sb.from('log').select('*').order('at', { ascending: false }).limit(limit)); },

    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, id, patch) { return ok(await sb.from(table).update(patch).eq('id', id).select().single()); },
    async remove(table, id) {
      const rows = ok(await sb.from(table).delete().eq('id', id).select());
      if (!rows.length) throw new Error('Löschen nicht möglich (keine Berechtigung).');
    },

    async bookPurchase(p) {
      return ok(await sb.rpc('book_purchase', {
        p_item: p.item_id, p_splits: p.splits.map((s) => ({ owner: s.owner_id, qty: s.qty })), p_date: p.happened_on,
        p_paid_by: p.paid_by, p_price_total: p.price_total, p_location: p.location_id, p_supplier: p.supplier_id,
        p_batch: p.batch, p_invoice: p.invoice_no, p_note: p.note,
      }));
    },
    async bookMovements(rows) { return ok(await sb.from('movements').insert(rows).select()); },
    async bookTransfer(p) {
      return ok(await sb.rpc('book_transfer', {
        p_item: p.item_id, p_from: p.from, p_to: p.to, p_qty: p.qty, p_date: p.happened_on, p_note: p.note,
        p_from_location: p.from_location, p_batch: p.batch, p_to_location: p.to_location,
      }));
    },
    async deleteMovement(id) { return ok(await sb.rpc('delete_movement', { p_id: id })); },

    async uploadPhoto(itemId, blob) {
      const path = `items/${itemId}/${Date.now()}.jpg`;
      ok(await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
      return path;
    },
    async deletePhoto(path) { if (path && !path.startsWith('data:')) await sb.storage.from(BUCKET).remove([path]); },
    async photoUrls(paths) {
      const list = [...new Set(paths.filter(Boolean))];
      if (!list.length) return new Map();
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(list, 3600);
      if (error) return new Map();
      return new Map(data.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
    },
  };
}

export const baseUrl = () => location.origin + location.pathname;

// =====================================================================
//  Demo (alles nur lokal im Browser gespeichert)
// =====================================================================
const DEMO_KEY = 'lager-demo-v2';
const DEMO_UID = 'demo-user-a';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export function createDemoBackend() {
  let db = readDemo() || seedDemo();
  saveDemo();
  function saveDemo() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* Speicher voll: nur im Speicher weiter */ } }
  const me = () => db.members.find((m) => m.user_id === DEMO_UID);
  const isAdmin = () => me()?.role === 'admin' && me()?.active;
  const fail = (m) => { throw new Error(m); };
  const now = () => new Date().toISOString();

  function log(table, action, oldRow, newRow) {
    db.log.unshift({ id: (db.log[0]?.id || 0) + 1, at: now(), user_id: DEMO_UID, user_name: me()?.name || 'Demo', table_name: table, action, row_id: (newRow || oldRow)?.id, old_data: oldRow || null, new_data: newRow || null });
    if (db.log.length > 1000) db.log.length = 1000;
  }
  function checkUnique(table, row, field = 'name') {
    const v = String(row[field] || '').trim().toLowerCase();
    if (db[table].some((x) => x.id !== row.id && String(x[field] || '').trim().toLowerCase() === v)) {
      fail(field === 'email' ? 'Diese E-Mail gibt es schon.' : 'Diesen Namen gibt es schon.');
    }
  }
  function lotQty(item, owner, loc, batch) {
    const k = lotKey(item, owner, loc, batch);
    return db.movements.filter((m) => lotKey(m.item_id, m.owner_id, m.location_id, m.batch) === k)
      .reduce((s, m) => s + (m.kind === 'in' ? 1 : -1) * Number(m.qty), 0);
  }
  function checkLots(rows) {
    for (const r of rows) {
      const q = lotQty(r.item_id, r.owner_id, r.location_id, r.batch);
      if (q < -EPS) {
        const it = db.items.find((x) => x.id === r.item_id), ow = db.members.find((x) => x.id === r.owner_id);
        fail(`Nicht genug Bestand: ${ow?.name} hätte bei "${it?.name}" dann ${Math.round(q * 1000) / 1000} ${it?.unit} (an diesem Lagerort/Charge).`);
      }
    }
  }
  function addMovements(rows) {
    const created = rows.map((r) => ({
      id: uuid(), kind: r.kind, item_id: r.item_id, owner_id: r.owner_id, qty: Number(r.qty), happened_on: r.happened_on || todayStr(),
      reason: r.reason || 'sonstiges', location_id: r.location_id || null, batch: (r.batch || '').trim() || null,
      price_total: r.price_total ?? null, paid_by: r.paid_by || null, supplier_id: r.supplier_id || null,
      invoice_no: (r.invoice_no || '').trim() || null, note: (r.note || '').trim() || null, group_id: r.group_id || null,
      created_by: DEMO_UID, created_at: now(),
    }));
    for (const c of created) if (!(c.qty > 0)) fail('Die Menge muss größer als 0 sein.');
    const backup = db.movements;
    db.movements = [...created, ...db.movements];
    try { checkLots(created); } catch (e) { db.movements = backup; throw e; }
    created.forEach((c) => log('movements', 'insert', null, c));
    saveDemo();
    return created;
  }

  return {
    mode: 'demo',
    async getSession() { return { user: { id: DEMO_UID, email: me()?.email } }; },
    onAuthChange() {},
    async signIn() {}, async signUp() { return { needsConfirm: false }; }, async signOut() {},
    async resetPassword() {}, async updatePassword() {},
    async claimMembership() { return structuredClone(me()); },
    async loadAll() {
      const out = {};
      for (const t of TABLES) out[t] = structuredClone(db[t]);
      return out;
    },
    async loadLog(limit = 200) { return structuredClone(db.log.slice(0, limit)); },

    async insert(table, row) {
      if (table === 'members') {
        if (!isAdmin()) fail('Nur Admins dürfen Personen einladen.');
        checkUnique('members', row, 'email');
      } else if (table !== 'settlements') checkUnique(table, row);
      if (table === 'settlements' && row.from_member === row.to_member) fail('Bitte zwei verschiedene Personen wählen.');
      const r = { id: uuid(), ...row, created_at: now() };
      if (table === 'members') Object.assign(r, { role: row.role || 'mitglied', active: true, user_id: null });
      else Object.assign(r, { created_by: DEMO_UID });
      if (['categories', 'manufacturers', 'suppliers', 'locations', 'items'].includes(table)) r.archived = false;
      db[table].push(r);
      log(table, 'insert', null, r);
      saveDemo();
      return structuredClone(r);
    },
    async update(table, id, patch) {
      const i = db[table].findIndex((x) => x.id === id);
      if (i < 0) fail('Nicht gefunden.');
      const old = db[table][i];
      const next = { ...old, ...patch };
      if (table === 'members') {
        const own = old.user_id === DEMO_UID;
        if (!isAdmin() && (!own || Object.keys(patch).some((k) => k !== 'name'))) fail('Nur Admins dürfen das ändern.');
        if (patch.email && patch.email !== old.email && old.user_id) fail('Die E-Mail kann nach der Registrierung nicht mehr geändert werden.');
        checkUnique('members', next, 'email');
        const others = db.members.filter((m) => m.id !== id && m.role === 'admin' && m.active);
        if (!others.length && (next.role !== 'admin' || !next.active)) fail('Es muss mindestens einen aktiven Admin geben.');
      } else if (patch.name != null) checkUnique(table, next);
      db[table][i] = next;
      log(table, 'update', old, next);
      saveDemo();
      return structuredClone(next);
    },
    async remove(table, id) {
      const row = db[table].find((x) => x.id === id);
      if (!row) return;
      if (table === 'members') {
        if (!isAdmin()) fail('Nur Admins dürfen Personen entfernen.');
        if (row.user_id === DEMO_UID) fail('Du kannst dich nicht selbst entfernen.');
        const used = db.movements.some((m) => m.owner_id === id || m.paid_by === id) || db.settlements.some((s) => s.from_member === id || s.to_member === id);
        if (used) fail('Diese Person hat schon Buchungen und kann nicht gelöscht werden. Du kannst sie stattdessen deaktivieren.');
      } else if (table !== 'settlements') fail('Löschen ist hier nicht möglich – bitte archivieren.');
      db[table] = db[table].filter((x) => x.id !== id);
      log(table, 'delete', row, null);
      saveDemo();
    },

    async bookPurchase(p) {
      if (!p.splits?.length) fail('Bitte mindestens eine Person mit Menge angeben.');
      const g = uuid();
      const prices = splitPrice(p.price_total, p.splits.map((s) => s.qty));
      addMovements(p.splits.map((s, i) => ({
        item_id: p.item_id, owner_id: s.owner_id, kind: 'in', qty: s.qty, happened_on: p.happened_on, reason: 'kauf',
        location_id: p.location_id, batch: p.batch, price_total: prices[i], paid_by: p.price_total == null ? null : p.paid_by,
        supplier_id: p.supplier_id, invoice_no: p.invoice_no, note: p.note, group_id: g,
      })));
      return g;
    },
    async bookMovements(rows) { return addMovements(rows); },
    async bookTransfer(p) {
      if (p.from === p.to && (p.from_location || null) === (p.to_location || null)) fail('Bitte eine andere Person oder einen anderen Lagerort wählen.');
      const g = uuid();
      addMovements([
        { item_id: p.item_id, owner_id: p.from, kind: 'out', qty: p.qty, happened_on: p.happened_on, reason: 'uebertrag', location_id: p.from_location, batch: p.batch, note: p.note, group_id: g },
        { item_id: p.item_id, owner_id: p.to, kind: 'in', qty: p.qty, happened_on: p.happened_on, reason: 'uebertrag', location_id: p.to_location, batch: p.batch, note: p.note, group_id: g },
      ]);
      return g;
    },
    async deleteMovement(id) {
      const m = db.movements.find((x) => x.id === id);
      if (!m) return 0;
      const gone = db.movements.filter((x) => (m.group_id ? x.group_id === m.group_id : x.id === id));
      const backup = db.movements;
      db.movements = db.movements.filter((x) => !gone.includes(x));
      try { checkLots(gone); } catch (e) { db.movements = backup; throw e; }
      gone.forEach((g) => log('movements', 'delete', g, null));
      saveDemo();
      return gone.length;
    },

    async uploadPhoto(itemId, blob) {
      const { blobToDataURL } = await import('./ui.js');
      return blobToDataURL(blob);
    },
    async deletePhoto() {},
    async photoUrls(paths) { return new Map(paths.filter(Boolean).map((p) => [p, p])); },

    // nur Demo
    resetDemo() { db = seedDemo(); saveDemo(); },
    importDemo(json) {
      const data = json.data || json;
      for (const t of TABLES) if (!Array.isArray(data[t])) fail(`Die Datei ist kein gültiges Backup (es fehlt "${t}").`);
      const next = { log: [] };
      for (const t of TABLES) next[t] = data[t];
      if (!next.members.some((m) => m.user_id === DEMO_UID)) {
        const admin = next.members.find((m) => m.role === 'admin') || next.members[0];
        if (!admin) fail('Im Backup gibt es keine Personen.');
        next.members = next.members.map((m) => (m.user_id === DEMO_UID ? { ...m, user_id: null } : m));
        admin.user_id = DEMO_UID; admin.role = 'admin'; admin.active = true;
      }
      db = next; saveDemo();
    },
  };
}

function readDemo() {
  try {
    const d = JSON.parse(localStorage.getItem(DEMO_KEY));
    if (d && TABLES.every((t) => Array.isArray(d[t]))) { d.log ||= []; return d; }
  } catch { /* kaputt → neu */ }
  return null;
}
export function demoExists() { return !!readDemo(); }

function todayStr(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function ean13(base12) {
  const digits = base12.split('').map(Number);
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

// Beispieldaten: 3 Personen, Stammdaten, 10 Artikel, ~30 Buchungen der letzten Monate
function seedDemo() {
  const t0 = new Date(Date.now() - 200 * 864e5).toISOString();
  const id = () => uuid();
  const M = { a: id(), b: id(), c: id() };
  const U = { a: DEMO_UID, b: 'demo-user-b', c: 'demo-user-c' };
  const members = [
    { id: M.a, email: 'alex@beispiel.de', name: 'Alex', role: 'admin', active: true, user_id: U.a, created_at: t0 },
    { id: M.b, email: 'benni@beispiel.de', name: 'Benni', role: 'mitglied', active: true, user_id: U.b, created_at: t0 },
    { id: M.c, email: 'chris@beispiel.de', name: 'Chris', role: 'mitglied', active: true, user_id: U.c, created_at: t0 },
  ];
  const base = { archived: false, created_by: U.a, created_at: t0 };
  const C = { pulver: id(), zuend: id(), huel: id(), gesch: id(), zub: id() };
  const categories = [
    { id: C.pulver, name: 'Pulver', color: '#d97706' }, { id: C.zuend, name: 'Zündmittel', color: '#dc2626' },
    { id: C.huel, name: 'Hülsen', color: '#2563eb' }, { id: C.gesch, name: 'Geschosse', color: '#7c3aed' },
    { id: C.zub, name: 'Zubehör', color: '#059669' },
  ].map((x) => ({ ...base, ...x }));
  const H = { nord: id(), alpen: id(), west: id() };
  const manufacturers = [
    { id: H.nord, name: 'Nordwerk', country: 'Deutschland', website: 'https://example.com/nordwerk', notes: 'Gute Qualität, oft lieferbar.' },
    { id: H.alpen, name: 'Alpen Präzision', country: 'Österreich', website: null, notes: null },
    { id: H.west, name: 'Westline Supply', country: 'USA', website: 'https://example.com/westline', notes: 'Lange Lieferzeiten.' },
  ].map((x) => ({ ...base, ...x }));
  const S = { markt: id(), shop: id(), stand: id() };
  const suppliers = [
    { id: S.markt, name: 'Fachhandel am Markt', address: 'Musterstraße 1, 12345 Musterstadt', phone: '01234 567890', email: 'info@beispiel.de', website: null, customer_no: 'K-1001', notes: 'Samstags bis 14 Uhr offen.' },
    { id: S.shop, name: 'Versand-Shop 24', address: null, phone: null, email: 'service@beispiel.de', website: 'https://example.com/shop', customer_no: '778812', notes: 'Versandkostenfrei ab 100 €.' },
    { id: S.stand, name: 'Vereinsheim-Shop', address: 'Am Schießstand 3, 12345 Musterstadt', phone: null, email: null, website: null, customer_no: null, notes: null },
  ].map((x) => ({ ...base, ...x }));
  const L = { keller: id(), garage: id(), werk: id() };
  const locations = [
    { id: L.keller, name: 'Keller-Schrank', description: 'Verschlossener Stahlschrank im Keller' },
    { id: L.garage, name: 'Garage', description: 'Regal hinten links' },
    { id: L.werk, name: 'Werkstatt', description: 'Werkbank und Schubladen' },
  ].map((x) => ({ ...base, ...x }));
  const I = Array.from({ length: 10 }, id);
  const items = [
    { id: I[0], name: 'Pulver Typ A', category_id: C.pulver, manufacturer_id: H.nord, sku: 'NW-A500', ean: ean13('400638100001'), default_location_id: L.keller, unit: 'g', min_qty: 500 },
    { id: I[1], name: 'Pulver Typ B', category_id: C.pulver, manufacturer_id: H.alpen, sku: 'AP-B250', ean: ean13('400638100002'), default_location_id: L.keller, unit: 'g', min_qty: 250 },
    { id: I[2], name: 'Zündhütchen klein', category_id: C.zuend, manufacturer_id: H.west, sku: 'WS-ZK', ean: ean13('400638100003'), default_location_id: L.keller, unit: 'Stück', min_qty: 500 },
    { id: I[3], name: 'Zündhütchen groß', category_id: C.zuend, manufacturer_id: H.west, sku: 'WS-ZG', ean: ean13('400638100004'), default_location_id: L.garage, unit: 'Stück', min_qty: 300 },
    { id: I[4], name: 'Hülsen Kaliber A', category_id: C.huel, manufacturer_id: H.nord, sku: 'NW-HA', ean: ean13('400638100005'), default_location_id: L.werk, unit: 'Stück', min_qty: 100 },
    { id: I[5], name: 'Hülsen Kaliber B', category_id: C.huel, manufacturer_id: H.alpen, sku: 'AP-HB', ean: ean13('400638100006'), default_location_id: L.werk, unit: 'Stück', min_qty: 300 },
    { id: I[6], name: 'Geschosse 10 g', category_id: C.gesch, manufacturer_id: H.alpen, sku: 'AP-G10', ean: ean13('400638100007'), default_location_id: L.werk, unit: 'Stück', min_qty: 200 },
    { id: I[7], name: 'Geschosse 12 g', category_id: C.gesch, manufacturer_id: H.nord, sku: 'NW-G12', ean: ean13('400638100008'), default_location_id: L.werk, unit: 'Stück', min_qty: 400 },
    { id: I[8], name: 'Digitalwaage', category_id: C.zub, manufacturer_id: H.west, sku: 'WS-W1', ean: ean13('400638100009'), default_location_id: L.werk, unit: 'Stück', min_qty: null },
    { id: I[9], name: 'Reinigungsset', category_id: C.zub, manufacturer_id: null, sku: null, ean: ean13('400638100010'), default_location_id: L.werk, unit: 'Stück', min_qty: null },
  ].map((x) => ({ ...base, notes: null, photo_path: null, ...x }));

  const movements = [];
  const settlements = [];
  let tick = 0;
  const stamp = (days) => new Date(Date.now() - days * 864e5 + (tick++) * 60000).toISOString();
  const P = (days, item, splits, price, payer, sup, loc, batch, inv) => {
    const g = id();
    const owners = Object.entries(splits);
    const prices = splitPrice(price, owners.map(([, q]) => q));
    owners.forEach(([o, q], i) => movements.push({ id: id(), item_id: I[item], owner_id: M[o], kind: 'in', qty: q, happened_on: todayStr(days), reason: 'kauf', location_id: L[loc], batch: batch || null, price_total: prices[i], paid_by: M[payer], supplier_id: S[sup], invoice_no: inv || null, note: null, group_id: g, created_by: U[payer], created_at: stamp(days) }));
  };
  const O = (days, item, o, qty, loc, batch, reason = 'verbrauch', price = null, note = null) => movements.push({ id: id(), item_id: I[item], owner_id: M[o], kind: 'out', qty, happened_on: todayStr(days), reason, location_id: L[loc], batch: batch || null, price_total: price, paid_by: null, supplier_id: null, invoice_no: null, note, group_id: null, created_by: U[o], created_at: stamp(days) });
  const IN = (days, item, o, qty, loc, batch, note) => movements.push({ id: id(), item_id: I[item], owner_id: M[o], kind: 'in', qty, happened_on: todayStr(days), reason: 'korrektur', location_id: L[loc], batch: batch || null, price_total: null, paid_by: null, supplier_id: null, invoice_no: null, note, group_id: null, created_by: U[o], created_at: stamp(days) });
  const T = (days, item, from, to, qty, floc, tloc, batch, note = null) => {
    const g = id();
    const common = { item_id: I[item], qty, happened_on: todayStr(days), reason: 'uebertrag', batch: batch || null, price_total: null, paid_by: null, supplier_id: null, invoice_no: null, note, group_id: g, created_by: U[from] };
    movements.push({ id: id(), ...common, owner_id: M[from], kind: 'out', location_id: L[floc], created_at: stamp(days) });
    movements.push({ id: id(), ...common, owner_id: M[to], kind: 'in', location_id: L[tloc], created_at: stamp(days) });
  };
  const SET = (days, from, to, amount, note) => settlements.push({ id: id(), from_member: M[from], to_member: M[to], amount, happened_on: todayStr(days), note, created_by: U[from], created_at: stamp(days) });

  P(170, 0, { a: 500, b: 500, c: 500 }, 135, 'a', 'markt', 'keller', 'N-2304', 'RE-1001');
  P(165, 2, { a: 1000, b: 1000, c: 1000 }, 180, 'b', 'shop', 'keller', 'Z-88', '2024-55812');
  P(160, 4, { a: 300, b: 200 }, 225, 'a', 'markt', 'werk', null, 'RE-1017');
  P(150, 6, { a: 500, c: 500 }, 220, 'c', 'shop', 'werk', 'G-10-7', '2024-56120');
  O(140, 0, 'a', 200, 'keller', 'N-2304');
  O(135, 2, 'b', 300, 'keller', 'Z-88');
  P(130, 8, { a: 1 }, 89, 'a', 'stand', 'werk', null, null);
  P(120, 1, { b: 500, c: 500 }, 110, 'b', 'markt', 'keller', 'AP-117', 'RE-1088');
  O(110, 6, 'a', 150, 'werk', 'G-10-7');
  T(105, 0, 'b', 'c', 100, 'keller', 'keller', 'N-2304', 'Für das Vereinsschießen');
  P(100, 3, { a: 1000 }, 70, 'a', 'shop', 'garage', 'Z-91', '2024-57002');
  SET(95, 'b', 'a', 30, 'Bar beim Training');
  O(90, 4, 'a', 100, 'werk', null);
  P(80, 7, { b: 250, c: 250 }, 130, 'c', 'shop', 'werk', 'G-12-3', '2024-57330');
  O(75, 1, 'c', 200, 'keller', 'AP-117');
  T(70, 3, 'a', 'a', 500, 'garage', 'keller', 'Z-91', 'Umgeräumt');
  P(60, 5, { a: 100, b: 100, c: 100 }, 165, 'b', 'markt', 'werk', null, 'RE-1140');
  O(55, 2, 'a', 400, 'keller', 'Z-88');
  P(50, 9, { c: 1 }, 24.9, 'c', 'stand', 'werk', null, null);
  O(45, 7, 'b', 120, 'werk', 'G-12-3');
  P(40, 0, { a: 500, b: 500 }, 92, 'b', 'markt', 'keller', 'N-2311', 'RE-1203');
  O(35, 0, 'c', 350, 'keller', 'N-2304');
  O(30, 6, 'c', 300, 'werk', 'G-10-7');
  IN(25, 2, 'c', 20, 'keller', 'Z-88', 'Inventur: 20 Stück mehr gefunden');
  P(20, 2, { a: 1000, c: 1000 }, 128, 'a', 'shop', 'keller', 'Z-95', '2024-58410');
  O(14, 5, 'b', 60, 'werk', null);
  P(10, 1, { a: 500 }, 56, 'a', 'markt', 'keller', 'AP-122', 'RE-1290');
  O(7, 0, 'a', 250, 'keller', 'N-2311');
  O(5, 4, 'b', 50, 'werk', null, 'verkauf', 25, 'An Vereinskollegen');
  P(3, 6, { b: 500 }, 115, 'a', 'shop', 'werk', 'G-10-9', '2024-59001');
  SET(2, 'c', 'b', 20, 'Überweisung');
  O(1, 3, 'a', 120, 'keller', 'Z-91');

  movements.sort((x, y) => y.happened_on.localeCompare(x.happened_on) || y.created_at.localeCompare(x.created_at));
  settlements.sort((x, y) => y.happened_on.localeCompare(x.happened_on));
  return { members, categories, manufacturers, suppliers, locations, items, movements, settlements, log: [] };
}
