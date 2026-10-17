// Mehr: Menü, Mein Konto, Benutzer verwalten, Änderungsprotokoll, Inventurliste (Druck)
import { S, run, reload, hooks, isAdmin, isDemo, go, memberName, itemName, locName, manName, inventoryLots, activeMembers } from '../store.js';
import { el, icon, topbar, formDialog, confirmBox, toast, fmtDate, fmtDateTime, fmtMoney, fmtUnitMoney, fmtQty, empty, alertBox, today, selectEl } from '../ui.js';
import { friendlyError } from '../db.js';
import { REASONS } from '../calc.js';
import { LOGIN_DOMAIN, normalizeUsername, validUsername, displayLogin, generatePassword } from '../accounts.js';
import { backupJSON, exportInventoryCSV } from '../exports.js';

const APP_URL = () => location.origin + location.pathname.replace(/index\.html$/, '');

export function more() {
  const item = (href, ic, title, sub, onclick) => el('li', null,
    el(href ? 'a' : 'button', { class: 'row link', href, type: href ? null : 'button', onclick },
      el('span', { class: 'menu-ic' }, icon(ic)),
      el('span', { class: 'grow' }, el('strong', { class: 'block', text: title }), sub ? el('span', { class: 'sub', text: sub }) : null),
      icon('right')));
  return el('div', null,
    topbar('Mehr', { sub: `${S.me.name} · ${S.me.role === 'admin' ? 'Admin' : 'Mitglied'}${isDemo() ? ' · Demo' : ''}` }),
    el('ul', { class: 'card list menu' },
      item('#inventur', 'clipboard', 'Inventur', 'Zählen und Unterschiede korrigieren'),
      item('#inventurliste', 'print', 'Inventurliste', 'Drucken / PDF / Excel – je Person oder alle'),
      item('#stammdaten', 'database', 'Stammdaten', 'Artikel, Hersteller, Kategorien, Lagerorte')),
    el('ul', { class: 'card list menu' },
      item('#benutzer', 'users', isAdmin() ? 'Benutzer verwalten' : 'Benutzer', `${activeMembers().length} von ${S.maxMembers}`),
      item('#konto', 'user', 'Mein Konto', 'Name, Passwort, Zwei-Faktor'),
      item('#protokoll', 'history', 'Änderungsprotokoll', 'Wer hat wann was gemacht')),
    el('ul', { class: 'card list menu' },
      item(null, 'download', 'Datensicherung', 'Alle Daten als Datei (JSON)', backupJSON),
      item(null, 'phone', 'App installieren', 'Auf den Home-Bildschirm legen', installHelp),
      isDemo()
        ? [item(null, 'refresh', 'Demo zurücksetzen', 'Beispieldaten neu laden', async () => {
          if (!await confirmBox('Alle Demo-Daten werden zurückgesetzt.', { ok: 'Zurücksetzen', danger: true })) return;
          S.backend.resetDemo(); await reload(); toast('Demo zurückgesetzt.'); go('#bestand');
        }), item(null, 'logout', 'Demo beenden', 'Zurück zum Start', () => hooks.logout())]
        : item(null, 'logout', 'Abmelden', displayLogin(S.session?.user?.email), async () => {
          if (await confirmBox('Wirklich abmelden?', { ok: 'Abmelden', title: 'Abmelden' })) hooks.logout();
        })),
    el('p', { class: 'sub center', text: 'Lager · Version 2.0' }));
}

async function installHelp() {
  if (S.installPrompt) { S.installPrompt.prompt(); S.installPrompt = null; return; }
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) { await alertBox('Schon installiert', el('p', { text: 'Du benutzt die App bereits vom Home-Bildschirm. 👍' })); return; }
  await alertBox('App installieren',
    el('ol', { class: 'steps' },
      el('li', { text: 'In Safari unten auf das Teilen-Symbol tippen (Quadrat mit Pfeil).' }),
      el('li', { text: '„Zum Home-Bildschirm“ wählen.' }),
      el('li', { text: '„Hinzufügen“ tippen. Fertig – die App startet jetzt wie jede andere.' })));
}

