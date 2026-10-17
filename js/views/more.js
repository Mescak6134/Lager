// Mehr: Menü, Konto, Benutzer verwalten, Änderungsprotokoll
import { S, run, reload, hooks, isAdmin, isDemo, go, memberName, itemName, locName } from '../store.js';
import { el, icon, topbar, formDialog, confirmBox, toast, fmtDateTime, fmtMoney, empty, alertBox } from '../ui.js';
import { friendlyError, baseUrl } from '../db.js';
import { REASONS } from '../calc.js';

export function more() {
  const item = (href, ic, title, sub, onclick) => el('li', null,
    el(href ? 'a' : 'button', { class: 'row link', href, type: href ? null : 'button', onclick },
      el('span', { class: 'menu-ic' }, icon(ic)),
      el('span', { class: 'grow' }, el('strong', { class: 'block', text: title }), sub ? el('span', { class: 'sub', text: sub }) : null),
      icon('right')));
  const L = S.D.ledger;
  return el('div', null,
    topbar('Mehr', { sub: `${S.me.name} · ${S.me.role === 'admin' ? 'Admin' : 'Mitglied'}${isDemo() ? ' · Demo' : ''}` }),
    el('ul', { class: 'card list menu' },
      item('#abrechnung', 'wallet', 'Abrechnung', L.open > 0 ? `Offen: ${fmtMoney(L.open)}` : 'Alles ausgeglichen'),
      item('#inventur', 'clipboard', 'Inventur', 'Bestand zählen und korrigieren'),
      item('#suche', 'search', 'Suche', 'Artikel, Hersteller, Händler, Chargen'),
      item('#berichte', 'print', 'Berichte & Export', 'Drucken, PDF, Excel, Datensicherung')),
    el('ul', { class: 'card list menu' },
      item('#stammdaten', 'database', 'Stammdaten', 'Artikel, Hersteller, Händler, Lagerorte, Kategorien'),
      item('#benutzer', 'users', isAdmin() ? 'Benutzer verwalten' : 'Benutzer', isAdmin() ? 'Einladen, Rollen, Zugang' : `${S.data.members.filter((m) => m.active).length} Personen`),
      item('#protokoll', 'history', 'Änderungsprotokoll', 'Wer hat wann was gemacht')),
    el('ul', { class: 'card list menu' },
      item('#konto', 'user', 'Mein Konto', 'Name, Passwort'),
      item(null, 'phone', 'App auf dem Handy installieren', 'Wie eine normale App nutzen', installHelp),
      isDemo()
        ? [item(null, 'refresh', 'Demo-Daten zurücksetzen', 'Beispieldaten neu laden', async () => {
          if (!await confirmBox('Alle Demo-Daten werden auf den Anfang zurückgesetzt.', { ok: 'Zurücksetzen', danger: true })) return;
          S.backend.resetDemo(); await reload(); toast('Demo zurückgesetzt.'); go('#uebersicht');
        }), item(null, 'logout', 'Demo beenden', 'Zurück zum Start', () => hooks.logout())]
        : item(null, 'logout', 'Abmelden', S.session?.user?.email, async () => {
          if (await confirmBox('Wirklich abmelden?', { ok: 'Abmelden', title: 'Abmelden' })) hooks.logout();
        })),
    el('p', { class: 'sub center', text: 'Lager-App · Version 1.0' }));
}

async function installHelp() {
  if (S.installPrompt) {
    S.installPrompt.prompt();
    const r = await S.installPrompt.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') toast('Wird installiert …');
    S.installPrompt = null;
    return;
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) { await alertBox('Schon installiert', el('p', { text: 'Du benutzt die App bereits vom Startbildschirm. 👍' })); return; }
  await alertBox('App installieren',
    el('h3', { class: 'form-h', text: 'iPhone / iPad (Safari)' }),
    el('ol', { class: 'steps' }, el('li', { text: 'Unten auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).' }), el('li', { text: '„Zum Home-Bildschirm“ wählen.' }), el('li', { text: 'Oben rechts auf „Hinzufügen“ tippen.' })),
    el('h3', { class: 'form-h', text: 'Android (Chrome)' }),
    el('ol', { class: 'steps' }, el('li', { text: 'Oben rechts auf die drei Punkte tippen.' }), el('li', { text: '„App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.' })));
}

// ---------- Mein Konto ----------
export function account() {
  return el('div', null,
    topbar('Mein Konto', { back: '#mehr' }),
    el('div', { class: 'card' },
      el('dl', { class: 'kv' },
        el('dt', { text: 'Name' }), el('dd', { text: S.me.name }),
        el('dt', { text: 'E-Mail' }), el('dd', { text: S.me.email }),
        el('dt', { text: 'Rolle' }), el('dd', { text: S.me.role === 'admin' ? 'Admin' : 'Mitglied' })),
      el('div', { class: 'actions mt' },
        el('button', { class: 'btn', disabled: S.readonly, onclick: async () => {
          const res = await formDialog('Name ändern', [{ name: 'name', label: 'Dein Name', required: true, max: 60 }], { name: S.me.name });
          if (!res) return;
          const ok = await run(() => S.backend.update('members', S.me.id, { name: res.name }), 'Name geändert.');
          if (ok) S.me.name = res.name;
        } }, icon('edit'), 'Name ändern'),
        isDemo() ? null : el('button', { class: 'btn', disabled: S.readonly, onclick: changePassword }, icon('key'), 'Passwort ändern'))));
}

