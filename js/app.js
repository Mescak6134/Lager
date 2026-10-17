// Start der App: Verbindung, Anmeldung (Benutzername), Pflicht-Passwort, Zwei-Faktor, Navigation.
import * as CONFIG from '../config.js';
import { createSupabaseBackend, createDemoBackend, friendlyError, demoExists } from './db.js';
import { S, hooks, reload, setData, loadSnapshot, clearSnapshot, isDemo } from './store.js';
import { el, clear, icon, toast } from './ui.js';
import { loginEmail, displayLogin, normalizeUsername, validUsername } from './accounts.js';
import { enrollScreen, challengeScreen } from './mfa.js';
import { stock, itemDetail } from './views/stock.js';
import { add } from './views/add.js';
import { history as historyView } from './views/history.js';
import { more, account, logView, users, inventoryList } from './views/more.js';
import { inventory } from './views/inventory.js';
import { masterdata } from './views/masterdata.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const offlineBanner = document.getElementById('offline');

const ROUTES = {
  bestand: stock, artikel: itemDetail, plus: add, verlauf: historyView, mehr: more,
  inventur: inventory, inventurliste: inventoryList, stammdaten: masterdata, benutzer: users, konto: account, protokoll: logView,
};
const NAV = [['bestand', 'Bestand', 'box'], ['plus', 'Hinzufügen', 'plus'], ['verlauf', 'Verlauf', 'list'], ['mehr', 'Mehr', 'menu']];
const NAV_OF = { artikel: 'bestand' };

let screen = 'loading'; // loading | setup | login | firstrun | password | mfa | noaccess | main
let lastRoute = '';

function parseRoute() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, query] = raw.split('?');
  const parts = (path || 'bestand').split('/').filter(Boolean);
  return { parts, q: Object.fromEntries(new URLSearchParams(query || '')), key: raw };
}

async function renderMain() {
  const r = parseRoute();
  const view = ROUTES[r.parts[0]] || stock;
  const active = NAV_OF[r.parts[0]] || (NAV.some(([k]) => k === r.parts[0]) ? r.parts[0] : ROUTES[r.parts[0]] ? 'mehr' : 'bestand');
  clear(nav).append(...NAV.map(([k, label, ic]) =>
    el('a', { href: '#' + k, class: k === 'plus' ? 'plus' : '', 'aria-current': k === active ? 'page' : null }, icon(ic), el('span', { text: label }))));
  const y = window.scrollY;
  let node;
  try { node = await view(r); } catch (e) { console.error(e); node = el('div', { class: 'error', text: 'Fehler beim Anzeigen: ' + (e.message || e) }); }
  clear(app).append(node);
  if (r.key !== lastRoute) { window.scrollTo(0, 0); lastRoute = r.key; } else window.scrollTo(0, y);
  document.body.classList.remove('no-nav');
  nav.hidden = false;
}
hooks.render = () => { if (screen === 'main') renderMain(); };
window.addEventListener('hashchange', () => { if (screen === 'main') renderMain(); });

function showScreen(name, node) {
  screen = name;
  nav.hidden = true;
  document.body.classList.add('no-nav');
  clear(app).append(node);
  window.scrollTo(0, 0);
}
function logo(sub) {
  return el('div', { class: 'logo' }, el('img', { src: 'icons/icon-192.png', alt: '' }), el('h1', { text: 'Lager' }), el('p', { class: 'sub', text: sub || 'Was gehört wem – und was ist es wert?' }));
}
const splash = (t) => el('div', { class: 'splash' }, el('img', { src: 'icons/icon-192.png', alt: '', width: 72, height: 72 }), el('p', { text: t }));

// ---------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------
function storedConfig() {
  const url = String(CONFIG.SUPABASE_URL || ''), key = String(CONFIG.SUPABASE_KEY || '');
  if (/^https:\/\//.test(url) && key && !key.startsWith('HIER-')) return { url, key };
  try { const c = JSON.parse(localStorage.getItem('lager-config')); if (c && c.url && c.key) return c; } catch { /* */ }
  return null;
}

async function boot() {
  registerSW();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installPrompt = e; });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', () => updateOffline());
  if (localStorage.getItem('lager-mode') === 'demo') return startDemo();
  const cfg = storedConfig();
  if (!cfg) return showSetup();
  return startSupabase(cfg);
}

async function startDemo() {
  try { localStorage.setItem('lager-mode', 'demo'); } catch { /* */ }
  S.backend = createDemoBackend();
  S.session = await S.backend.getSession();
  S.me = await S.backend.claimMembership();
  await reload({ silent: true });
  enterMain();
}