// ---------- Mein Konto ----------
export function account() {
  const mfa = isDemo() ? ['In der Demo aus', ''] : S.mfa ? ['Aktiv', `seit ${fmtDate(String(S.mfa.created_at || '').slice(0, 10))}`] : ['Aktiv', ''];
  return el('div', null,
    topbar('Mein Konto', { back: '#mehr' }),
    el('div', { class: 'card' },
      el('dl', { class: 'kv' },
        el('dt', { text: 'Name' }), el('dd', { text: S.me.name }),
        el('dt', { text: 'Benutzername' }), el('dd', { text: S.me.username || displayLogin(S.me.email) }),
        el('dt', { text: 'Rolle' }), el('dd', { text: S.me.role === 'admin' ? 'Admin' : 'Mitglied' })),
      el('div', { class: 'actions mt' },
        el('button', { class: 'btn', disabled: S.readonly, onclick: async () => {
          const res = await formDialog('Name ändern', [{ name: 'name', label: 'Dein Name', required: true, max: 60 }], { name: S.me.name });
          if (!res) return;
          if (await run(() => S.backend.update('members', S.me.id, { name: res.name }), 'Name geändert.')) S.me.name = res.name;
        } }, icon('edit'), 'Name ändern'),
        isDemo() ? null : el('button', { class: 'btn', disabled: S.readonly, onclick: changePassword }, icon('key'), 'Passwort ändern'))),
    el('section', { class: 'card mfa-card' },
      el('div', { class: 'row no-border' },
        el('span', { class: 'menu-ic ok' }, icon('key')),
        el('span', { class: 'grow' }, el('strong', { class: 'block', text: 'Zwei-Faktor-Anmeldung' }),
          el('span', { class: 'sub', text: isDemo() ? 'Mit der echten Datenbank ist der 6-stellige Code Pflicht.' : `Bei jeder neuen Anmeldung wird der 6-stellige Code abgefragt – auf dem iPhone füllt Face ID ihn aus. ${mfa[1]}`.trim() })),
        el('span', { class: 'badge ' + (isDemo() ? '' : 'in'), text: mfa[0] })),
      isDemo() ? null : el('p', { class: 'sub mt-s', text: 'Handy verloren? Ein Admin kann sie unter „Benutzer verwalten“ zurücksetzen. Abschalten geht nicht – sie ist für alle Pflicht.' })));
}

async function changePassword() {
  await formDialog('Passwort ändern', [
    { name: 'username', label: 'Benutzername', autocomplete: 'username', readonly: true },
    { name: 'pw', label: 'Neues Passwort', type: 'password', required: true, autocomplete: 'new-password', hint: 'Mindestens 8 Zeichen.' },
    { name: 'pw2', label: 'Nochmal', type: 'password', required: true, autocomplete: 'new-password' },
  ], { username: S.me.username || displayLogin(S.me.email) }, {
    onSave: async (v) => {
      if (v.pw.length < 8) throw new Error('Mindestens 8 Zeichen.');
      if (v.pw !== v.pw2) throw new Error('Die beiden Passwörter sind nicht gleich.');
      try { await S.backend.setOwnPassword(v.pw); } catch (e) { throw friendlyError(e); }
      toast('Passwort geändert.');
    },
  });
}