async function changePassword() {
  await formDialog('Passwort ändern', [
    { name: 'pw', label: 'Neues Passwort', type: 'password', required: true, autocomplete: 'new-password', hint: 'Mindestens 8 Zeichen.' },
    { name: 'pw2', label: 'Nochmal', type: 'password', required: true, autocomplete: 'new-password' },
  ], {}, {
    onSave: async (v) => {
      if (v.pw.length < 8) throw new Error('Mindestens 8 Zeichen.');
      if (v.pw !== v.pw2) throw new Error('Die beiden Passwörter sind nicht gleich.');
      try { await S.backend.updatePassword(v.pw); } catch (e) { throw friendlyError(e); }
      toast('Passwort geändert.');
    },
  });
}

// ---------- Benutzer ----------
export function users() {
  const admin = isAdmin() && !S.readonly;
  const list = [...S.data.members].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de'));
  return el('div', null,
    topbar(admin ? 'Benutzer verwalten' : 'Benutzer', { back: '#mehr', sub: `${list.filter((m) => m.active).length} aktiv` }),
    admin ? el('button', { class: 'btn primary block', onclick: invite }, icon('plus'), 'Person einladen') : null,
    admin ? el('p', { class: 'sub mt', text: 'Eingeladene Personen öffnen die App, tippen auf „Konto erstellen“ und registrieren sich mit genau dieser E-Mail.' }) : null,
    el('ul', { class: 'list mt' }, list.map((m) => el('li', { class: 'card' },
      el('div', { class: 'row no-border' },
        el('span', { class: 'avatar', text: m.name.slice(0, 1).toUpperCase() }),
        el('span', { class: 'grow' },
          el('strong', { class: 'block', text: m.name + (m.id === S.me.id ? ' (ich)' : '') }),
          el('span', { class: 'sub block ellipsis', text: m.email }),
          el('span', null,
            el('span', { class: 'badge ' + (m.role === 'admin' ? 'arch' : ''), text: m.role === 'admin' ? 'Admin' : 'Mitglied' }), ' ',
            !m.active ? el('span', { class: 'badge warn', text: 'deaktiviert' }) : m.user_id ? el('span', { class: 'badge in', text: 'registriert' }) : el('span', { class: 'badge move', text: 'eingeladen' })))),
      admin ? el('div', { class: 'actions mt-s' },
        el('button', { class: 'btn small', onclick: () => editMember(m) }, icon('edit'), 'Bearbeiten'),
        !m.user_id && m.active ? el('button', { class: 'btn small', onclick: () => shareInvite(m) }, icon('upload'), 'Einladung teilen') : null) : null))));
}

async function invite() {
  const res = await formDialog('Person einladen', [
    { name: 'name', label: 'Name', required: true, max: 60 },
    { name: 'email', label: 'E-Mail', type: 'email', required: true, autocomplete: 'off' },
    { name: 'role', label: 'Rolle', type: 'select', options: [['mitglied', 'Mitglied – kann buchen und Stammdaten pflegen'], ['admin', 'Admin – kann zusätzlich Personen verwalten']] },
  ], { role: 'mitglied' }, {
    submit: 'Einladen',
    onSave: async (v) => { try { await S.backend.insert('members', { name: v.name, email: v.email.toLowerCase(), role: v.role }); } catch (e) { throw friendlyError(e); } },
  });
  if (!res) return;
  await reload();
  toast(`${res.name} ist eingeladen.`);
  const m = S.data.members.find((x) => x.email.toLowerCase() === res.email.toLowerCase());
  if (m && !isDemo()) shareInvite(m);
}

async function shareInvite(m) {
  const text = `Hallo ${m.name}! Du bist zur Lager-App eingeladen. Öffne ${baseUrl()} , tippe auf „Konto erstellen“ und registriere dich mit ${m.email}.`;
  if (navigator.share) { try { await navigator.share({ title: 'Einladung Lager-App', text }); return; } catch { /* abgebrochen */ } }
  try { await navigator.clipboard.writeText(text); toast('Einladungstext kopiert – jetzt z. B. per WhatsApp schicken.'); } catch {
    await alertBox('Einladung', el('p', { text }));
  }
}

