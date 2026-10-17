// Schlanke SVG-Diagramme (ohne Bibliotheken). Farben kommen aus CSS-Variablen,
// damit sie im hellen und dunklen Modus stimmen.
import { el, svg, fmtMoney, monthShort, monthLong } from './ui.js';

// Säulen je Monat. data: [{ month:'2026-10', value }]
export function monthlyBars(data) {
  const W = 340, H = 170, padL = 8, padR = 8, padT = 22, padB = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const slot = (W - padL - padR) / n;
  const bw = Math.max(6, slot - 6);
  const caption = el('div', { class: 'chart-cap', 'aria-live': 'polite' });
  const lastIdx = n - 1;
  const maxIdx = data.reduce((bi, d, i) => (d.value > data[bi].value ? i : bi), 0);
  const plotH = H - padT - padB;
  const node = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Ausgaben je Monat' });
  // Grundlinie + eine Hilfslinie
  node.append(svg('line', { x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH, class: 'axis' }));
  node.append(svg('line', { x1: padL, x2: W - padR, y1: padT, y2: padT, class: 'grid' }));
  const show = (i) => {
    caption.textContent = `${monthLong(data[i].month)}: ${fmtMoney(data[i].value)}`;
    node.querySelectorAll('.bar-hit').forEach((b, j) => b.classList.toggle('on', j === i));
  };
  data.forEach((d, i) => {
    const h = d.value > 0 ? Math.max(3, (d.value / max) * plotH) : 0;
    const x = padL + i * slot + (slot - bw) / 2;
    const y = padT + plotH - h;
    const g = svg('g', { class: 'bar-hit', tabindex: 0, role: 'button', 'aria-label': `${monthLong(d.month)}: ${fmtMoney(d.value)}` });
    g.append(svg('rect', { x: padL + i * slot, y: padT - 20, width: slot, height: plotH + 20 + padB, class: 'hit' }));
    if (h > 0) g.append(svg('path', { d: roundTop(x, y, bw, h, Math.min(4, bw / 2)), class: 'bar' + (i === lastIdx ? ' cur' : '') }));
    g.append(svg('text', { x: x + bw / 2, y: H - 7, class: 'tick', 'text-anchor': 'middle' }, monthShort(d.month)));
    if ((i === maxIdx || i === lastIdx) && d.value > 0) {
      g.append(svg('text', { x: x + bw / 2, y: y - 6, class: 'val', 'text-anchor': 'middle' }, shortMoney(d.value)));
    }
    g.addEventListener('click', () => show(i));
    g.addEventListener('mouseenter', () => show(i));
    g.addEventListener('focus', () => show(i));
    g.append(svg('title', null, `${monthLong(d.month)}: ${fmtMoney(d.value)}`));
    node.append(g);
  });
  caption.textContent = `${monthLong(data[lastIdx].month)}: ${fmtMoney(data[lastIdx].value)} · Tippe auf eine Säule`;
  return el('figure', { class: 'figure' }, node, caption);
}

// Waagrechte Balken mit Beschriftung. rows: [{ label, value, display }]
export function hBars(rows, { empty = 'Keine Daten' } = {}) {
  if (!rows.length || rows.every((r) => !r.value)) return el('p', { class: 'sub', text: empty });
  const max = Math.max(...rows.map((r) => r.value), 1);
  return el('div', { class: 'hbars', role: 'list' }, rows.map((r) =>
    el('div', { class: 'split-row', role: 'listitem', title: `${r.label}: ${r.display}` },
      el('span', { class: 'who', text: r.label }),
      el('span', { class: 'bar' }, el('span', { style: { width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` } })),
      el('span', { class: 'num', text: r.display }))));
}

function roundTop(x, y, w, h, r) {
  r = Math.min(r, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function shortMoney(v) {
  if (v >= 1000) return (Math.round(v / 100) / 10).toString().replace('.', ',') + ' T€';
  return Math.round(v) + ' €';
}