// ---------- Benutzer ----------
export function users() {
  const admin = isAdmin() && !S.readonly;
  const list = [...S.data.members].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de'));
  const activeN = list.filter((m) => m.active).length;
  const full = activeN >= S.maxMembers;
  return el('div', null,
    topbar(admin ? 'Benutzer verwalten' : 'Benutzer', { back: '#mehr', sub: `${activeN} von ${S.maxMembers} Benutzern` }),
    el('div', { class: 'progress cap', role: 'img', 'aria-label': `${activeN} von ${S.maxMembers} Plätzen belegt` }, el('span', { style: { width: Math.min(100, (activeN / S.maxMembers) * 100) + '%' } })),
    admin ? el('button', { class: 'btn primary block', disabled: full, onclick: createUser }, icon('plus'), 'Benutzer anlegen') : null,
    admin ? el('p', { class: 'sub mt', text: full ? `Alle ${S.maxMembers} Plätze sind belegt. Für jemand Neuen zuerst eine Person deaktivieren.` : 'Du legst Benutzername und Startpasswort fest und schickst beides z. B. per WhatsApp. Beim ersten Anmelden wählt die Person ein eigenes Passwort.' }) : null,
    el('ul', { class: 'list mt' }, list.map((m) => el('li', { class: 'card' },
      el('div', { class: 'row no-border' },
        el('span', { class: 'avatar' + (m.active ? '' : ' off'), text: m.name.slice(0, 1).toUpperCase() }),
        el('span', { class: 'grow' },
          el('strong', { class: 'block', text: m.name + (m.id === S.me.id ? ' (ich)' : '') }),
          el('span', { class: 'sub block ellipsis', text: 'Benutzername: ' + (m.username || displayLogin(m.email)) }),
          el('span', null,
            el('span', { class: 'badge ' + (m.role === 'admin' ? 'arch' : ''), text: m.role === 'admin' ? 'Admin' : 'Mitglied' }), ' ',
            !m.active ? el('span', { class: 'badge warn', text: 'deaktiviert' }) : m.user_id ? el('span', { class: 'badge in', text: 'hat Konto' }) : el('span', { class: 'badge move', text: 'noch kein Konto' })))),
      admin && m.id !== S.me.id ? el('div', { class: 'actions mt-s user-actions' },
        el('button', { class: 'btn small', onclick: () => editMember(m) }, icon('edit'), 'Bearbeiten'),
        el('button', { class: 'btn small', onclick: () => tempPassword(m) }, icon('key'), 'Neues Startpasswort'),
        m.user_id ? el('button', { class: 'btn small', onclick: () => reset2fa(m) }, icon('phone'), '2FA zurücksetzen') : null,
        el('button', { class: 'btn small ' + (m.active ? 'danger' : ''), onclick: () => toggleActive(m) }, icon(m.active ? 'x' : 'check'), m.active ? 'Deaktivieren' : 'Aktivieren')) : null))));
}

const passwordButtons = [
  { icon: 'refresh', label: 'Neues Passwort erzeugen', onClick: (inp) => { inp.value = generatePassword(); } },
  { icon: 'file', label: 'Kopieren', onClick: (inp) => copyText(inp.value, 'Passwort kopiert.') },
];
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg || 'Kopiert.'); } catch { toast('Kopieren ging nicht – bitte abschreiben.', true); }
}

async function createUser() {
  let result = null;
  const res = await formDialog('Benutzer anlegen', [
    { name: 'name', label: 'Name', required: true, max: 60, placeholder: 'z. B. Benni' },
    { name: 'username', label: 'Benutzername', max: 40, placeholder: 'leer = aus dem Namen', hint: 'Zum Anmelden. 3–20 Zeichen: a–z, 0–9, Punkt, Minus. Umlaute werden umgeschrieben (ü → ue).' },
    { name: 'role', label: 'Rolle', type: 'select', options: [['mitglied', 'Mitglied'], ['admin', 'Admin (kann Benutzer verwalten)']] },
    { name: 'password', label: 'Startpasswort', required: true, max: 72, autocomplete: 'off', buttons: passwordButtons, hint: 'Muss beim ersten Anmelden geändert werden.' },
  ], { role: 'mitglied', password: generatePassword() }, {
    submit: 'Anlegen',
    onSave: async (v) => {
      const username = normalizeUsername(v.username || v.name);
      if (!validUsername(username)) throw new Error('Benutzername: 3–20 Zeichen, nur a–z, 0–9, Punkt, Minus, Unterstrich.');
      if (!v.password || v.password.length < 8) throw new Error('Das Startpasswort muss mindestens 8 Zeichen haben.');
      if (S.data.members.some((m) => m.username === username)) throw new Error(`Den Benutzernamen „${username}“ gibt es schon.`);
      const email = `${username}@${LOGIN_DOMAIN}`;
      let member;
      try { member = await S.backend.insert('members', { username, email, name: v.name, role: v.role }); } catch (e) { throw friendlyError(e); }
      let created;
      try {
        created = await S.backend.createLoginUser(email, v.password, username);
      } catch (e) {
        const msg = friendlyError(e).message;
        try { await S.backend.remove('members', member.id); } catch {
          await reload();
          throw new Error(`${msg} Achtung: „${v.name}“ steht jetzt in der Liste, hat aber kein Konto. Bitte deaktivieren oder neu anlegen.`);
        }
        throw new Error(`${msg} Es wurde nichts angelegt.`);
      }
      result = { name: v.name, username, password: v.password, needsConfirm: created.needsConfirm };
    },
  });
  if (!res || !result) return;
  await reload();
  if (result.needsConfirm) {
    await alertBox('Eine Einstellung fehlt',
      el('p', { text: `In Supabase ist „Confirm email“ eingeschaltet – dann kann sich ${result.name} nicht anmelden.` }),
      el('p', { text: 'Bitte in Supabase unter Authentication → Sign In / Providers → Email „Confirm email“ ausschalten und danach hier „Neues Startpasswort“ tippen (das schaltet das Konto frei).' }));
  }
  await shareCredentials(`Zugang für ${result.name}`,
    `Hallo ${result.name}! Dein Zugang zur Lager-App: ${APP_URL()} · Benutzername: ${result.username} · Startpasswort: ${result.password}. Beim ersten Anmelden legst du ein neues Passwort fest und richtest die Zwei-Faktor-Anmeldung ein.`);
}