async function editMember(m) {
  const isMe = m.id === S.me.id;
  const res = await formDialog(`${m.name} bearbeiten`, [
    { name: 'name', label: 'Name', required: true, max: 60 },
    { name: 'email', label: 'E-Mail', type: 'email', required: true, hint: m.user_id ? 'Schon registriert – E-Mail kann nicht mehr geändert werden.' : null },
    { name: 'role', label: 'Rolle', type: 'select', options: [['mitglied', 'Mitglied'], ['admin', 'Admin']] },
    { name: 'active', label: 'Zugang aktiv', type: 'checkbox' },
  ], m, {
    onSave: async (v) => {
      const patch = { name: v.name, role: v.role, active: v.active };
      if (!m.user_id && v.email.toLowerCase() !== m.email.toLowerCase()) patch.email = v.email.toLowerCase();
      if (isMe && (v.role !== 'admin' || !v.active) && !await confirmBox('Du nimmst dir selbst die Admin-Rechte bzw. den Zugang. Sicher?', { ok: 'Ja', danger: true })) throw new Error('Abgebrochen.');
      try { await S.backend.update('members', m.id, patch); } catch (e) { throw friendlyError(e); }
    },
    extra: !isMe ? el('button', { type: 'button', class: 'btn small danger mt', onclick: async (e) => {
      const dlg = e.currentTarget.closest('dialog');
      if (!await confirmBox(`${m.name} ganz entfernen? Geht nur, wenn es noch keine Buchungen gibt. Sonst bitte „Zugang aktiv“ ausschalten.`, { ok: 'Entfernen', danger: true })) return;
      try { await S.backend.remove('members', m.id); dlg.close(); dlg.remove(); toast('Entfernt.'); await reload(); } catch (ex) { toast(friendlyError(ex).message, true); }
    } }, icon('trash'), 'Person entfernen') : null,
  });
  if (res) { toast('Gespeichert.'); await reload(); if (isMe) S.me = S.data.members.find((x) => x.id === m.id) || S.me; }
}

// ---------- Änderungsprotokoll ----------
const TABLE_DE = { members: 'Person', categories: 'Kategorie', manufacturers: 'Hersteller', suppliers: 'Händler', locations: 'Lagerort', items: 'Artikel', movements: 'Buchung', settlements: 'Ausgleich' };
const ACTION_DE = { insert: 'angelegt', update: 'geändert', delete: 'gelöscht' };

function describe(l) {
  const d = l.new_data || l.old_data || {};
  switch (l.table_name) {
    case 'movements': {
      const q = `${d.kind === 'in' ? '+' : '−'}${String(d.qty).replace('.', ',')} ${S.D.items.get(d.item_id)?.unit || ''}`;
      return `${REASONS[d.reason] || 'Buchung'} ${l.action === 'delete' ? 'gelöscht' : 'gebucht'}: ${itemName(d.item_id)} ${q} (${memberName(d.owner_id)}${d.location_id ? ', ' + locName(d.location_id) : ''})`;
    }
    case 'settlements': return `Ausgleich ${ACTION_DE[l.action]}: ${memberName(d.from_member)} → ${memberName(d.to_member)} ${fmtMoney(d.amount)}`;
    case 'members': {
      if (l.action === 'update' && l.old_data && l.new_data) {
        const ch = [];
        if (l.old_data.name !== l.new_data.name) ch.push(`Name „${l.old_data.name}“ → „${l.new_data.name}“`);
        if (l.old_data.role !== l.new_data.role) ch.push(`Rolle → ${l.new_data.role}`);
        if (l.old_data.active !== l.new_data.active) ch.push(l.new_data.active ? 'aktiviert' : 'deaktiviert');
        if (!l.old_data.user_id && l.new_data.user_id) ch.push('hat sich registriert');
        return `Person ${d.name}: ${ch.join(', ') || 'geändert'}`;
      }
      return `Person ${ACTION_DE[l.action]}: ${d.name} (${d.email})`;
    }
    default: {
      let extra = '';
      if (l.action === 'update' && l.old_data && l.new_data) {
        if (l.old_data.archived !== l.new_data.archived) extra = l.new_data.archived ? ' (archiviert)' : ' (wiederhergestellt)';
        else if (l.old_data.name !== l.new_data.name) extra = ` („${l.old_data.name}“ → „${l.new_data.name}“)`;
      }
      return `${TABLE_DE[l.table_name] || l.table_name} ${ACTION_DE[l.action]}: ${d.name || ''}${extra}`;
    }
  }
}

export async function logView() {
  let rows;
  try { rows = await S.backend.loadLog(300); } catch (e) { return el('div', null, topbar('Änderungsprotokoll', { back: '#mehr' }), el('div', { class: 'error', text: friendlyError(e).message })); }
  return el('div', null,
    topbar('Änderungsprotokoll', { back: '#mehr', sub: 'Die letzten 300 Änderungen – kann niemand bearbeiten' }),
    rows.length ? el('ul', { class: 'list' }, rows.map((l) => el('li', { class: 'card log-row' },
      el('span', { class: 'sign ' + (l.action === 'delete' ? 'out' : l.action === 'insert' ? 'in' : 'move'), text: l.action === 'delete' ? '×' : l.action === 'insert' ? '+' : '✎' }),
      el('span', { class: 'body' },
        el('span', { class: 'title', text: describe(l) }),
        el('span', { class: 'meta', text: `${l.user_name || 'Unbekannt'} · ${fmtDateTime(l.at)}` })))))
      : empty('history', isDemo() ? 'In der Demo wird ab jetzt protokolliert, was du änderst.' : 'Noch keine Einträge.'));
}