async function startSupabase(cfg) {
  try { S.backend = await createSupabaseBackend(cfg.url, cfg.key); } catch (e) { return offlineOr(e); }
  S.backend.onAuthChange((event, session) => {
    S.session = session;
    if (event === 'SIGNED_OUT' && !['login', 'setup', 'firstrun'].includes(screen)) showLogin();
  });
  let session = null;
  try { session = await S.backend.getSession(); } catch { /* offline */ }
  S.session = session;
  if (!session) return showLogin();
  return afterLogin();
}

// Nach dem Anmelden (oder beim Öffnen mit gespeicherter Anmeldung)
async function afterLogin() {
  showScreen('loading', splash('Lade Daten …'));
  let me;
  try { me = await S.backend.claimMembership(); } catch (e) { return offlineOr(e); }
  if (!me) return showNoAccess('Dieses Konto gehört zu keinem Benutzer der App.');
  if (!me.active) return showNoAccess('Dein Zugang wurde deaktiviert. Bitte wende dich an euren Admin.');
  S.me = me;
  if (S.backend.mode === 'supabase') {
    let st;
    try { st = await S.backend.authState(); } catch (e) { return offlineOr(e); }
    // 1. Startpasswort? Erst eigenes Passwort (wer schon einen Code hat, gibt ihn vorher ein – Supabase verlangt dann aal2)
    if (st.mustChangePassword && !(st.verified.length && st.level !== 'aal2')) return showMustChangePassword();
    // 2. Zwei-Faktor ist Pflicht
    if (st.level !== 'aal2') {
      const done = async (factorId, code, msg) => { await S.backend.mfaVerify(factorId, code); if (msg) toast(msg); await afterLogin(); };
      if (st.verified.length) return showScreen('mfa', challengeScreen({ logo, onLogout: logout, verify: (code) => done(st.verified[0].id, code) }));
      let factorId = null;
      return showScreen('mfa', enrollScreen({
        logo, onLogout: logout,
        enroll: async () => { const f = await S.backend.mfaEnroll(S.session?.user?.id); factorId = f.factorId; return f; },
        verify: (code) => done(factorId, code, 'Zwei-Faktor ist eingerichtet. 👍'),
      }));
    }
    S.mfa = st.verified[0] || null;
    try { S.maxMembers = await S.backend.maxMembers(); } catch { /* bleibt 3 */ }
  }
  try { await reload({ silent: true }); } catch (e) { return offlineOr(e); }
  enterMain();
}

function enterMain() {
  screen = 'main';
  updateOffline();
  if (!location.hash || location.hash === '#') window.history.replaceState(null, '', '#bestand');
  renderMain();
}

// Ohne Verbindung: letzten Stand zeigen (nur lesen)
function offlineOr(e) {
  const snap = loadSnapshot();
  if (snap && (!navigator.onLine || /Verbindung|geladen/.test(friendlyError(e).message))) {
    S.me = snap.me; setData(snap.data); S.readonly = true; S.snapshotAt = snap.at;
    S.session = S.session || { user: { id: snap.me.user_id } };
    screen = 'main'; updateOffline(true); renderMain();
    return;
  }
  showScreen('error', el('div', { class: 'auth' }, logo(), el('div', { class: 'error', text: friendlyError(e).message }),
    el('button', { class: 'btn primary block', onclick: () => location.reload() }, icon('refresh'), 'Nochmal versuchen')));
}
function updateOffline(force) {
  const off = force || !navigator.onLine;
  offlineBanner.hidden = !(off && screen === 'main' && !isDemo());
  if (off && S.backend?.mode === 'supabase') S.readonly = true;
}
async function onOnline() {
  offlineBanner.hidden = true;
  if (screen !== 'main' || isDemo()) return;
  try { if (!S.backend) return location.reload(); await reload(); toast('Wieder online – Daten aktualisiert.'); } catch { updateOffline(true); }
}
// App kommt aus dem Hintergrund: Anmeldung auffrischen, Daten neu laden
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.backend || isDemo()) return;
  await S.backend.resume();
  if (screen !== 'main' || S.readonly) return;
  try { await reload(); } catch { /* still */ }
});