async function tempPassword(m) {
  let pw = null;
  const res = await formDialog(`Neues Startpasswort für ${m.name}`, [
    { name: 'password', label: 'Startpasswort', required: true, max: 72, autocomplete: 'off', buttons: passwordButtons, hint: `${m.name} wird überall abgemeldet und muss es beim nächsten Anmelden ändern. Die Zwei-Faktor-Anmeldung bleibt.` },
  ], { password: generatePassword() }, {
    submit: 'Festlegen',
    onSave: async (v) => {
      if (!v.password || v.password.length < 8) throw new Error('Das Startpasswort muss mindestens 8 Zeichen haben.');
      try { await S.backend.setTempPassword(m.id, v.password); } catch (e) { throw friendlyError(e); }
      pw = v.password;
    },
  });
  if (!res || !pw) return;
  await reload();
  await shareCredentials(`Neues Startpasswort für ${m.name}`,
    `Hallo ${m.name}! Dein neues Startpasswort für die Lager-App: ${pw} · Benutzername: ${m.username} · ${APP_URL()} – beim Anmelden legst du gleich ein eigenes Passwort fest.`);
}

// Zugangsdaten zeigen, Teilen erst per Tipp (iOS verlangt dafür eine Berührung)
async function shareCredentials(title, text) {
  await alertBox(title,
    el('p', { class: 'sub', text: 'Jetzt z. B. per WhatsApp schicken. Das Startpasswort wird nirgends gespeichert.' }),
    el('p', { class: 'share-text', text }),
    el('div', { class: 'actions' },
      navigator.share ? el('button', { type: 'button', class: 'btn', onclick: async () => { try { await navigator.share({ title: 'Lager-App', text }); } catch { /* abgebrochen */ } } }, icon('upload'), 'Teilen') : null,
      el('button', { type: 'button', class: 'btn', onclick: () => copyText(text, 'Text kopiert – jetzt z. B. in WhatsApp einfügen.') }, icon('file'), 'Kopieren')));
}

async function reset2fa(m) {
  if (!await confirmBox(`Die Zwei-Faktor-Anmeldung von ${m.name} wird gelöscht und ${m.name} überall abgemeldet. Beim nächsten Anmelden richtet ${m.name} den Code neu ein – z. B. auf dem neuen Handy.`, { ok: 'Zurücksetzen', danger: true, title: 'Zwei-Faktor zurücksetzen?' })) return;
  const n = await run(() => S.backend.reset2fa(m.id));
  if (n !== false) toast(n > 0 ? `Zwei-Faktor von ${m.name} zurückgesetzt.` : `${m.name} hatte noch keine Zwei-Faktor-Anmeldung.`);
}

async function toggleActive(m) {
  if (m.active && !await confirmBox(`${m.name} kann sich dann nicht mehr anmelden und sieht nichts mehr. Der Bestand von ${m.name} bleibt in der Liste.`, { ok: 'Deaktivieren', danger: true, title: 'Deaktivieren?' })) return;
  await run(() => S.backend.update('members', m.id, { active: !m.active }), m.active ? `${m.name} ist deaktiviert.` : `${m.name} ist wieder aktiv.`);
}

