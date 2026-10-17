// Anmeldung mit Benutzername statt E-Mail.
// Supabase braucht intern eine E-Mail-Adresse – daraus wird <benutzername>@LOGIN_DOMAIN.
// Diese Adressen bekommen nie eine E-Mail und werden in der App nur als Benutzername gezeigt.
export const LOGIN_DOMAIN = 'pyrolagern.de';

const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', é: 'e', è: 'e', à: 'a', á: 'a', ç: 'c', ñ: 'n' };

// "Jürgen Groß" → "juergen.gross"
export function normalizeUsername(input) {
  return String(input || '').trim().toLowerCase()
    .replace(/[äöüßéèàáçñ]/g, (c) => UMLAUTE[c])
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 20);
}

export const validUsername = (u) => /^[a-z0-9._-]{3,20}$/.test(u);

// Eingabe im Login-Feld → Anmelde-Adresse. Mit "@" wird es als E-Mail genommen (z. B. der Admin).
export function loginEmail(input) {
  const t = String(input || '').trim();
  if (t.includes('@')) return t;
  return `${normalizeUsername(t)}@${LOGIN_DOMAIN}`;
}

export const isUsernameLogin = (email) => String(email || '').toLowerCase().endsWith('@' + LOGIN_DOMAIN);

// Für die Anzeige: Benutzername statt künstlicher Adresse
export function displayLogin(email) {
  const e = String(email || '');
  return isUsernameLogin(e) ? e.slice(0, e.length - LOGIN_DOMAIN.length - 1) : e;
}

// Gut lesbares Startpasswort, z. B. "Lager-4821-Kiwi"
const WORDS = ['Kiwi', 'Mango', 'Birne', 'Apfel', 'Pflaume', 'Kirsche', 'Zitrone', 'Melone', 'Dattel', 'Feige',
  'Fuchs', 'Dachs', 'Biber', 'Falke', 'Otter', 'Luchs', 'Elch', 'Wal', 'Igel', 'Hase', 'Adler', 'Pinguin', 'Koala', 'Tiger'];
export function generatePassword() {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return `Lager-${String(1000 + (r[0] % 9000))}-${WORDS[r[1] % WORDS.length]}`;
}
