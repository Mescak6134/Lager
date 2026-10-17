// Abrechnung: wer hat bezahlt, wem gehört was, wer schuldet wem
import { S, run, go, memberName, memberOptions } from '../store.js';
import { el, icon, topbar, iconBtn, fmtMoney, fmtDate, formDialog, confirmBox, today, empty, round2 } from '../ui.js';
import { exportSettleCSV } from '../exports.js';

export function settle() {
  const L = S.D.ledger;
  const members = S.data.members.filter((m) => m.active || (L.net.get(m.id) || 0) !== 0);
  const maxAbs = Math.max(0.01, ...members.map((m) => Math.abs(L.net.get(m.id) || 0)));

  return el('div', null,
    topbar('Abrechnung', { back: '#mehr', sub: 'Wer hat bezahlt – und wer schuldet wem?', actions: [
      iconBtn('download', 'Als CSV speichern', exportSettleCSV),
      iconBtn('print', 'Drucken / PDF', () => go('#bericht/abrechnung')),
    ] }),
    el('section', { class: 'card' },
      el('h2', { text: 'Kontostand je Person' }),
      el('p', { class: 'sub', text: 'Plus = bekommt Geld · Minus = muss zahlen' }),
      el('div', { class: 'net-list' }, members.map((m) => {
        const v = L.net.get(m.id) || 0;
        const w = Math.round((Math.abs(v) / maxAbs) * 50);
        return el('div', { class: 'net-row' },
          el('span', { class: 'who ellipsis', text: m.name }),
          el('span', { class: 'net-bar' },
            el('span', { class: 'mid' }),
            v ? el('span', { class: v > 0 ? 'pos' : 'neg', style: v > 0 ? { left: '50%', width: w + '%' } : { right: '50%', width: w + '%' } }) : null),
          el('span', { class: 'num ' + (v > 0 ? 'pos-t' : v < 0 ? 'neg-t' : ''), text: (v > 0 ? '+' : '') + fmtMoney(v) }));
      }))),
    el('section', { class: 'card' },
      el('h2', { text: 'So wird ausgeglichen' }),
      L.plan.length
        ? el('ul', { class: 'list' }, L.plan.map((p) => el('li', { class: 'plan-row' },
          el('div', { class: 'row no-border' },
            el('span', { class: 'grow' }, el('strong', { text: memberName(p.from) }), ' zahlt an ', el('strong', { text: memberName(p.to) })),
            el('strong', { class: 'nowrap amt', text: fmtMoney(p.amount) })),
          S.readonly ? null : el('button', { class: 'btn small primary block', onclick: () => addSettlement(p) }, icon('check'), 'Ausgleich buchen'))))
        : el('p', { class: 'ok-line' }, icon('check'), ' Alles ausgeglichen – niemand schuldet jemandem etwas.'),
      L.plan.length ? el('p', { class: 'sub mt', text: `Das sind die wenigsten Zahlungen, mit denen alle bei 0 landen (${L.plan.length === 1 ? 'eine Zahlung' : L.plan.length + ' Zahlungen'}).` }) : null),
    L.pairs.length ? el('details', { class: 'card' },
      el('summary', { text: 'Einzelne Schulden zwischen zwei Personen' }),
      el('ul', { class: 'list mt' }, L.pairs.map((p) => el('li', { class: 'row' },
        el('span', { class: 'grow', text: `${memberName(p.from)} schuldet ${memberName(p.to)}` }), el('strong', { text: fmtMoney(p.amount) }))))) : null,
    el('section', { class: 'card' },
      el('h2', { text: 'Ausgaben je Person' }),
      el('table', { class: 'tbl' },
        el('thead', null, el('tr', null, el('th', { text: 'Person' }), el('th', { class: 'r', text: 'Bezahlt' }), el('th', { class: 'r', text: 'Sein Anteil' }))),
        el('tbody', null, members.map((m) => el('tr', null,
          el('td', { text: m.name }), el('td', { class: 'r', text: fmtMoney(L.spent.get(m.id) || 0) }), el('td', { class: 'r', text: fmtMoney(L.share.get(m.id) || 0) }))))),
      el('p', { class: 'sub mt', text: '„Bezahlt“ = was jemand an der Kasse bezahlt hat. „Sein Anteil“ = Wert der Sachen, die ihm gehören. Ausgleichszahlungen sind hier nicht drin.' })),
    el('div', { class: 'row-actions' },
      el('h2', { class: 'section', text: 'Ausgleichszahlungen' }),
      S.readonly ? null : el('button', { class: 'btn small', onclick: () => addSettlement(null) }, icon('plus'), 'Zahlung eintragen')),
    S.data.settlements.length ? el('ul', { class: 'list' }, S.data.settlements.map((s) => el('li', { class: 'card row' },
      el('span', { class: 'sign move', text: '€' }),
      el('span', { class: 'grow' },
        el('strong', { class: 'block', text: `${memberName(s.from_member)} → ${memberName(s.to_member)}` }),
        el('span', { class: 'sub', text: [fmtDate(s.happened_on), s.note].filter(Boolean).join(' · ') })),
      el('strong', { class: 'nowrap', text: fmtMoney(s.amount) }),
      canDeleteSettlement(s) ? el('button', { class: 'icon-btn danger', 'aria-label': 'Löschen', onclick: async () => {
        if (!await confirmBox(`Zahlung ${memberName(s.from_member)} → ${memberName(s.to_member)} über ${fmtMoney(s.amount)} löschen?`, { ok: 'Löschen', danger: true })) return;
        await run(() => S.backend.remove('settlements', s.id), 'Zahlung gelöscht.');
      } }, icon('trash')) : null)))
      : empty('wallet', 'Noch keine Ausgleichszahlungen.'));
}

function canDeleteSettlement(s) {
  if (S.readonly) return false;
  if (S.me.role === 'admin') return true;
  return s.created_by === S.session?.user?.id || s.from_member === S.me.id || s.to_member === S.me.id;
}

async function addSettlement(p) {
  const opts = memberOptions();
  const res = await formDialog('Ausgleich buchen', [
    { name: 'from_member', label: 'Wer zahlt?', type: 'select', options: opts, required: true },
    { name: 'to_member', label: 'An wen?', type: 'select', options: opts, required: true },
    { name: 'amount', label: 'Betrag in €', type: 'number', required: true },
    { name: 'happened_on', label: 'Datum', type: 'date', required: true },
    { name: 'note', label: 'Notiz', placeholder: 'z. B. bar, PayPal, Überweisung', max: 300 },
  ], { from_member: p?.from || S.me.id, to_member: p?.to || opts.find(([id]) => id !== S.me.id)?.[0], amount: p ? round2(p.amount) : '', happened_on: today() }, {
    submit: 'Buchen',
    onSave: (v) => {
      if (v.from_member === v.to_member) throw new Error('Bitte zwei verschiedene Personen wählen.');
      if (!(v.amount > 0)) throw new Error('Der Betrag muss größer als 0 sein.');
    },
  });
  if (!res) return;
  await run(() => S.backend.insert('settlements', { ...res, amount: round2(res.amount) }), `Ausgleich über ${fmtMoney(res.amount)} gebucht.`);
}
