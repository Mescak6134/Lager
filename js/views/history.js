// Verlauf: alle Buchungen, neueste zuerst
import { S, run, memberName, itemName, qtyText, unitOf, locName, userName, canDeleteEntry, go, activeOf } from '../store.js';
import { el, icon, topbar, iconBtn, fmtMoney, fmtUnitMoney, fmtDate, fmtDateTime, dayLabel, confirmBox, selectEl, empty } from '../ui.js';
import { REASONS } from '../calc.js';
import { exportMovementsCSV } from '../exports.js';

const TYPE_LABEL = { zugang: 'Zugang', entnahme: 'Entnahme', uebertrag: 'Übertrag', umlagern: 'Umgelagert' };

export function entrySummary(e) {
  if (e.type === 'uebertrag') return `Übertrag · ${memberName(e.from)} → ${memberName(e.to)}`;
  if (e.type === 'umlagern') return `Umgelagert · ${memberName(e.from)}: ${locName(e.from_loc)} → ${locName(e.to_loc)}`;
  const who = e.rows.length > 1 ? e.rows.map((r) => `${memberName(r.owner_id)} ${qtyText(e.item_id, r.qty)}`).join(', ') : memberName(e.rows[0].owner_id);
  const label = e.reason === 'zugang' ? 'Zugang' : e.type === 'zugang' ? `${REASONS[e.reason] || 'Zugang'} (+)` : REASONS[e.reason] || 'Entnahme';
  return `${label} · ${who}`;
}

function signOf(e) {
  if (e.type === 'uebertrag' || e.type === 'umlagern') return ['move', '⇄', ''];
  return e.type === 'zugang' ? ['in', '+', '+'] : ['out', '−', '−'];
}

export function entryCard(e) {
  const [cls, sym, pre] = signOf(e);
  const details = el('div', { class: 'mv-details', hidden: true });
  const btn = el('button', { type: 'button', class: 'mv', 'aria-expanded': 'false', onclick: () => {
    details.hidden = !details.hidden;
    btn.setAttribute('aria-expanded', details.hidden ? 'false' : 'true');
    if (!details.hidden && !details.firstChild) fill();
  } },
  el('span', { class: 'sign ' + cls, text: sym }),
  el('span', { class: 'body' },
    el('span', { class: 'title', text: itemName(e.item_id) }),
    el('span', { class: 'meta', text: entrySummary(e) }),
    el('span', { class: 'meta', text: [fmtDate(e.date), e.value != null ? fmtMoney(e.value) : null, e.batch ? `Charge ${e.batch}` : null].filter(Boolean).join(' · ') })),
  el('span', { class: 'qty ' + cls, text: pre + qtyText(e.item_id, e.qty) }));
  function fill() {
    const rows = [
      ['Datum', fmtDate(e.date)],
      ['Art', TYPE_LABEL[e.type] + (e.reason && !['zugang', 'uebertrag'].includes(e.reason) ? ` (${REASONS[e.reason]})` : '')],
      e.rows.length > 1 && e.type === 'zugang' ? ['Aufteilung', e.rows.map((r) => `${memberName(r.owner_id)}: ${qtyText(e.item_id, r.qty)}`).join('\n')] : null,
      e.type === 'umlagern' || e.type === 'uebertrag' ? ['Lagerort', `${locName(e.from_loc)} → ${locName(e.to_loc)}`] : ['Lagerort', locName(e.location_id)],
      e.batch ? ['Charge / Los', e.batch] : null,
      e.unit_value != null ? ['Einzelwert', `${fmtUnitMoney(e.unit_value)} je ${unitOf(e.item_id)}`] : null,
      e.value != null ? ['Gesamtwert', fmtMoney(e.value)] : null,
      e.note ? ['Notiz', e.note] : null,
      ['Gebucht von', `${userName(e.created_by)} · ${fmtDateTime(e.created_at)}`],
    ].filter(Boolean);
    details.append(
      el('dl', { class: 'kv' }, rows.map(([k, v]) => [el('dt', { text: k }), el('dd', { class: 'pre', text: v })])),
      el('div', { class: 'actions mt' },
        el('a', { class: 'btn small', href: '#artikel/' + e.item_id }, icon('box'), 'Artikel'),
        canDeleteEntry(e) ? el('button', { type: 'button', class: 'btn small danger', onclick: async () => {
          const extra = e.rows.length > 1 ? ` Das löscht alle ${e.rows.length} zusammengehörigen Teile.` : '';
          if (!await confirmBox(`„${itemName(e.item_id)}“ vom ${fmtDate(e.date)} wirklich löschen?${extra} Das steht danach im Protokoll.`, { ok: 'Löschen', danger: true })) return;
          await run(() => S.backend.deleteMovement(e.id), 'Buchung gelöscht.');
        } }, icon('trash'), 'Löschen') : null));
  }
  return el('li', { class: 'card mv-card' }, btn, details);
}