// ---------------------------------------------------------------------
//  Bildschirme ohne Anmeldung
// ---------------------------------------------------------------------
function showSetup() {
  const url = el('input', { type: 'url', placeholder: 'https://xxxx.supabase.co', autocomplete: 'off', autocapitalize: 'none' });
  const key = el('input', { type: 'text', placeholder: 'sb_publishable_…', autocomplete: 'off', autocapitalize: 'none' });
  const err = el('div', { class: 'error', hidden: true });
  showScreen('setup', el('div', { class: 'auth' },
    logo('Noch ist keine Datenbank verbunden.'),
    el('div', { class: 'card' },
      el('h2', { text: 'Erst mal ausprobieren' }),
      el('p', { class: 'sub', text: 'Die Demo zeigt die App mit Beispieldaten. Alles bleibt nur auf diesem Gerät.' }),
      el('button', { class: 'btn primary block mt', onclick: () => startDemo() }, icon('box'), demoExists() ? 'Demo öffnen' : 'Demo ansehen')),
    el('details', { class: 'card' },
      el('summary', { text: 'Eigene Datenbank verbinden' }),
      el('p', { class: 'sub', text: 'Normalerweise steht das fest in config.js. Zum Testen geht es auch hier:' }),
      err,
      el('label', { class: 'field mt' }, el('span', { class: 'lbl', text: 'Supabase Project URL' }), url),
      el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Publishable Key' }), key),
      el('button', { class: 'btn block', onclick: () => {
        const u = url.value.trim().replace(/\/+$/, ''), k = key.value.trim();
        if (!/^https:\/\/.+/.test(u) || k.length < 20) { err.textContent = 'Bitte URL (https://…) und Schlüssel eintragen.'; err.hidden = false; return; }
        if (/service_role|sb_secret_/.test(k)) { err.textContent = 'Das ist der geheime Schlüssel! Bitte den öffentlichen „publishable“ Schlüssel nehmen.'; err.hidden = false; return; }
        localStorage.setItem('lager-config', JSON.stringify({ url: u, key: k }));
        location.reload();
      } }, 'Verbinden'))));
}

function passwordInput(autocomplete) {
  return el('input', { type: 'password', name: autocomplete === 'current-password' ? 'password' : 'new-password', autocomplete, minlength: 8,
    passwordrules: autocomplete === 'new-password' ? 'minlength: 8; required: lower; required: upper; required: digit;' : null });
}
const userInput = (props = {}) => el('input', { type: 'text', name: 'username', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder: 'z. B. benni', ...props });

function showLogin(message) {
  const user = userInput({ required: true });
  const pw = passwordInput('current-password');
  const err = el('div', { class: 'error', hidden: !message, text: message || '' });
  const btn = el('button', { type: 'submit', class: 'btn primary block', text: 'Anmelden' });
  const firstRun = el('div', { class: 'center' });
  showScreen('login', el('div', { class: 'auth' },
    logo(),
    el('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      if (!user.value.trim() || !pw.value) { err.textContent = 'Bitte Benutzername und Passwort eingeben.'; err.hidden = false; return; }
      btn.disabled = true;
      try {
        await S.backend.signIn(loginEmail(user.value), pw.value);
        S.session = await S.backend.getSession();
        await afterLogin();
      } catch (ex) { err.textContent = friendlyError(ex).message; err.hidden = false; } finally { btn.disabled = false; }
    } },
    err,
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Benutzername' }), user),
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Passwort' }), pw),
    btn,
    el('p', { class: 'sub center mt', text: 'Passwort vergessen? Frag euren Admin – er gibt dir ein neues Startpasswort.' })),
    firstRun,
    el('div', { class: 'center' }, el('button', { type: 'button', class: 'linkbtn small-link', text: 'Andere Datenbank / Demo', onclick: resetConnection }))));
  // Ersteinrichtung nur anbieten, wenn der Admin noch kein Konto hat (oder per ?ersteinrichtung)
  const forced = new URLSearchParams(location.search).has('ersteinrichtung');
  (forced ? Promise.resolve(true) : S.backend.setupPending()).then((pending) => {
    if (pending) firstRun.append(el('button', { type: 'button', class: 'linkbtn', id: 'firstrun-link', text: 'Ersteinrichtung (Admin)', onclick: showFirstRun }));
  }).catch(() => {});
}

function resetConnection() {
  try { localStorage.removeItem('lager-config'); localStorage.removeItem('lager-mode'); } catch { /* */ }
  if (storedConfig()) { toast('Die Verbindung steht fest in config.js.'); showSetup(); return; }
  location.reload();
}