async function editMember(m) {
  const res = await formDialog(`${m.name} bearbeiten`, [
    { name: 'name', label: 'Name', required: true, max: 60 },
    { name: 'username', label: 'Benutzername', readonly: true, hint: 'Kann nicht geändert werden.' },
    { name: 'role', label: 'Rolle', type: 'select', options: [['mitglied', 'Mitglied'], ['admin', 'Admin']] },
  ], m, {
    onSave: async (v) => { try { await S.backend.update('members', m.id, { name: v.name, role: v.role }); } catch (e) { throw friendlyError(e); } },
  });
  if (res) { toast('Gespeichert.'); await reload(); }
}

// ---------- Änderungsprotokoll ----------
const TABLE_DE = { members: 'Benutzer', categories: 'Kategorie', manufacturers: 'Hersteller', locations: 'Lagerort', items: 'Artikel', movements: 'Buchung' };
const ACTION_DE = { insert: 'angelegt', update: 'geändert', delete: 'gelöscht' };

function describe(l) {
  const d = l.new_data || l.old_data || {};
  if (l.table_name === 'movements') {
    const q = `${d.kind === 'in' ? '+' : '−'}${String(d.qty).replace('.', ',')} ${S.D.items.get(d.item_id)?.unit || ''}`;
    return `${REASONS[d.reason] || 'Buchung'} ${l.action === 'delete' ? 'gelöscht' : 'gebucht'}: ${itemName(d.item_id)} ${q} (${memberName(d.owner_id)}${d.location_id ? ', ' + locName(d.location_id) : ''})`;
  }
  if (l.table_name === 'members') {
    if (l.action === 'reset_2fa') return `Zwei-Faktor zurückgesetzt: ${d.name}`;
    if (l.action === 'temp_password') return `Neues Startpasswort vergeben: ${d.name}`;
    if (l.action === 'update' && l.old_data && l.new_data) {
      const ch = [];
      if (l.old_data.name !== l.new_data.name) ch.push(`Name „${l.old_data.name}“ → „${l.new_data.name}“`);
      if (l.old_data.role !== l.new_data.role) ch.push(`Rolle → ${l.new_data.role}`);
      if (l.old_data.active !== l.new_data.active) ch.push(l.new_data.active ? 'aktiviert' : 'deaktiviert');
      if (!l.old_data.user_id && l.new_data.user_id) ch.push('Konto angelegt');
      return `Benutzer ${d.name}: ${ch.join(', ') || 'geändert'}`;
    }
    return `Benutzer ${ACTION_DE[l.action]}: ${d.name} (${d.username || displayLogin(d.email)})`;
  }
  let extra = '';
  if (l.action === 'update' && l.old_data && l.new_data) {
    if (l.old_data.archived !== l.new_data.archived) extra = l.new_data.archived ? ' (archiviert)' : ' (wiederhergestellt)';
    else if (l.old_data.name !== l.new_data.name) extra = ` („${l.old_data.name}“ → „${l.new_data.name}“)`;
  }
  return `${TABLE_DE[l.table_name] || l.table_name} ${ACTION_DE[l.action] || l.action}: ${d.name || ''}${extra}`;
}

export async function logView() {
  let rows;
  try { rows = await S.backend.loadLog(300); } catch (e) { return el('div', null, topbar('Änderungsprotokoll', { back: '#mehr' }), el('div', { class: 'error', text: friendlyError(e).message })); }
  return el('div', null,
    topbar('Änderungsprotokoll', { back: '#mehr', sub: 'Die letzten 300 Änderungen' }),
    rows.length ? el('ul', { class: 'list' }, rows.map((l) => el('li', { class: 'card log-row' },
      el('span', { class: 'sign ' + (l.action === 'delete' ? 'out' : l.action === 'insert' ? 'in' : 'move'), text: l.action === 'delete' ? '×' : l.action === 'insert' ? '+' : '✎' }),
      el('span', { class: 'body' }, el('span', { class: 'title', text: describe(l) }), el('span', { class: 'meta', text: `${l.user_name || 'Unbekannt'} · ${fmtDateTime(l.at)}` })))))
      : empty('history', isDemo() ? 'In der Demo wird ab jetzt protokolliert, was du änderst.' : 'Noch keine Einträge.'));
}

