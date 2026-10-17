// Datenzugriff: echte Supabase-Datenbank oder lokale Demo (nur auf diesem Gerät).
// Beide haben dieselben Funktionen – die Oberfläche merkt keinen Unterschied.
import { lotKey, EPS } from './calc.js';
import { LOGIN_DOMAIN } from './accounts.js';

export const TABLES = ['members', 'categories', 'manufacturers', 'locations', 'items', 'movements'];
const SUPABASE_LIB = 'vendor/supabase-2.117.3.js';
const PENDING_KEY = 'lager-mfa-pending';

// ---------- Fehlermeldungen kurz und auf Deutsch ----------
export function friendlyError(e) {
  if (!e) return new Error('Unbekannter Fehler.');
  const msg = String(e.message || e.error_description || e.msg || e);
  const code = e.code || '';
  const has = (s) => msg.toLowerCase().includes(s.toLowerCase());
  let out = msg;
  if (has('Failed to fetch') || has('NetworkError') || has('Load failed') || has('network request failed')) out = 'Keine Verbindung zum Server. Bitte Internet prüfen.';
  else if (code === 'invalid_credentials' || has('Invalid login credentials')) out = 'Benutzername oder Passwort falsch.';
  else if (code === 'email_not_confirmed' || has('Email not confirmed')) out = 'Konto noch nicht freigeschaltet. Bitte den Admin um ein neues Startpasswort bitten.';
  else if (code === 'signup_disabled' || has('Signups not allowed')) out = 'In Supabase ist „Allow new users to sign up“ aus. Bitte kurz einschalten (Authentication → Sign In / Providers → Email), dann nochmal versuchen.';
  else if (code === 'email_address_invalid' || (has('email') && has('invalid'))) out = `Supabase lehnt die interne Anmelde-Adresse (…@${LOGIN_DOMAIN}) ab. Bitte melden – die Domain in js/accounts.js muss dann angepasst werden.`;
  else if (has('Database error saving new user') || has('gibt es nicht oder er hat schon ein Konto')) out = 'Diesen Benutzer gibt es nicht oder er hat schon ein Konto.';
  else if (code === 'user_already_exists' || code === 'email_exists' || has('already registered')) out = 'Für diesen Benutzernamen gibt es schon ein Konto.';
  else if (code === 'weak_password' || has('Password should be') || has('Password is known')) out = 'Das Passwort ist zu kurz oder zu einfach. Bitte mindestens 8 Zeichen.';
  else if (code === 'same_password' || has('different from the old password')) out = 'Bitte ein anderes Passwort als das bisherige wählen.';
  else if (code === 'reauthentication_needed' || has('reauthenticat')) out = 'Bitte einmal ab- und wieder anmelden, dann das Passwort ändern.';
  else if (code === 'mfa_verification_failed' || has('Invalid TOTP code')) out = 'Der Code stimmt nicht. Bitte den aktuellen 6-stelligen Code eingeben (er wechselt alle 30 Sekunden).';
  else if (code === 'mfa_challenge_expired') out = 'Das hat zu lange gedauert. Bitte den Code nochmal eingeben.';
  else if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled' || has('MFA enroll is disabled')) out = 'Zwei-Faktor ist in Supabase aus. Bitte unter Authentication → Multi-Factor „TOTP“ einschalten.';
  else if (code === 'insufficient_aal' || has('AAL2 required')) out = 'Bitte zuerst den Zwei-Faktor-Code eingeben.';
  else if (code === 'too_many_enrolled_mfa_factors') out = 'Zu viele Zwei-Faktor-Einträge. Bitte den Admin, sie zurückzusetzen.';
  else if (has('rate limit') || has('too many') || code === 'over_request_rate_limit') out = 'Zu viele Versuche. Bitte ein paar Minuten warten.';
  else if (has('JWT expired') || has('invalid JWT') || code === 'PGRST301') out = 'Deine Anmeldung ist abgelaufen. Bitte neu anmelden.';
  else if (code === '23505') out = 'Diesen Namen gibt es schon.';
  else if (code === '23503') out = 'Das wird noch verwendet und kann nicht gelöscht werden. Bitte stattdessen archivieren bzw. deaktivieren.';
  else if (code === '23514') out = 'Eine Eingabe ist ungültig (z. B. zu lang oder kleiner als 0).';
  else if (has('row-level security') || has('permission denied')) out = 'Dafür hast du keine Berechtigung.';
  else if (has('relation') && has('does not exist')) out = 'Die Datenbank ist noch nicht eingerichtet. Bitte supabase-setup.sql in Supabase ausführen.';
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
  // Anmeldung bleibt gespeichert (auch nach Schließen der Home-Bildschirm-App) und wird automatisch erneuert
  const sb = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'lager-auth' },
  });

  async function fetchAll(table, order) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select('*').range(from, from + 999);
      for (const [col, asc] of order) q = q.order(col, { ascending: asc });
      const rows = ok(await q);
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }

  return {
    mode: 'supabase',
    async getSession() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuthChange(cb) { sb.auth.onAuthStateChange((event, session) => cb(event, session)); },
    // App kommt aus dem Hintergrund: Anmeldung auffrischen
    async resume() { try { sb.auth.startAutoRefresh(); await sb.auth.getSession(); } catch { /* offline */ } },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    // Ersteinrichtung: der Admin legt sein eigenes Konto an
    async signUpSelf(email, password, username) {
      const data = ok(await sb.auth.signUp({ email, password, options: { data: { username } } }));
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('Für diesen Benutzernamen gibt es schon ein Konto.');
      return { needsConfirm: !data.session };
    },
    async signOut() { try { await sb.auth.signOut(); } catch { /* offline ist ok */ } },
    async claimMembership() { return ok(await sb.rpc('claim_membership')); },
    async setupPending() { const { data, error } = await sb.rpc('setup_pending'); return !error && data === true; },

    // ---------- Zwei-Faktor + Pflicht-Passwortwechsel ----------
    async authState() {
      const lvl = ok(await sb.auth.mfa.getAuthenticatorAssuranceLevel());
      const { user } = ok(await sb.auth.getUser());
      const factors = user?.factors || [];
      return {
        level: lvl.currentLevel,
        verified: factors.filter((x) => x.status === 'verified' && x.factor_type === 'totp'),
        unverified: factors.filter((x) => x.status !== 'verified'),
        mustChangePassword: user?.user_metadata?.must_change_password === true,
      };
    },
    async mfaEnroll(userId) {
      const st = await this.authState();
      let pending = null;
      try { pending = JSON.parse(localStorage.getItem(PENDING_KEY)); } catch { /* */ }
      // Safari hat die Seite neu geladen, während man in der Passwörter-App war → gleiche Einrichtung weiterverwenden
      if (pending && pending.uid === userId && st.unverified.some((x) => x.id === pending.factorId)) {
        for (const x of st.unverified) if (x.id !== pending.factorId) await sb.auth.mfa.unenroll({ factorId: x.id });
        return pending;
      }
      for (const x of st.unverified) ok(await sb.auth.mfa.unenroll({ factorId: x.id }));
      let res = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Lager', issuer: 'Lager' });
      if (res.error && (res.error.code === 'mfa_factor_name_conflict' || /friendly name/i.test(res.error.message))) {
        res = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Lager ' + Date.now().toString(36), issuer: 'Lager' });
      }
      const data = ok(res);
      const out = { uid: userId, factorId: data.id, uri: data.totp.uri, secret: data.totp.secret, qr: data.totp.qr_code };
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(out)); } catch { /* */ }
      return out;
    },
    async mfaVerify(factorId, code) {
      ok(await sb.auth.mfa.challengeAndVerify({ factorId, code }));
      try { localStorage.removeItem(PENDING_KEY); } catch { /* */ }
    },
    async setOwnPassword(password) { ok(await sb.auth.updateUser({ password, data: { must_change_password: false } })); },

    // ---------- Admin ----------
    async maxMembers() { const { data, error } = await sb.rpc('max_members'); return error || !(data > 0) ? 3 : data; },
    async reset2fa(memberId) { return ok(await sb.rpc('reset_2fa', { p_member: memberId })); },
    async setTempPassword(memberId, password) { return ok(await sb.rpc('admin_set_temp_password', { p_member: memberId, p_password: password })); },
    // Konto anlegen mit EIGENEM, nicht gespeichertem Client – die Anmeldung des Admins bleibt unberührt
    async createLoginUser(email, password, username) {
      const tmp = window.supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'lager-anlegen-' + Date.now() },
      });
      const data = ok(await tmp.auth.signUp({ email, password, options: { data: { must_change_password: true, username } } }));
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('Für diesen Benutzernamen gibt es schon ein Konto.');
      return { needsConfirm: !data.session };
    },

    // ---------- Daten ----------
    async loadAll() {
      const [members, categories, manufacturers, locations, items, movements] = await Promise.all([
        fetchAll('members', [['name', true]]),
        fetchAll('categories', [['name', true]]),
        fetchAll('manufacturers', [['name', true]]),
        fetchAll('locations', [['name', true]]),
        fetchAll('items', [['name', true]]),
        fetchAll('movements', [['happened_on', false], ['created_at', false], ['id', true]]),
      ]);
      return { members, categories, manufacturers, locations, items, movements };
    },
    async loadLog(limit = 200) { return ok(await sb.from('log').select('*').order('at', { ascending: false }).limit(limit)); },
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, id, patch) { return ok(await sb.from(table).update(patch).eq('id', id).select().single()); },
    async remove(table, id) {
      const rows = ok(await sb.from(table).delete().eq('id', id).select());
      if (!rows.length) throw new Error('Löschen nicht möglich (keine Berechtigung).');
    },
    async bookIn(p) {
      return ok(await sb.rpc('book_in', {
        p_item: p.item_id, p_splits: p.splits.map((s) => ({ owner: s.owner_id, qty: s.qty })), p_unit_value: p.unit_value,
        p_date: p.happened_on, p_location: p.location_id, p_batch: p.batch, p_note: p.note,
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
  };
}

// =====================================================================
//  Demo (nur lokal im Browser, ohne Zwei-Faktor)
// =====================================================================
const DEMO_KEY = 'lager-demo-v4';
const DEMO_UID = 'demo-user-a';
const DEMO_MAX = 3; // wie public.max_members()
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
try { ['lager-demo-v2', 'lager-demo-v3'].forEach((k) => localStorage.removeItem(k)); } catch { /* alte Demo-Daten */ }

export function createDemoBackend() {
  let db = readDemo() || seedDemo();
  save();
  function save() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* voll */ } }
  const me = () => db.members.find((m) => m.user_id === DEMO_UID);
  const isAdmin = () => me()?.role === 'admin' && me()?.active;
  const fail = (m) => { throw new Error(m); };
  const now = () => new Date().toISOString();
  function log(table, action, oldRow, newRow) {
    db.log.unshift({ id: (db.log[0]?.id || 0) + 1, at: now(), user_id: DEMO_UID, user_name: me()?.name || 'Demo', table_name: table, action, row_id: (newRow || oldRow)?.id, old_data: oldRow || null, new_data: newRow || null });
    if (db.log.length > 1000) db.log.length = 1000;
  }
  function unique(table, row, field = 'name') {
    const v = String(row[field] || '').trim().toLowerCase();
    if (db[table].some((x) => x.id !== row.id && String(x[field] || '').trim().toLowerCase() === v)) fail(field === 'username' ? 'Diesen Benutzernamen gibt es schon.' : 'Diesen Namen gibt es schon.');
  }
  const cap = (id) => { if (db.members.filter((m) => m.active && m.id !== id).length >= DEMO_MAX) fail(`Maximal ${DEMO_MAX} Benutzer möglich. Bitte zuerst jemanden deaktivieren.`); };
  function lotQty(item, owner, loc, batch) {
    const k = lotKey(item, owner, loc, batch);
    return db.movements.filter((m) => lotKey(m.item_id, m.owner_id, m.location_id, m.batch) === k).reduce((s, m) => s + (m.kind === 'in' ? 1 : -1) * Number(m.qty), 0);
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
  function add(rows) {
    const created = rows.map((r) => ({
      id: uuid(), kind: r.kind, item_id: r.item_id, owner_id: r.owner_id, qty: Number(r.qty), happened_on: r.happened_on || dayStr(0),
      reason: r.reason || 'sonstiges', unit_value: r.kind === 'in' ? r.unit_value ?? null : null, location_id: r.location_id || null,
      batch: (r.batch || '').trim() || null, note: (r.note || '').trim() || null, group_id: r.group_id || null, created_by: DEMO_UID, created_at: now(),
    }));
    for (const c of created) if (!(c.qty > 0)) fail('Die Menge muss größer als 0 sein.');
    const backup = db.movements;
    db.movements = [...created, ...db.movements];
    try { checkLots(created); } catch (e) { db.movements = backup; throw e; }
    created.forEach((c) => log('movements', 'insert', null, c));
    save();
    return created;
  }
  return {
    mode: 'demo',
    async getSession() { return { user: { id: DEMO_UID, email: me()?.email } }; },
    onAuthChange() {}, async resume() {},
    async signIn() {}, async signOut() {}, async signUpSelf() { return { needsConfirm: false }; },
    async claimMembership() { return structuredClone(me()); },
    async setupPending() { return false; },
    async setOwnPassword() {},
    async maxMembers() { return DEMO_MAX; },
    async createLoginUser() { return { needsConfirm: false }; },
    async reset2fa(memberId) {
      const m = db.members.find((x) => x.id === memberId);
      if (!isAdmin()) fail('Nur Admins dürfen die Zwei-Faktor-Anmeldung zurücksetzen.');
      if (!m) fail('Diese Person gibt es nicht.');
      if (m.user_id === DEMO_UID) fail('Deine eigene Zwei-Faktor-Anmeldung kann nur ein anderer Admin zurücksetzen.');
      log('members', 'reset_2fa', { id: m.id, name: m.name, username: m.username }, null); save();
      return m.user_id ? 1 : 0;
    },
    async setTempPassword(memberId) {
      const m = db.members.find((x) => x.id === memberId);
      if (!isAdmin()) fail('Nur Admins dürfen Startpasswörter vergeben.');
      if (!m) fail('Diese Person gibt es nicht.');
      if (m.user_id === DEMO_UID) fail('Dein eigenes Passwort änderst du unter Mehr → Mein Konto.');
      log('members', 'temp_password', { id: m.id, name: m.name, username: m.username }, null); save();
      return true;
    },
    async loadAll() { const out = {}; for (const t of TABLES) out[t] = structuredClone(db[t]); return out; },
    async loadLog(limit = 200) { return structuredClone(db.log.slice(0, limit)); },
    async insert(table, row) {
      if (table === 'members') {
        if (!isAdmin()) fail('Nur Admins dürfen Benutzer anlegen.');
        unique('members', row, 'username'); cap(null);
      } else unique(table, row);
      const r = { id: uuid(), ...row, created_at: now() };
      if (table === 'members') Object.assign(r, { role: row.role || 'mitglied', active: true, user_id: 'demo-' + uuid() });
      else Object.assign(r, { created_by: DEMO_UID, archived: false });
      db[table].push(r); log(table, 'insert', null, r); save();
      return structuredClone(r);
    },
    async update(table, id, patch) {
      const i = db[table].findIndex((x) => x.id === id);
      if (i < 0) fail('Nicht gefunden.');
      const old = db[table][i], next = { ...old, ...patch };
      if (table === 'members') {
        if (!isAdmin() && (old.user_id !== DEMO_UID || Object.keys(patch).some((k) => k !== 'name'))) fail('Nur Admins dürfen das ändern.');
        if (next.active && !old.active) cap(id);
        if (!db.members.some((m) => m.id !== id && m.role === 'admin' && m.active) && (next.role !== 'admin' || !next.active)) fail('Es muss mindestens einen aktiven Admin geben.');
      } else if (patch.name != null) unique(table, next);
      db[table][i] = next; log(table, 'update', old, next); save();
      return structuredClone(next);
    },
    async remove(table, id) {
      const row = db[table].find((x) => x.id === id);
      if (!row) return;
      if (table !== 'members') fail('Löschen ist hier nicht möglich – bitte archivieren.');
      if (!isAdmin()) fail('Nur Admins dürfen Benutzer entfernen.');
      if (row.user_id === DEMO_UID) fail('Du kannst dich nicht selbst entfernen.');
      if (db.movements.some((m) => m.owner_id === id)) fail('Das wird noch verwendet und kann nicht gelöscht werden. Bitte stattdessen deaktivieren.');
      db.members = db.members.filter((x) => x.id !== id); log('members', 'delete', row, null); save();
    },
    async bookIn(p) {
      if (!p.splits?.length) fail('Bitte mindestens eine Person mit Menge angeben.');
      const g = p.splits.length > 1 ? uuid() : null;
      add(p.splits.map((s) => ({ item_id: p.item_id, owner_id: s.owner_id, kind: 'in', qty: s.qty, happened_on: p.happened_on, reason: 'zugang',
        unit_value: p.unit_value, location_id: p.location_id, batch: p.batch, note: p.note, group_id: g })));
      return g;
    },
    async bookMovements(rows) { return add(rows); },
    async bookTransfer(p) {
      if (p.from === p.to && (p.from_location || null) === (p.to_location || null)) fail('Bitte eine andere Person oder einen anderen Lagerort wählen.');
      const g = uuid();
      add([
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
      gone.forEach((x) => log('movements', 'delete', x, null)); save();
      return gone.length;
    },
    resetDemo() { db = seedDemo(); save(); },
  };
}

function readDemo() {
  try {
    const d = JSON.parse(localStorage.getItem(DEMO_KEY));
    if (d && TABLES.every((t) => Array.isArray(d[t]))) { d.log ||= []; return d; }
  } catch { /* kaputt → neu */ }
  return null;
}
export const demoExists = () => !!readDemo();

function dayStr(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function ean13(base12) {
  const sum = base12.split('').map(Number).reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

// Beispieldaten: 3 Personen, Stammdaten, 10 Artikel, Zugänge mit Einzelwert, Entnahmen, Überträge, eine Inventur
function seedDemo() {
  const t0 = new Date(Date.now() - 200 * 864e5).toISOString();
  const id = () => uuid();
  const M = { a: id(), b: id(), c: id() };
  const U = { a: DEMO_UID, b: 'demo-user-b', c: 'demo-user-c' };
  const member = (k, username, name, role) => ({ id: M[k], username, email: `${username}@${LOGIN_DOMAIN}`, name, role, active: true, user_id: U[k], created_at: t0 });
  const members = [member('a', 'alex', 'Alex', 'admin'), member('b', 'benni', 'Benni', 'mitglied'), member('c', 'chris', 'Chris', 'mitglied')];
  const base = { archived: false, created_by: U.a, created_at: t0 };
  const C = { pulver: id(), zuend: id(), huel: id(), gesch: id(), zub: id() };
  const categories = [
    { id: C.pulver, name: 'Pulver', color: '#d97706' }, { id: C.zuend, name: 'Zündmittel', color: '#dc2626' },
    { id: C.huel, name: 'Hülsen', color: '#2563eb' }, { id: C.gesch, name: 'Geschosse', color: '#7c3aed' }, { id: C.zub, name: 'Zubehör', color: '#059669' },
  ].map((x) => ({ ...base, ...x }));
  const H = { nord: id(), alpen: id(), west: id() };
  const manufacturers = [
    { id: H.nord, name: 'Nordwerk', country: 'Deutschland', website: null, notes: null },
    { id: H.alpen, name: 'Alpen Präzision', country: 'Österreich', website: null, notes: null },
    { id: H.west, name: 'Westline', country: 'USA', website: null, notes: null },
  ].map((x) => ({ ...base, ...x }));
  const L = { keller: id(), garage: id(), werk: id() };
  const locations = [
    { id: L.keller, name: 'Keller-Schrank', description: 'Verschlossener Stahlschrank' },
    { id: L.garage, name: 'Garage', description: 'Regal hinten links' },
    { id: L.werk, name: 'Werkstatt', description: 'Werkbank und Schubladen' },
  ].map((x) => ({ ...base, ...x }));
  const I = Array.from({ length: 10 }, id);
  const item = (n, name, cat, man, sku, loc, unit, min) => ({ ...base, id: I[n], name, category_id: C[cat], manufacturer_id: man ? H[man] : null, sku, ean: ean13('4006381000' + String(n + 1).padStart(2, '0')), default_location_id: L[loc], unit, min_qty: min, notes: null });
  const items = [
    item(0, 'Pulver Typ A', 'pulver', 'nord', 'NW-A500', 'keller', 'g', 500),
    item(1, 'Pulver Typ B', 'pulver', 'alpen', 'AP-B250', 'keller', 'g', 250),
    item(2, 'Zündhütchen klein', 'zuend', 'west', 'WS-ZK', 'keller', 'Stück', 500),
    item(3, 'Zündhütchen groß', 'zuend', 'west', 'WS-ZG', 'garage', 'Stück', 300),
    item(4, 'Hülsen Kaliber A', 'huel', 'nord', 'NW-HA', 'werk', 'Stück', 100),
    item(5, 'Hülsen Kaliber B', 'huel', 'alpen', 'AP-HB', 'werk', 'Stück', 300),
    item(6, 'Geschosse 10 g', 'gesch', 'alpen', 'AP-G10', 'werk', 'Stück', 200),
    item(7, 'Geschosse 12 g', 'gesch', 'nord', 'NW-G12', 'werk', 'Stück', 400),
    item(8, 'Digitalwaage', 'zub', 'west', 'WS-W1', 'werk', 'Stück', null),
    item(9, 'Reinigungsset', 'zub', null, null, 'werk', 'Stück', null),
  ];
  const movements = [];
  let tick = 0;
  const stamp = (days) => new Date(Date.now() - days * 864e5 + (tick++) * 60000).toISOString();
  const row = (days, x) => ({ id: id(), happened_on: dayStr(days), unit_value: null, location_id: null, batch: null, note: null, group_id: null, created_at: stamp(days), ...x });
  const IN = (days, n, splits, uv, loc, batch) => {
    const g = Object.keys(splits).length > 1 ? id() : null;
    for (const [o, q] of Object.entries(splits)) movements.push(row(days, { item_id: I[n], owner_id: M[o], kind: 'in', qty: q, reason: 'zugang', unit_value: uv, location_id: L[loc], batch: batch || null, group_id: g, created_by: U.a }));
  };
  const OUT = (days, n, o, q, loc, batch, reason = 'verbrauch', note = null) => movements.push(row(days, { item_id: I[n], owner_id: M[o], kind: 'out', qty: q, reason, location_id: L[loc], batch: batch || null, note, created_by: U[o] }));
  const KORR = (days, n, o, q, loc, batch, note) => movements.push(row(days, { item_id: I[n], owner_id: M[o], kind: 'in', qty: q, reason: 'korrektur', location_id: L[loc], batch: batch || null, note, created_by: U[o] }));
  const T = (days, n, from, to, q, floc, tloc, batch, note = null) => {
    const g = id();
    const common = { item_id: I[n], qty: q, reason: 'uebertrag', batch: batch || null, note, group_id: g, created_by: U[from] };
    movements.push(row(days, { ...common, owner_id: M[from], kind: 'out', location_id: L[floc] }));
    movements.push(row(days, { ...common, owner_id: M[to], kind: 'in', location_id: L[tloc] }));
  };
  IN(170, 0, { a: 500, b: 500, c: 500 }, 0.09, 'keller', 'N-2304');
  IN(165, 2, { a: 1000, b: 1000, c: 1000 }, 0.06, 'keller', 'Z-88');
  IN(160, 4, { a: 300, b: 200 }, 0.45, 'werk');
  IN(150, 6, { a: 500, c: 500 }, 0.22, 'werk', 'G-10-7');
  OUT(140, 0, 'a', 200, 'keller', 'N-2304');
  OUT(135, 2, 'b', 300, 'keller', 'Z-88');
  IN(130, 8, { a: 1 }, 89, 'werk');
  IN(120, 1, { b: 500, c: 500 }, 0.11, 'keller', 'AP-117');
  OUT(110, 6, 'a', 150, 'werk', 'G-10-7');
  T(105, 0, 'b', 'c', 100, 'keller', 'keller', 'N-2304', 'Für das Vereinsschießen');
  IN(100, 3, { a: 1000 }, 0.07, 'garage', 'Z-91');
  OUT(90, 4, 'a', 100, 'werk');
  IN(80, 7, { b: 250, c: 250 }, 0.26, 'werk', 'G-12-3');
  OUT(75, 1, 'c', 200, 'keller', 'AP-117');
  T(70, 3, 'a', 'a', 500, 'garage', 'keller', 'Z-91', 'Umgeräumt');
  IN(60, 5, { a: 100, b: 100, c: 100 }, 0.55, 'werk');
  OUT(55, 2, 'a', 400, 'keller', 'Z-88');
  IN(50, 9, { c: 1 }, 24.9, 'werk');
  OUT(45, 7, 'b', 120, 'werk', 'G-12-3');
  IN(40, 0, { a: 500, b: 500 }, 0.092, 'keller', 'N-2311');
  OUT(35, 0, 'c', 350, 'keller', 'N-2304');
  OUT(30, 6, 'c', 300, 'werk', 'G-10-7');
  KORR(25, 2, 'c', 20, 'keller', 'Z-88', 'Inventur: 20 Stück mehr gefunden');
  IN(20, 2, { a: 1000, c: 1000 }, 0.064, 'keller', 'Z-95');
  OUT(14, 5, 'b', 60, 'werk');
  IN(10, 1, { a: 500 }, 0.112, 'keller', 'AP-122');
  OUT(7, 0, 'a', 250, 'keller', 'N-2311');
  IN(3, 6, { b: 500 }, 0.23, 'werk', 'G-10-9');
  OUT(1, 3, 'a', 120, 'keller', 'Z-91');
  movements.sort((x, y) => y.happened_on.localeCompare(x.happened_on) || y.created_at.localeCompare(x.created_at));
  return { members, categories, manufacturers, locations, items, movements, log: [] };
}
