// Kleine Helfer für Oberfläche, Formatierung und Dateien.
// Alle Texte werden als Text eingesetzt (nie als HTML) – so kann niemand
// über Eingaben fremden Code einschleusen.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  applyProps(node, props);
  append(node, children);
  return node;
}

export function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) node.setAttribute(k, v);
  append(node, children);
  return node;
}

function applyProps(node, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'required' || k === 'multiple' || k === 'autofocus') node[k] = !!v;
    else node.setAttribute(k, v === true ? '' : v);
  }
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// ---------- Symbole ----------
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  factory: 'M2 20h20M4 20V10l5 3V10l5 3V6l6 4v10',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  pin: 'M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  clipboard: 'M9 4h6v3H9zM9 5H6v16h12V5h-3M9 13l2 2 4-4',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 14h.01',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  logout: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  key: 'M15 7a4 4 0 1 1-3.87 5H8v3H5v-3H3v-3h8.13A4 4 0 0 1 15 7z',
  right: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7h.01',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  file: 'M6 3h9l5 5v13H6zM14 3v6h6',
  phone: 'M7 2h10v20H7zM11 18h2',
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  minus: 'M5 12h14',
  euro: 'M18 6a7 7 0 1 0 0 12M4 10h10M4 14h10',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
};

export function icon(name, extraClass) {
  return svg('svg', { class: 'icon' + (extraClass ? ' ' + extraClass : ''), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    svg('path', { d: ICONS[name] || ICONS.info }));
}

// ---------- Zahlen & Datum ----------
const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const mf = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const fmtNum = (n) => nf.format(Number(n) || 0);
export const fmtQty = (n, unit) => `${fmtNum(n)} ${unit || ''}`.trim();
export const fmtMoney = (n) => mf.format(Number(n) || 0);
const mf4 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 });
// Einzelwert: bei kleinen Beträgen (z. B. 0,0903 € je g) mehr Stellen zeigen
export const fmtUnitMoney = (n) => (n == null ? '—' : Math.abs(n) < 1 ? mf4.format(n) : mf.format(n));
export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}.${m}.${y}`;
}
export function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const monthShort = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1];
export const monthLong = (ym) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayLabel(d) {
  const t = today();
  if (d === t) return 'Heute';
  const y = new Date(); y.setDate(y.getDate() - 1);
  const ys = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (d === ys) return 'Gestern';
  return fmtDate(d);
}
// "1,5" oder "1.5" → 1.5 ; leer → null ; Unsinn → NaN
export function parseNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s/g, '');
  if (!t) return null;
  let norm = t;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) norm = t.replace(/\./g, ''); // 1.500 = tausendfünfhundert
  if (!/^-?\d*\.?\d+$/.test(norm)) return NaN;
  return Number(norm);
}
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

// ---------- Meldungen ----------
let toastTimer;
export function toast(msg, bad) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 2600);
}

// ---------- Dialoge ----------
function openDialog(build) {
  return new Promise((resolve) => {
    const dlg = el('dialog');
    let done = false;
    const finish = (val) => {
      if (done) return; done = true;
      try { dlg.close(); } catch { /* schon zu */ }
      dlg.remove();
      resolve(val);
    };
    build(dlg, finish);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function confirmBox(text, { ok = 'OK', danger = false, title = 'Bist du sicher?' } = {}) {
  return openDialog((dlg, finish) => {
    dlg.append(el('form', { method: 'dialog', onsubmit: (e) => { e.preventDefault(); finish(true); } },
      el('h2', { text: title }),
      el('p', { text }),
      el('div', { class: 'actions mt' },
        el('button', { type: 'button', class: 'btn', text: 'Abbrechen', onclick: () => finish(false) }),
        el('button', { type: 'submit', class: 'btn ' + (danger ? 'danger-fill' : 'primary'), text: ok }))));
  }).then(Boolean);
}

export function alertBox(title, ...content) {
  return openDialog((dlg, finish) => {
    dlg.append(el('form', { method: 'dialog', onsubmit: (e) => { e.preventDefault(); finish(true); } },
      el('h2', { text: title }), ...content,
      el('div', { class: 'actions mt' }, el('button', { type: 'submit', class: 'btn primary', text: 'OK' }))));
  });
}

/**
 * Formular im Dialog.
 * fields: [{ name, label, type, options:[[value,label]], required, hint, placeholder, scan, accept }]
 * Liefert die eingegebenen Werte oder null bei Abbruch.
 * onSave(values) darf einen Fehler werfen → wird im Dialog angezeigt.
 */
export function formDialog(title, fields, values = {}, { submit = 'Speichern', onSave, extra } = {}) {
  return openDialog((dlg, finish) => {
    const err = el('div', { class: 'error', hidden: true });
    const inputs = {};
    const rows = fields.map((f) => {
      if (f.type === 'heading') return el('h3', { class: 'form-h', text: f.label });
      let input;
      const id = 'f_' + f.name + '_' + Math.random().toString(36).slice(2, 7);
      const v = values[f.name];
      if (f.type === 'select') {
        input = el('select', { id, name: f.name },
          (f.options || []).map(([val, lbl]) => el('option', { value: val ?? '', text: lbl, selected: String(v ?? '') === String(val ?? '') })));
      } else if (f.type === 'textarea') {
        input = el('textarea', { id, name: f.name, rows: 3, maxlength: f.max || 1000, placeholder: f.placeholder }, v ?? '');
        input.value = v ?? '';
      } else if (f.type === 'checkbox') {
        input = el('input', { id, name: f.name, type: 'checkbox', checked: !!v, class: 'check' });
        inputs[f.name] = input;
        return el('label', { class: 'field checkrow', for: id }, input, el('span', { text: f.label }));
      } else if (f.type === 'color') {
        input = el('input', { id, name: f.name, type: 'color', value: v || '#d97706', class: 'color' });
      } else {
        input = el('input', {
          id, name: f.name, type: f.type === 'number' ? 'text' : (f.type || 'text'),
          inputmode: f.type === 'number' ? 'decimal' : (f.type === 'tel' ? 'tel' : f.inputmode || null),
          value: v == null ? '' : (f.type === 'number' ? String(v).replace('.', ',') : v),
          maxlength: f.max || 200, placeholder: f.placeholder, list: f.list ? id + '_l' : null, readonly: !!f.readonly,
          autocomplete: f.autocomplete || 'off', autocapitalize: f.type === 'email' || f.type === 'url' ? 'none' : null,
          autocorrect: f.type === 'email' || f.type === 'url' ? 'off' : null,
        });
      }
      if (f.required) input.required = true;
      inputs[f.name] = input;
      let control = input;
      const btns = [...(f.buttons || []), ...(f.scan ? [{ icon: 'scan', label: 'Barcode scannen', onClick: async (inp) => { const code = await f.scan(); if (code) inp.value = code; } }] : [])];
      if (btns.length) {
        control = el('div', { class: 'with-btn' }, input,
          btns.map((b) => el('button', { type: 'button', class: 'icon-btn', 'aria-label': b.label, title: b.label, onclick: (e) => { e.preventDefault(); b.onClick(input); } }, icon(b.icon))));
      }
      return el('label', { class: 'field', for: id },
        el('span', { class: 'lbl', text: f.label + (f.required ? ' *' : '') }),
        control,
        f.list ? el('datalist', { id: id + '_l' }, f.list.map((x) => el('option', { value: x }))) : null,
        f.hint ? el('span', { class: 'hint', text: f.hint }) : null);
    });
    const saveBtn = el('button', { type: 'submit', class: 'btn primary', text: submit });
    const form = el('form', {
      method: 'dialog', novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.hidden = true;
        const out = {};
        for (const f of fields) {
          if (f.type === 'heading') continue;
          const inp = inputs[f.name];
          if (f.type === 'checkbox') { out[f.name] = inp.checked; continue; }
          let val = inp.value.trim();
          if (f.required && !val) { showErr(`Bitte "${f.label}" ausfüllen.`); inp.focus(); return; }
          if (f.type === 'number') {
            const n = parseNum(val);
            if (Number.isNaN(n) || (n != null && n < 0)) { showErr(`"${f.label}" ist keine gültige Zahl.`); inp.focus(); return; }
            out[f.name] = n;
          } else if (f.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            showErr('Bitte eine gültige E-Mail-Adresse eingeben.'); inp.focus(); return;
          } else {
            out[f.name] = val === '' ? null : val;
          }
        }
        if (onSave) {
          saveBtn.disabled = true;
          try { await onSave(out); } catch (ex) { saveBtn.disabled = false; showErr(ex.message || String(ex)); return; }
        }
        finish(out);
      },
    },
    el('h2', { text: title }),
    err,
    rows,
    extra || null,
    el('div', { class: 'actions mt' },
      el('button', { type: 'button', class: 'btn', text: 'Abbrechen', onclick: () => finish(null) }),
      saveBtn));
    function showErr(m) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
    dlg.append(form);
  });
}

// ---------- Dateien ----------
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// Excel-freundliche CSV: Semikolon, deutsche Kommazahlen, UTF-8 mit BOM
export function toCSV(rows) {
  const cell = (v) => {
    if (v == null) return '';
    let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = "'" + s; // keine Formeln
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
export const downloadCSV = (name, rows) => download(name, toCSV(rows), 'text/csv;charset=utf-8');

// ---------- Kleine Bausteine ----------
export function topbar(title, { back, actions = [], sub } = {}) {
  return el('header', { class: 'topbar' },
    back ? el('a', { class: 'icon-btn back', href: back, 'aria-label': 'Zurück' }, icon('left')) : null,
    el('div', { class: 'grow' }, el('h1', { text: title }), sub ? el('div', { class: 'sub', text: sub }) : null),
    ...actions);
}
export const iconBtn = (name, label, onclick, cls = '') => el('button', { type: 'button', class: 'icon-btn ' + cls, 'aria-label': label, title: label, onclick }, icon(name));
export function empty(iconName, text, action) {
  return el('div', { class: 'empty' }, icon(iconName), el('p', { text }), action || null);
}
export function selectEl(options, value, props = {}) {
  return el('select', props, options.map(([v, l]) => el('option', { value: v ?? '', text: l, selected: String(value ?? '') === String(v ?? '') })));
}
export function field(label, control, hint) {
  return el('label', { class: 'field' }, el('span', { class: 'lbl', text: label }), control, hint ? el('span', { class: 'hint', text: hint }) : null);
}
