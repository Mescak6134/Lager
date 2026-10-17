// Übersicht (Startseite): Kennzahlen, Diagramme, Warnungen, letzte Buchungen
import { S, go, memberName, qtyText, reload, isDemo, activeOf } from '../store.js';
import { el, icon, topbar, iconBtn, fmtMoney, fmtNum, monthLong, today, toast } from '../ui.js';
import { monthlySpending } from '../calc.js';
import { monthlyBars, hBars } from '../charts.js';
import { kpi, thumb } from './masterdata.js';
import { entryList } from './history.js';
import { isLow } from './stock.js';

export function overview() {
  const D = S.D;
  const items = activeOf('items');
  const low = items.filter(isLow);
  const value = items.reduce((s, i) => s + D.value(i.id), 0);
  const month = today().slice(0, 7);
  const months = monthlySpending(S.data.movements, 12);
  const thisMonth = months[months.length - 1].value;
  const L = D.ledger;
  const myNet = L.net.get(S.me.id) || 0;
  const perPerson = S.data.members.filter((m) => m.active).map((m) => {
    const v = items.reduce((s, i) => s + D.value(i.id, m.id), 0);
    return { label: m.name, value: v, display: fmtMoney(v) };
  });
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';

  return el('div', null,
    topbar('Übersicht', {
      sub: `${hello}, ${S.me.name}!`,
      actions: [
        isDemo() ? el('span', { class: 'demo-flag', text: 'DEMO' }) : null,
        iconBtn('search', 'Suchen', () => go('#suche')),
        !isDemo() && !S.readonly ? iconBtn('refresh', 'Aktualisieren', async (e) => {
          const b = e.currentTarget; b.querySelector('svg').classList.add('spin');
          try { await reload(); toast('Aktualisiert.'); } catch { toast('Aktualisieren fehlgeschlagen.', true); }
        }) : null,
      ].filter(Boolean),
    }),
    S.readonly && S.snapshotAt ? el('div', { class: 'info', text: `Offline – Stand vom ${new Date(S.snapshotAt).toLocaleString('de-DE')}` }) : null,
    el('div', { class: 'kpis' },
      kpi('Artikel', fmtNum(items.length), low.length ? `${low.length} unter Minimum` : 'alles im grünen Bereich', low.length ? 'warn' : ''),
      kpi('Bestandswert', fmtMoney(value), 'zum Ø Einkaufspreis'),
      kpi(`Ausgaben ${monthLong(month).split(' ')[0]}`, fmtMoney(thisMonth), 'alle Einkäufe'),
      el('a', { href: '#abrechnung', class: 'kpi link ' + (L.open > 0 ? 'accent' : '') },
        el('span', { class: 'kpi-l', text: 'Offene Beträge' }),
        el('strong', { class: 'kpi-v', text: fmtMoney(L.open) }),
        el('span', { class: 'kpi-s', text: myNet > 0.004 ? `Du bekommst ${fmtMoney(myNet)}` : myNet < -0.004 ? `Du schuldest ${fmtMoney(-myNet)}` : 'Du bist ausgeglichen' }))),
    S.readonly ? null : el('div', { class: 'quick' },
      el('a', { class: 'btn primary', href: '#buchen/einkauf' }, icon('plus'), 'Einkauf'),
      el('a', { class: 'btn', href: '#buchen/abgang' }, icon('minus'), 'Abgang'),
      el('a', { class: 'btn', href: '#inventur' }, icon('clipboard'), 'Inventur')),
    el('section', { class: 'card' },
      el('h2', { text: 'Ausgaben je Monat' }),
      monthlyBars(months)),
    el('section', { class: 'card' },
      el('h2', { text: 'Bestandswert je Person' }),
      hBars(perPerson, { empty: 'Noch kein Bestand mit Preis.' })),
    low.length ? el('section', { class: 'card' },
      el('h2', null, icon('alert', 'xs warn-ic'), ' Wenig Bestand'),
      el('ul', { class: 'list' }, low.map((i) => el('li', null, el('a', { class: 'row link', href: '#artikel/' + i.id },
        thumb(i),
        el('span', { class: 'grow' }, el('strong', { class: 'block ellipsis', text: i.name }), el('span', { class: 'sub', text: `Minimum ${qtyText(i.id, i.min_qty)}` })),
        el('span', { class: 'badge warn', text: qtyText(i.id, D.qty(i.id)) })))))) : null,
    L.plan.length ? el('section', { class: 'card' },
      el('h2', { text: 'Wer schuldet wem?' }),
      el('ul', { class: 'list' }, L.plan.slice(0, 3).map((p) => el('li', { class: 'row' },
        el('span', { class: 'grow', text: `${memberName(p.from)} → ${memberName(p.to)}` }),
        el('strong', { text: fmtMoney(p.amount) })))),
      el('a', { class: 'btn block mt', href: '#abrechnung' }, icon('wallet'), 'Zur Abrechnung')) : null,
    el('h2', { class: 'section' }, 'Letzte Buchungen'),
    D.entries.length ? entryList(D.entries.slice(0, 5), { grouped: false }) : el('p', { class: 'sub', text: 'Noch keine Buchungen.' }),
    D.entries.length > 5 ? el('a', { class: 'btn block mt', href: '#verlauf' }, 'Ganzen Verlauf ansehen') : null);
}
