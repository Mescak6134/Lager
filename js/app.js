// Start der App: Verbindung, Anmeldung, Navigation.
import * as CONFIG from '../config.js';
import { createSupabaseBackend, createDemoBackend, friendlyError, demoExists } from './db.js';
import { S, hooks, reload, setData, loadSnapshot, clearSnapshot, isDemo } from './store.js';
import { el, clear, icon, toast } from './ui.js';
import { overview } from './views/overview.js';
import { stock, itemDetail } from './views/stock.js';
import { book } from './views/book.js';
import { history as historyView } from './views/history.js';
import { more, account, logView, users } from './views/more.js';
import { settle } from './views/settle.js';
import { inventory } from './views/inventory.js';
import { masterdata } from './views/masterdata.js';
import { reports, report, search } from './views/reports.js';
import { enrollScreen, challengeScreen } from './mfa.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const offlineBanner = document.getElementById('offline');

const ROUTES = {
  uebersicht: overview, bestand: stock, artikel: itemDetail, buchen: book, verlauf: historyView, mehr: more,
  abrechnung: settle, inventur: inventory, stammdaten: masterdata, suche: search, berichte: reports, bericht: report,
  benutzer: users, konto: account, protokoll: logView,
};
const NAV = [
  ['uebersicht', 'Übersicht', 'home'],
  ['bestand', 'Bestand', 'box'],
  ['buchen', 'Buchen', 'plus'],
  ['verlauf', 'Verlauf', 'list'],
  ['mehr', 'Mehr', 'menu'],
];
const NAV_OF = { artikel: 'bestand' };

let screen = 'loading'; // loading | setup | login | recovery | noaccess | main
let lastRoute = '';

// ---------------------------------------------------------------------
function parseRoute() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, query] = raw.split('?');
  const parts = (path || 'uebersicht').split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  return { parts, q, key: raw };
}

async function renderMain() {
  const r = parseRoute();
  const view = ROUTES[r.parts[0]] || overview;
  const active = NAV_OF[r.parts[0]] || (NAV.some(([k]) => k === r.parts[0]) ? r.parts[0] : 'mehr');
  renderNav(active);
  const scrollY = window.scrollY;
  let node;
  try {
    node = await view(r);
  } catch (e) {
    console.error(e);
    node = el('div', { class: 'error', text: 'Fehler beim Anzeigen: ' + (e.message || e) });
  }
  clear(app).append(node);
  if (r.key !== lastRoute) { window.scrollTo(0, 0); lastRoute = r.key; } else window.scrollTo(0, scrollY);
  document.body.classList.remove('no-nav');
  nav.hidden = false;
}

function renderNav(active) {
  clear(nav).append(...NAV.map(([k, label, ic]) =>
    el('a', { href: '#' + k, class: k === 'buchen' ? 'plus' : '', 'aria-current': k === active ? 'page' : null }, icon(ic), el('span', { text: label }))));
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

// ---------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------
function storedConfig() {
  const url = String(CONFIG.SUPABASE_URL || '');
  const key = String(CONFIG.SUPABASE_KEY || '');
  if (/^https:\/\//.test(url) && key && !key.startsWith('HIER-')) return { url, key, fromFile: true };
  try {
    const c = JSON.parse(localStorage.getItem('lager-config'));
    if (c && c.url && c.key) return c;
  } catch { /* */ }
  return null;
}

async function boot() {
  registerSW();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installPrompt = e; });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', () => updateOffline());

  const mode = localStorage.getItem('lager-mode');
  if (mode === 'demo') return startDemo();
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
  const hash = location.hash;
  const isRecovery = /type=recovery/.test(hash);
  const hashError = /error_description=([^&]+)/.exec(hash);
  try {
    S.backend = await createSupabaseBackend(cfg.url, cfg.key);
  } catch (e) {
    return offlineOr(e);
  }
  if (/access_token=|error_description=/.test(hash)) window.history.replaceState(null, '', location.pathname + location.search);

  S.backend.onAuthChange((event, session) => {
    S.session = session;
    if (event === 'PASSWORD_RECOVERY') showRecovery();
    else if (event === 'SIGNED_OUT' && screen !== 'login' && screen !== 'setup') showLogin();
  });

  let session = null;
  try { session = await S.backend.getSession(); } catch { /* offline */ }
  S.session = session;
  if (isRecovery && session) return showRecovery();
  if (!session) return showLogin(hashError ? linkError(decodeURIComponent(hashError[1].replace(/\+/g, ' '))) : null);
  return afterLogin();
}