// ---------- Inventurliste (Druck / PDF / CSV) ----------
export function inventoryList(r) {
  const person = r.q.person || '';
  const sign = r.q.sign === '1';
  const setQ = (p, s) => go('#inventurliste' + (p || s ? '?' + new URLSearchParams({ ...(p ? { person: p } : {}), ...(s ? { sign: '1' } : {}) }) : ''));
  const lots = inventoryLots(person);
  const groups = new Map();
  for (const l of lots) { if (!groups.has(l.owner_id)) groups.set(l.owner_id, []); groups.get(l.owner_id).push(l); }
  const grand = lots.reduce((s, l) => s + (l.value || 0), 0);
  const table = (rows) => el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl print-tbl' },
    el('thead', null, el('tr', null, ['Artikel', 'Hersteller', 'Charge', 'Lagerort'].map((h) => el('th', { text: h })),
      el('th', { class: 'r', text: 'Menge' }), el('th', { class: 'r', text: 'Einzelwert' }), el('th', { class: 'r', text: 'Gesamtwert' }))),
    el('tbody', null, rows.map((l) => el('tr', null,
      el('td', { text: l.item?.name }), el('td', { text: manName(l.item?.manufacturer_id) || '' }), el('td', { text: l.batch || '' }),
      el('td', { text: l.location_id ? locName(l.location_id) : '' }), el('td', { class: 'r nowrap', text: fmtQty(l.qty, l.item?.unit) }),
      el('td', { class: 'r nowrap', text: fmtUnitMoney(l.unit) }), el('td', { class: 'r nowrap', text: l.value == null ? '—' : fmtMoney(l.value) })))),
    el('tfoot', null, el('tr', null, el('td', { colspan: 6, text: 'Summe' }), el('td', { class: 'r nowrap', text: fmtMoney(rows.reduce((s, l) => s + (l.value || 0), 0)) })))));
  const signLines = (name) => el('div', { class: 'sign-lines' },
    el('div', null, el('span', { class: 'line' }), el('span', { text: 'Ort, Datum' })),
    el('div', null, el('span', { class: 'line' }), el('span', { text: `Unterschrift ${name}` })));
  return el('div', { class: 'report' },
    el('div', { class: 'no-print' },
      topbar('Inventurliste', { back: '#mehr' }),
      el('div', { class: 'card' },
        el('label', { class: 'field' }, el('span', { class: 'lbl', text: 'Für wen?' }),
          selectEl([['', 'Alle Personen'], ...S.data.members.map((m) => [m.id, m.name])], person, { onchange: (e) => setQ(e.target.value, sign) })),
        el('label', { class: 'checkrow' }, el('input', { type: 'checkbox', checked: sign, onchange: (e) => setQ(person, e.target.checked) }), el('span', { text: 'Unterschriftszeilen' })),
        el('div', { class: 'actions mt' },
          el('button', { class: 'btn primary', onclick: () => window.print() }, icon('print'), 'Drucken'),
          el('button', { class: 'btn', onclick: () => exportInventoryCSV(person) }, icon('download'), 'Excel')),
        el('p', { class: 'sub mt', text: 'PDF: im Druckdialog „Als PDF sichern“ wählen. iPhone: Drucken → Vorschau mit zwei Fingern aufziehen → Teilen. Excel: CSV-Datei.' }))),
    el('header', { class: 'report-head' },
      el('h1', { text: 'Inventurliste' }),
      el('p', { class: 'sub', text: `${person ? memberName(person) : 'Alle Personen'} · Stand ${fmtDate(today())} · erstellt von ${S.me.name}` })),
    lots.length ? [...groups].map(([owner, rows]) => el('section', { class: 'report-sec' },
      !person ? el('h2', { text: memberName(owner) }) : null,
      table(rows),
      sign ? signLines(memberName(owner)) : null)) : empty('box', 'Kein Bestand.'),
    !person && groups.size > 1 ? el('p', { class: 'grand', text: `Gesamtwert aller Personen: ${fmtMoney(grand)}` }) : null);
}
