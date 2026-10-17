// Silvester-Termine – reine Funktionen ohne Oberfläche (getestet mit Node).
// Gerechnet wird nur mit Kalendertagen (UTC aus Jahr/Monat/Tag des Geräts) – Sommerzeit spielt keine Rolle.
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dayNum = (y, m, d) => Date.UTC(y, m, d) / 86400000;          // Tagesnummer
const todayParts = (date) => [date.getFullYear(), date.getMonth(), date.getDate()];

// Erster Einkaufstag für Silvesterfeuerwerk: die letzten 3 Werktage (Mo–Sa) des Jahres, der früheste davon.
export function shoppingDays(year) {
  const days = [];
  for (let d = 31; days.length < 3; d--) if (new Date(Date.UTC(year, 11, d)).getUTCDay() !== 0) days.push(d);
  return days.reverse();                                              // z. B. [29, 30, 31]
}
export function firstShoppingDay(year) {
  const d = shoppingDays(year)[0];
  return { year, month: 12, day: d, weekday: WD[new Date(Date.UTC(year, 11, d)).getUTCDay()] };
}

export function silvesterText(date = new Date()) {
  const [y, m, d] = todayParts(date);
  if (m === 11 && d === 31) return 'Heute ist Silvester! 🎆';
  if (m === 0 && d === 1) return 'Frohes neues Jahr!';
  const days = dayNum(y, 11, 31) - dayNum(y, m, d);
  return days === 1 ? 'Morgen ist Silvester!' : `Noch ${days} Tage bis Silvester`;
}

// Text für den Einkaufstag-Chip; null = ausblenden (Neujahr und nach den Einkaufstagen)
export function shoppingText(date = new Date()) {
  const [y, m, d] = todayParts(date);
  if (m === 0 && d === 1) return null;
  const today = dayNum(y, m, d);
  const days = shoppingDays(y).map((x) => dayNum(y, 11, x));
  const diff = days[0] - today;
  if (diff > 1) { const f = firstShoppingDay(y); return `Erster Einkaufstag in ${diff} Tagen · ${f.weekday} ${String(f.day).padStart(2, '0')}.12.`; }
  if (diff === 1) return 'Morgen ist erster Einkaufstag!';
  const left = days.filter((x) => x >= today).length;
  if (!left) return null;
  const n = `noch ${left} ${left === 1 ? 'Tag' : 'Tage'}`;
  return new Date(Date.UTC(y, m, d)).getUTCDay() === 0 ? `Sonntag: Pause – ${n}` : `Einkaufstage laufen – ${n}`;
}
