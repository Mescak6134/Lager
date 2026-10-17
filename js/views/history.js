// Verlauf: alle Buchungen, neueste zuerst
import { S, run, memberName, itemName, qtyText, locName, supName, userName, canDeleteEntry, go, activeOf } from '../store.js';
import { el, icon, topbar, iconBtn, fmtMoney, fmtDate, fmtDateTime, dayLabel, confirmBox, selectEl, empty } from '../ui.js';
import { REASONS } from '../calc.js';
import { exportMovementsCSV } from '../exports.js';

const TYPE_LABEL = { kauf: 'Einkauf', zugang: 'Zugang', abgang: 'Abgang', uebertrag: 'Übertrag', umlagern: 'Umgelagert' };

export function entrySummary(e) {
  switch (e.type) {
    case 'kauf': {
      const who = e.rows.length > 1 ? e.rows.map((r) => `${memberName(r.owner_id)} ${qtyText(e.item_id, r.qty)}`).join(', ') : memberName(e.rows[0].owner_id);
      return `Einkauf · ${who}` + (e.paid_by && e.price != null ? ` · bezahlt von ${memberName(e.paid_by)}` : '');
    }
    case 'uebertrag': return `Übertrag · ${memberName(e.from)} → ${memberName(e.to)}`;
    case 'umlagern': return `Umgelagert · ${memberName(e.from)}: ${locName(e.from_loc)} → ${locName(e.to_loc)}`;
    default: return `${REASONS[e.reason] || TYPE_LABEL[e.type]} · ${memberName(e.rows[0].owner_id)}`;
  }
}

function signOf(e) {
  if (e.type === 'uebertrag' || e.type === 'umlagern') return ['move', '⇄', ''];
  if (e.type === 'kauf' || e.type === 'zugang') return ['in', '+', '+'];
  return ['out', '−', '−'];
}

export function entryCard(e, { open = false } = {}) {
  const [cls, sym, pre] = signOf(e);
  const details = el('div', { class: 'mv-details', hidden: !open });
  const card = el('li', { class: 'card mv-card' },
    el('button', { type: 'button', class: 'mv', 'aria-expanded': open ? 'true' : 'false', onclick: () => {
      details.hidden = !details.hidden;
      card.querySelector('.mv').setAttribute('aria-expanded', details.hidden ? 'false' : 'true');
      if (!details.hidden && !details.firstChild) fillDetails();
    } },
    el('span', { class: 'sign ' + cls, text: sym }),
    el('span', { class: 'body' },
      el('span', { class: 'title', text: itemName(e.item_id) }),
      el('span', { class: 'meta', text: entrySummary(e) }),
      el('span', { class: 'meta', text: [fmtDate(e.date), e.price != null ? fmtMoney(e.price) : null, e.batch ? `Charge ${e.batch}` : null].filter(Boolean).join(' · ') })),
    el('span', { class: 'qty ' + cls, text: pre + qtyText(e.item_id, e.qty) })),
    details);
  function fillDetails() {
    const rows = [
      ['Datum', fmtDate(e.date)],
      ['Art', TYPE_LABEL[e.type] + (e.reason && !['kauf', 'uebertrag'].includes(e.reason) ? ` (${REASONS[e.reason]})` : '')],
      e.type === 'kauf' && e.rows.length > 1 ? ['Aufteilung', e.rows.map((r) => `${memberName(r.owner_id)}: ${qtyText(e.item_id, r.qty)}${r.price_total != null ? ' = ' + fmtMoney(r.price_total) : ''}`).join('\n')] : null,
      e.type === 'umlagern' || e.type === 'uebertrag' ? ['Lagerort', `${locName(e.from_loc)} → ${locName(e.to_loc)}`] : ['Lagerort', locName(e.location_id)],
      e.batch ? ['Charge / Los', e.batch] : null,
      e.price != null ? ['Preis', fmtMoney(e.price)] : null,
      e.paid_by ? ['Bezahlt von', memberName(e.paid_by)] : null,
      e.supplier_id ? ['Händler', supName(e.supplier_id)] : null,
      e.invoice_no ? ['Rechnungsnr.', e.invoice_no] : null,
      e.note ? ['Notiz', e.note] : null,
      ['Gebucht von', `${userName(e.created_by)} · ${fmtDateTime(e.created_at)}`],
    ].filter(Boolean);
    details.append(
      el('dl', { class: 'kv' }, rows.map(([k, v]) => [el('dt', { text: k }), el('dd', { class: 'pre', text: v })])),
      el('div', { class: 'actions mt' },
        el('a', { class: 'btn small', href: '#artikel/' + e.item_id }, icon('box'), 'Artikel'),
        canDeleteEntry(e) ? el('button', { type: 'button', class: 'btn small danger', onclick: async () => {
          const extra = e.rows.length > 1 ? ` Das löscht alle ${e.rows.length} zusammengehörigen Teile.` : '';
          if (!await confirmBox(`"${itemName(e.item_id)}" vom ${fmtDate(e.date)} wirklich löschen?${extra} Das wird im Protokoll festgehalten.`, { ok: 'Löschen', danger: true })) return;
          await run(() => S.backend.deleteMovement(e.id), 'Buchung gelöscht.');
        } }, icon('trash'), 'Löschen') : null));
  }
  if (open) fillDetails();
  return card;
}