export function entryList(entries, { grouped = true } = {}) {
  const out = [];
  let day = null, list = null;
  for (const e of entries) {
    if (grouped && e.date !== day) {
      day = e.date;
      out.push(el('div', { class: 'day', text: dayLabel(e.date) }));
      list = el('ul', { class: 'list' }); out.push(list);
    } else if (!list) { list = el('ul', { class: 'list' }); out.push(list); }
    list.append(entryCard(e));
  }
  return out;
}

export function history() {
  const f = (S.ui.hist ||= { person: '', item: '', type: '', text: '', limit: 60 });
  const match = (e) => (!f.person || e.owners.includes(f.person)) && (!f.item || e.item_id === f.item)
    && (!f.type || e.type === f.type || (f.type === 'korrektur' && e.reason === 'korrektur'))
    && (!f.text || [itemName(e.item_id), e.note, e.batch].some((v) => v && v.toLowerCase().includes(f.text.toLowerCase())));
  const all = S.D.entries.filter(match);
  const shown = all.slice(0, f.limit);
  const set = (k) => (ev) => { f[k] = ev.target.value; f.limit = 60; go('#verlauf'); };
  const search = el('input', { type: 'search', placeholder: 'Suchen: Artikel, Notiz, Charge', value: f.text, enterkeyhint: 'search', 'aria-label': 'Suchen' });
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => {
    f.text = search.value.trim(); f.limit = 60; go('#verlauf');
    setTimeout(() => { const s = document.querySelector('.hist-search input'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 0);
  }, 350); });
  return el('div', null,
    topbar('Verlauf', { sub: `${all.length} Einträge`, actions: [iconBtn('download', 'Als CSV (Excel) speichern', () => exportMovementsCSV(all.flatMap((e) => e.rows)))] }),
    el('div', { class: 'search hist-search' }, icon('search'), search),
    el('div', { class: 'filters three' },
      selectEl([['', 'Alle Personen'], ...S.data.members.map((m) => [m.id, m.name])], f.person, { onchange: set('person'), 'aria-label': 'Person' }),
      selectEl([['', 'Alle Artikel'], ...activeOf('items').map((i) => [i.id, i.name])], f.item, { onchange: set('item'), 'aria-label': 'Artikel' }),
      selectEl([['', 'Alle Arten'], ['zugang', 'Zugänge'], ['entnahme', 'Entnahmen'], ['uebertrag', 'Überträge'], ['umlagern', 'Umlagerungen'], ['korrektur', 'Korrekturen']], f.type, { onchange: set('type'), 'aria-label': 'Art' })),
    shown.length ? entryList(shown) : empty('list', 'Keine Buchungen gefunden.'),
    all.length > shown.length ? el('button', { class: 'btn block mt', onclick: () => { f.limit += 100; go('#verlauf'); } }, `Mehr anzeigen (${all.length - shown.length} weitere)`) : null);
}