// Ersteinrichtung: der Admin legt sein Passwort fest (Benutzername aus dem Datenbank-Skript)
function showFirstRun() {
  const user = userInput({ required: true });
  const pw = passwordInput('new-password');
  const pw2 = el('input', { type: 'password', name: 'new-password-2', autocomplete: 'new-password', minlength: 8 });
  const err = el('div', { class: 'error', hidden: true });
  const btn = el('button', { type: 'submit', class: 'btn primary block', text: 'Konto anlegen' });
  showScreen('firstrun', el('div', { class: 'auth' },
    logo('Ersteinrichtung'),
    el('div', { class: 'info', text: 'Nur einmal für den Admin: Benutzername aus dem Datenbank-Skript eintragen und ein eigenes Passwort festlegen. Danach richtest du die Zwei-Faktor-Anmeldung ein.' }),
    el('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      const u = normalizeUsername(user.value);
      if (!validUsername(u)) { err.textContent = 'Bitte deinen Benutzernamen eintragen (3–20 Zeichen).'; err.hidden = false; return; }
      if (pw.value.length < 8) { err.textContent = 'Das Passwort muss mindestens 8 Zeichen haben.'; err.hidden = false; return; }
      if (pw.value !== pw2.value) { err.textContent = 'Die beiden Passwörter sind nicht gleich.'; err.hidden = false; return; }
      btn.disabled = true;
      try {
        const r = await S.backend.signUpSelf(loginEmail(u), pw.value, u);
        if (r.needsConfirm) { err.textContent = 'In Supabase ist „Confirm email“ eingeschaltet. Bitte ausschalten (Authentication → Sign In / Providers → Email) und dann hier anmelden.'; err.hidden = false; return; }
        S.session = await S.backend.getSession();
        await afterLogin();
      } catch (ex) { err.textContent = friendlyError(ex).message; err.hidden = false; } finally { btn.disabled = false; }
    } },
    err,
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Benutzername' }), user),
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Neues Passwort' }), pw, el('span', { class: 'hint', text: 'Mindestens 8 Zeichen. Das iPhone kann eins vorschlagen.' })),
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Passwort wiederholen' }), pw2),
    btn),
    el('div', { class: 'center' }, el('button', { type: 'button', class: 'linkbtn', text: 'Zurück zum Anmelden', onclick: () => showLogin() }))));
}

// Erste Anmeldung mit Startpasswort: eigenes Passwort festlegen
function showMustChangePassword() {
  const user = userInput({ value: displayLogin(S.session?.user?.email || ''), readonly: true, class: 'readonly' });
  const pw = passwordInput('new-password');
  const pw2 = el('input', { type: 'password', name: 'new-password-2', autocomplete: 'new-password', minlength: 8 });
  const err = el('div', { class: 'error', hidden: true, role: 'alert' });
  const btn = el('button', { type: 'submit', class: 'btn primary block' }, icon('check'), 'Passwort speichern');
  showScreen('password', el('div', { class: 'auth' },
    logo('Neues Passwort festlegen'),
    el('div', { class: 'info', text: 'Willkommen! Leg jetzt dein eigenes Passwort fest – dein iPhone kann eins vorschlagen und sicher speichern. Danach richtest du die Zwei-Faktor-Anmeldung ein.' }),
    el('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      if (pw.value.length < 8) { err.textContent = 'Mindestens 8 Zeichen.'; err.hidden = false; return; }
      if (pw.value !== pw2.value) { err.textContent = 'Die beiden Passwörter sind nicht gleich.'; err.hidden = false; return; }
      btn.disabled = true;
      try { await S.backend.setOwnPassword(pw.value); toast('Passwort gespeichert.'); await afterLogin(); }
      catch (ex) { err.textContent = friendlyError(ex).message; err.hidden = false; } finally { btn.disabled = false; }
    } },
    err,
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Benutzername' }), user),
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Neues Passwort' }), pw, el('span', { class: 'hint', text: 'Mindestens 8 Zeichen.' })),
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Nochmal' }), pw2),
    btn),
    el('div', { class: 'center' }, el('button', { type: 'button', class: 'linkbtn small-link', text: 'Abmelden', onclick: logout }))));
}

function showNoAccess(text) {
  showScreen('noaccess', el('div', { class: 'auth' }, logo(),
    el('div', { class: 'card' },
      el('h2', { text: 'Kein Zugang' }), el('p', { text }),
      el('p', { class: 'sub', text: 'Angemeldet als: ' + displayLogin(S.session?.user?.email || '') }),
      el('button', { class: 'btn block mt', onclick: logout }, icon('logout'), 'Abmelden'))));
}

export async function logout() {
  clearSnapshot();
  try { localStorage.removeItem('lager-mfa-pending'); } catch { /* */ }
  if (isDemo()) {
    try { localStorage.removeItem('lager-mode'); } catch { /* */ }
    location.hash = ''; location.reload();
    return;
  }
  await S.backend.signOut();
  S.me = null; S.data = null; S.D = null;
  showLogin();
}
hooks.logout = logout;

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().catch((e) => {
  console.error(e);
  showScreen('error', el('div', { class: 'auth' }, logo(), el('div', { class: 'error', text: friendlyError(e).message }),
    el('button', { class: 'btn primary block', onclick: () => location.reload() }, 'Neu laden')));
});
