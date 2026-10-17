// Zwei-Faktor-Anmeldung (TOTP): einrichten und Code abfragen.
// Pflicht für alle – die Datenbank zeigt ohne Code nichts an.
import { el, icon, toast, alertBox } from './ui.js';
import { friendlyError } from './db.js';

// QR-Code von Supabase nur als Bild anzeigen (SVG in <img> führt keinen Code aus)
export function qrImageSrc(qr) {
  if (!qr) return null;
  let svg = String(qr);
  const m = /^data:image\/svg\+xml[^,]*,/.exec(svg);
  if (m) {
    svg = svg.slice(m[0].length);
    try { svg = decodeURIComponent(svg); } catch { /* war nicht kodiert */ }
  }
  if (!svg.trim().startsWith('<svg')) return null;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const safeOtpUri = (uri) => (/^otpauth:\/\/totp\//i.test(uri || '') ? uri : null);
const groupSecret = (s) => String(s || '').replace(/(.{4})/g, '$1 ').trim();

// 6-stelliges Codefeld: iPhone schlägt den Code über der Tastatur vor (Face ID)
function codeInput(onComplete) {
  const input = el('input', {
    type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]*', maxlength: 6,
    name: 'otp', class: 'otp', placeholder: '······', 'aria-label': '6-stelliger Code', enterkeyhint: 'done',
  });
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== input.value) input.value = digits;
    if (digits.length === 6) onComplete();
  });
  return input;
}

function codeForm(submitLabel, verify) {
  const err = el('div', { class: 'error', hidden: true, role: 'alert' });
  const btn = el('button', { type: 'submit', class: 'btn primary block' }, icon('check'), submitLabel);
  let busy = false;
  const send = async () => {
    const code = input.value.replace(/\D/g, '');
    if (busy) return;
    if (code.length !== 6) { err.textContent = 'Bitte den 6-stelligen Code eingeben.'; err.hidden = false; return; }
    busy = true; btn.disabled = true; err.hidden = true;
    try {
      await verify(code);
    } catch (e) {
      err.textContent = friendlyError(e).message; err.hidden = false;
      input.value = ''; input.focus();
    } finally { busy = false; btn.disabled = false; }
  };
  const input = codeInput(send);
  const form = el('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); send(); } },
    err, el('label', { class: 'field' }, el('span', { class: 'lbl', text: '6-stelliger Code' }), input), btn);
  return { form, input };
}

// ---------- Einrichten ----------
export function enrollScreen({ logo, enroll, verify, onLogout }) {
  const body = el('div', { class: 'card' }, el('p', { class: 'sub', text: 'Einen Moment …' }));
  const wrap = el('div', { class: 'auth mfa' },
    logo('Zwei-Faktor einrichten'),
    el('div', { class: 'info', text: 'Zu eurer Sicherheit braucht jeder neben dem Passwort einen 6-stelligen Code. Das richtest du jetzt einmal ein – dauert eine Minute.' }),
    body,
    el('div', { class: 'center' }, el('button', { type: 'button', class: 'linkbtn small-link', text: 'Abmelden', onclick: onLogout })));

  enroll().then((f) => {
    const uri = safeOtpUri(f.uri);
    const qr = qrImageSrc(f.qr);
    const host = location.host || 'diese Seite';
    const { form } = codeForm('Bestätigen', verify);
    body.replaceChildren(
      el('h2', { text: '1. Code-Generator hinzufügen' }),
      el('p', { text: `Tippe auf den Knopf. Das iPhone öffnet die Passwörter-App und fragt, wo der Code hin soll – wähle deinen Eintrag für ${host} (oder lege einen neuen an).` }),
      uri ? el('a', { class: 'btn primary block big', href: uri, id: 'otp-link' }, icon('key'), 'Zur iPhone-Passwörter-App hinzufügen') : null,
      el('p', { class: 'sub mt', text: 'Ab dann füllt dein iPhone den Code bei jeder Anmeldung automatisch aus – mit Face ID.' }),
      el('details', { class: 'more-fields mt' },
        el('summary', { text: 'Kein iPhone? QR-Code oder Schlüssel' }),
        el('p', { class: 'sub', text: 'Mit einer Authenticator-App (z. B. Google Authenticator, 1Password) den QR-Code scannen oder den Schlüssel eintippen.' }),
        qr ? el('img', { class: 'qr', src: qr, alt: 'QR-Code für die Zwei-Faktor-Anmeldung', width: 200, height: 200 }) : null,
        el('div', { class: 'secret-row' },
          el('code', { class: 'secret', text: groupSecret(f.secret) }),
          el('button', { type: 'button', class: 'btn small', onclick: async () => {
            try { await navigator.clipboard.writeText(f.secret); toast('Schlüssel kopiert.'); } catch { toast('Kopieren ging nicht – bitte abtippen.', true); }
          } }, icon('file'), 'Kopieren'))),
      el('h2', { class: 'mt', text: '2. Code eingeben' }),
      el('p', { class: 'sub', text: 'Gib den 6-stelligen Code ein, den die Passwörter-App jetzt anzeigt.' }),
      form);
  }).catch((e) => {
    body.replaceChildren(
      el('div', { class: 'error', text: friendlyError(e).message }),
      el('button', { class: 'btn block', onclick: () => location.reload() }, icon('refresh'), 'Nochmal versuchen'));
  });
  return wrap;
}

// ---------- Code bei der Anmeldung ----------
export function challengeScreen({ logo, verify, onLogout }) {
  const { form, input } = codeForm('Anmelden', verify);
  setTimeout(() => input.focus(), 50);
  return el('div', { class: 'auth mfa' },
    logo('Bestätigungscode'),
    el('div', { class: 'card' },
      el('p', { text: 'Gib den 6-stelligen Code aus deiner Passwörter-App ein. Auf dem iPhone erscheint er über der Tastatur – einfach antippen.' }),
      form,
      el('div', { class: 'center' }, el('button', { type: 'button', class: 'linkbtn', text: 'Handy verloren?', onclick: () => alertBox('Handy verloren?',
        el('p', { text: 'Kein Problem: Ein Admin kann in der App unter Mehr → Benutzer verwalten deine Zwei-Faktor-Anmeldung zurücksetzen. Danach meldest du dich mit deinem Passwort an und richtest den Code auf dem neuen Handy neu ein.' })) }))),
    el('div', { class: 'center' }, el('button', { type: 'button', class: 'linkbtn small-link', text: 'Abmelden', onclick: onLogout })));
}