export function entryList(entries, { grouped = true } = {}) {
  const out = [];
  let day = null;
  let list = null;
  for (const e of entries) {
    if (grouped && e.date !== day) {
      day = e.date;
      out.push(el('div', { class: 'day', text: dayLabel(e.date) }));
      list = el('ul', { class: 'list' });
      out.push(list);
    } else if (!list) { list = el('ul', { class: 'list' }); out.push(list); }
    list.append(entryCard(e));
  }
  return out;
}

export function history() {
  const f = (S.ui.hist ||= { person: '', item: '', type: '', text: '', limit: 60 });
  const all = S.D.entries.filter((e) =>
    (!f.person || e.owners.includes(f.person) || e.paid_by === f.person) &&
    (!f.item || e.item_id === f.item) &&
    (!f.type || e.type === f.type || (f.type === 'abgang' && e.type === 'abgang') || (f.type === 'korrektur' && e.reason === 'korrektur')) &&
    (!f.text || [itemName(e.item_id), e.note, e.batch, e.invoice_no, supName(e.supplier_id)].some((v) => v && v.toLowerCase().includes(f.text.toLowerCase()))));
  const shown = all.slice(0, f.limit);
  const set = (k) => (ev) => { f[k] = ev.target.value; f.limit = 60; go('#verlauf'); };
  const search = el('input', { type: 'search', placeholder: 'Suchen: Notiz, Charge, Rechnung …', value: f.text, enterkeyhint: 'search' });
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.text = search.value.trim(); f.limit = 60; go('#verlauf'); setTimeout(() => { const s = document.querySelector('.hist-search input'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 0); }, 350); });

  return el('div', null,
    topbar('Verlauf', { sub: `${all.length} Einträge`, actions: [
      iconBtn('download', 'Als CSV (Excel) speichern', () => exportMovementsCSV(all.flatMap((e) => e.rows))),
      iconBtn('print', 'Drucken / PDF', () => go('#bericht/verlauf')),
    ] }),
    el('div', { class: 'search hist-search' }, icon('search'), search),
    el('div', { class: 'filters three' },
      selectEl([['', 'Alle Personen'], ...S.data.members.map((m) => [m.id, m.name])], f.person, { onchange: set('person'), 'aria-label': 'Person' }),
      selectEl([['', 'Alle Artikel'], ...activeOf('items').map((i) => [i.id, i.name])], f.item, { onchange: set('item'), 'aria-label': 'Artikel' }),
      selectEl([['', 'Alle Arten'], ['kauf', 'Einkäufe'], ['abgang', 'Abgänge'], ['uebertrag', 'Überträge'], ['umlagern', 'Umlagerungen'], ['korrektur', 'Korrekturen']], f.type, { onchange: set('type'), 'aria-label': 'Art' })),
    shown.length ? entryList(shown) : empty('list', 'Keine Buchungen gefunden.'),
    all.length > shown.length ? el('button', { class: 'btn block mt', onclick: () => { f.limit += 100; go('#verlauf'); } }, `Mehr anzeigen (${all.length - shown.length} weitere)`) : null);
}