function linkError(msg) {
  if (/expired|invalid/i.test(msg)) return 'Der Link ist abgelaufen oder wurde schon benutzt. Bitte nochmal anfordern.';
  return msg;
}

async function afterLogin() {
  showScreen('loading', el('div', { class: 'splash' }, el('img', { src: 'icons/icon-192.png', alt: '', width: 72, height: 72 }), el('p', { text: 'Lade Daten …' })));
  let me;
  try {
    me = await S.backend.claimMembership();
  } catch (e) {
    return offlineOr(e);
  }
  if (!me) return showNoAccess('Dein Konto ist nicht als Mitglied eingetragen. Bitte frag euren Admin, dich mit genau dieser E-Mail-Adresse einzuladen.');
  if (!me.active) return showNoAccess('Dein Zugang wurde deaktiviert. Bitte wende dich an euren Admin.');
  S.me = me;

  // Zwei-Faktor ist Pflicht: ohne Code liefert die Datenbank ohnehin nichts.
  if (S.backend.mode === 'supabase') {
    let st;
    try { st = await S.backend.mfaState(); } catch (e) { return offlineOr(e); }
    if (st.level !== 'aal2') {
      const done = async (factorId, code, msg) => {
        await S.backend.mfaVerify(factorId, code);
        if (msg) toast(msg);
        await afterLogin();
      };
      if (st.verified.length) {
        return showScreen('mfa', challengeScreen({ logo, onLogout: logout, verify: (code) => done(st.verified[0].id, code) }));
      }
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

  try {
    await reload({ silent: true });
  } catch (e) {
    return offlineOr(e);
  }
  enterMain();
}

function enterMain() {
  screen = 'main';
  updateOffline();
  if (!location.hash || location.hash === '#') window.history.replaceState(null, '', '#uebersicht');
  renderMain();
}

// Ohne Verbindung: letzten Stand zeigen (nur lesen)
function offlineOr(e) {
  const snap = loadSnapshot();
  if (snap && (!navigator.onLine || /Verbindung|geladen/.test(friendlyError(e).message))) {
    S.me = snap.me;
    setData(snap.data);
    S.readonly = true;
    S.snapshotAt = snap.at;
    S.session = S.session || { user: { id: snap.me.user_id } };
    screen = 'main';
    updateOffline(true);
    renderMain();
    return;
  }
  showScreen('error', el('div', { class: 'auth' },
    logo(),
    el('div', { class: 'error', text: friendlyError(e).message }),
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
  try {
    if (!S.backend) return location.reload();
    await reload();
    toast('Wieder online – Daten aktualisiert.');
  } catch { updateOffline(true); }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || screen !== 'main' || isDemo() || S.readonly) return;
  try { await reload(); } catch { /* still */ }
});

// ---------------------------------------------------------------------
//  Bildschirme ohne Anmeldung
// ---------------------------------------------------------------------
function logo(sub) {
  return el('div', { class: 'logo' },
    el('img', { src: 'icons/icon-192.png', alt: '' }),
    el('h1', { text: 'Lager' }),
    el('p', { class: 'sub', text: sub || 'Bestand, Einkäufe und Abrechnung' }));
}

function showSetup() {
  const url = el('input', { type: 'url', placeholder: 'https://xxxx.supabase.co', autocomplete: 'off', autocapitalize: 'none' });
  const key = el('input', { type: 'text', placeholder: 'sb_publishable_… oder eyJ…', autocomplete: 'off', autocapitalize: 'none' });
  const err = el('div', { class: 'error', hidden: true });
  showScreen('setup', el('div', { class: 'auth' },
    logo('Willkommen! Noch ist keine Datenbank verbunden.'),
    el('div', { class: 'card' },
      el('h2', { text: 'Erst mal ausprobieren' }),
      el('p', { class: 'sub', text: 'Die Demo zeigt die App mit Beispieldaten. Alles bleibt nur auf diesem Gerät.' }),
      el('button', { class: 'btn primary block mt', onclick: () => startDemo() }, icon('box'), demoExists() ? 'Demo öffnen' : 'Demo ansehen')),
    el('div', { class: 'card' },
      el('h2', { text: 'Eigene Datenbank verbinden' }),
      el('p', { class: 'sub', text: 'Normalerweise trägt man das einmal in config.js ein (siehe Anleitung). Zum Testen geht es auch hier:' }),
      err,
      el('label', { class: 'field mt' }, el('span', { class: 'lbl', text: 'Supabase Project URL' }), url),
      el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Publishable / anon Key' }), key),
      el('button', { class: 'btn block', onclick: () => {
        const u = url.value.trim().replace(/\/+$/, ''), k = key.value.trim();
        if (!/^https:\/\/.+/.test(u) || k.length < 20) { err.textContent = 'Bitte URL (beginnt mit https://) und Schlüssel eintragen.'; err.hidden = false; return; }
        if (/service_role|sb_secret_/.test(k)) { err.textContent = 'Das ist der geheime Schlüssel! Bitte den öffentlichen "publishable" bzw. "anon" Schlüssel nehmen.'; err.hidden = false; return; }
        localStorage.setItem('lager-config', JSON.stringify({ url: u, key: k }));
        location.reload();
      } }, 'Verbinden'))));
}

function showLogin(message, tab = 'login') {
  const email = el('input', { type: 'email', name: 'username', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true, placeholder: 'name@beispiel.de' });
  const pw = el('input', { type: 'password', name: 'password', autocomplete: tab === 'login' ? 'current-password' : 'new-password', required: true, minlength: 8, passwordrules: tab === 'signup' ? 'minlength: 8; required: lower; required: upper; required: digit;' : null });
  const pw2 = el('input', { type: 'password', name: 'password2', autocomplete: 'new-password', minlength: 8 });
  const err = el('div', { class: 'error', hidden: !message || tab === 'sent', text: message || '' });
  const info = el('div', { class: 'info', hidden: true });
  const btn = el('button', { type: 'submit', class: 'btn primary block', text: tab === 'login' ? 'Einloggen' : 'Konto erstellen' });
  const form = el('form', { onsubmit: async (e) => {
    e.preventDefault();
    err.hidden = true; info.hidden = true;
    const em = email.value.trim(), p = pw.value;
    if (!em || !p) { err.textContent = 'Bitte E-Mail und Passwort eingeben.'; err.hidden = false; return; }
    if (tab === 'signup') {
      if (p.length < 8) { err.textContent = 'Das Passwort muss mindestens 8 Zeichen haben.'; err.hidden = false; return; }
      if (p !== pw2.value) { err.textContent = 'Die beiden Passwörter sind nicht gleich.'; err.hidden = false; return; }
    }
    btn.disabled = true;
    try {
      if (tab === 'login') {
        await S.backend.signIn(em, p);
        S.session = await S.backend.getSession();
        await afterLogin();
      } else {
        const r = await S.backend.signUp(em, p);
        if (r.needsConfirm) {
          info.textContent = 'Fast geschafft! Wir haben dir eine E-Mail geschickt. Tippe auf den Link darin – danach kannst du dich hier einloggen.';
          info.hidden = false;
        } else {
          S.session = await S.backend.getSession();
          await afterLogin();
        }
      }
    } catch (ex) {
      err.textContent = friendlyError(ex).message; err.hidden = false;
    } finally { btn.disabled = false; }
  } },
  err, info,
  el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'E-Mail' }), email),
  el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Passwort' }), pw),
  tab === 'signup' ? el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Passwort wiederholen' }), pw2,
    el('span', { class: 'hint', text: 'Mindestens 8 Zeichen.' })) : null,
  btn);

  showScreen('login', el('div', { class: 'auth' },
    logo(),
    el('div', { class: 'seg two-seg', role: 'tablist' },
      el('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'login' ? 'true' : 'false', text: 'Einloggen', onclick: () => showLogin(null, 'login') }),
      el('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'signup' ? 'true' : 'false', text: 'Konto erstellen', onclick: () => showLogin(null, 'signup') })),
    el('div', { class: 'card' },
      tab === 'signup' ? el('p', { class: 'sub', text: 'Nur mit Einladung: Ein Admin muss deine E-Mail vorher in der App eingetragen haben.' }) : null,
      form,
      tab === 'login' ? el('div', { class: 'center' }, el('button', { type: 'button', class: 'linkbtn', text: 'Passwort vergessen?', onclick: () => showForgot(email.value) })) : null),
    el('div', { class: 'center' }, el('button', { type: 'button', class: 'linkbtn small-link', text: 'Andere Datenbank / Demo', onclick: resetConnection }))));
}

function resetConnection() {
  try { localStorage.removeItem('lager-config'); localStorage.removeItem('lager-mode'); } catch { /* */ }
  if (storedConfig()) { toast('Die Verbindung ist fest in config.js eingetragen.'); showSetupFromLogin(); return; }
  location.reload();
}
function showSetupFromLogin() { showSetup(); }

function showForgot(prefill) {
  const email = el('input', { type: 'email', name: 'username', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', value: prefill || '' });
  const msg = el('div', { class: 'info', hidden: true });
  const err = el('div', { class: 'error', hidden: true });
  showScreen('login', el('div', { class: 'auth' },
    logo('Passwort zurücksetzen'),
    el('div', { class: 'card' },
      el('p', { class: 'sub', text: 'Gib deine E-Mail ein. Du bekommst einen Link, mit dem du ein neues Passwort festlegst.' }),
      msg, err,
      el('form', { onsubmit: async (e) => {
        e.preventDefault(); err.hidden = true;
        try {
          await S.backend.resetPassword(email.value.trim());
          msg.textContent = 'Wenn die Adresse bei uns registriert ist, ist jetzt eine E-Mail unterwegs. Bitte Postfach (und Spam) prüfen.';
          msg.hidden = false;
        } catch (ex) { err.textContent = friendlyError(ex).message; err.hidden = false; }
      } },
      el('label', { class: 'field mt' }, el('span', { class: 'lbl', text: 'E-Mail' }), email),
      el('button', { type: 'submit', class: 'btn primary block', text: 'Link schicken' }))),
    el('div', { class: 'center' }, el('button', { class: 'linkbtn', text: 'Zurück zum Login', onclick: () => showLogin() }))));
}

function showRecovery() {
  const pw = el('input', { type: 'password', name: 'password', autocomplete: 'new-password', minlength: 8 });
  const pw2 = el('input', { type: 'password', name: 'password2', autocomplete: 'new-password', minlength: 8 });
  const user = el('input', { type: 'email', name: 'username', autocomplete: 'username', value: S.session?.user?.email || '', readonly: true, class: 'sr-only', tabindex: -1, 'aria-hidden': 'true' });
  const err = el('div', { class: 'error', hidden: true });
  showScreen('recovery', el('div', { class: 'auth' },
    logo('Neues Passwort festlegen'),
    el('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      if (pw.value.length < 8) { err.textContent = 'Mindestens 8 Zeichen.'; err.hidden = false; return; }
      if (pw.value !== pw2.value) { err.textContent = 'Die beiden Passwörter sind nicht gleich.'; err.hidden = false; return; }
      try {
        await S.backend.updatePassword(pw.value);
        toast('Passwort geändert.');
        await afterLogin();
      } catch (ex) { err.textContent = friendlyError(ex).message; err.hidden = false; }
    } },
    err, user,
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Neues Passwort' }), pw),
    el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Nochmal' }), pw2),
    el('button', { type: 'submit', class: 'btn primary block', text: 'Speichern' }))));
}

function showNoAccess(text) {
  showScreen('noaccess', el('div', { class: 'auth' },
    logo(),
    el('div', { class: 'card' },
      el('h2', { text: 'Kein Zugang' }),
      el('p', { text }),
      el('p', { class: 'sub', text: 'Angemeldet als: ' + (S.session?.user?.email || '') }),
      el('button', { class: 'btn block mt', onclick: logout }, icon('logout'), 'Abmelden'))));
}

export async function logout() {
  clearSnapshot();
  try { localStorage.removeItem('lager-mfa-pending'); } catch { /* */ }
  if (isDemo()) {
    try { localStorage.removeItem('lager-mode'); } catch { /* */ }
    location.hash = '';
    location.reload();
    return;
  }
  await S.backend.signOut();
  S.me = null; S.data = null; S.D = null; S.photos.clear();
  showLogin();
}
hooks.logout = logout;

// ---------------------------------------------------------------------
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* egal */ });
}

boot().catch((e) => {
  console.error(e);
  showScreen('error', el('div', { class: 'auth' }, logo(), el('div', { class: 'error', text: friendlyError(e).message }),
    el('button', { class: 'btn primary block', onclick: () => location.reload() }, 'Neu laden')));
});
