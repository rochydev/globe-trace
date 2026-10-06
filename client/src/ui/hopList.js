import { h, icon, flag } from './dom.js';
import { pad2, fmtMs, latencyColor, STATUS_INFO } from './format.js';

// Escala de la barra de latencia: a partir de 300 ms la barra va llena
const BAR_MAX_MS = 300;

/** Timeline de saltos del panel derecho. */
export function createHopList({ onSelect }) {
  const list = document.getElementById('hops');
  const empty = document.getElementById('hops-empty');
  const target = document.getElementById('hops-target');
  const rows = new Map();

  function row(hop) {
    const info = STATUS_INFO[hop.status];
    const g = hop.geo;

    const place = g
      ? h('span', { class: 'hop__place' }, [
          flag(g.countryCode),
          h('span', {}, g.city ?? g.country),
          g.source === 'hostname'
            ? h('span', { class: 'tag mono', title: 'Ubicación deducida del nombre DNS del router' }, 'DNS')
            : null,
          g.plausible === false
            ? h('span', { class: 'tag tag--warn', title: 'Incompatible con la latencia medida' }, icon('TriangleAlert', 11))
            : null,
        ])
      : h('span', { class: 'hop__place hop__place--muted' }, [icon(info.icon, 13), info.label]);

    const isp = g?.isp
      ? h('span', { class: 'hop__isp' }, [g.isp, g.asn ? h('span', { class: 'mono' }, ` AS${g.asn}`) : null])
      : null;

    const pct = hop.latency === null ? 0 : Math.min(hop.latency / BAR_MAX_MS, 1) * 100;
    const color = latencyColor(hop.latency);

    const li = h(
      'li',
      {
        class: `hop hop--${hop.status}`,
        tabindex: g ? 0 : -1,
        'data-hop': hop.hop,
        onclick: () => g && onSelect(hop.hop),
        onkeydown: (e) => g && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(hop.hop)),
      },
      [
        h('span', { class: 'hop__num mono' }, pad2(hop.hop)),
        h('span', { class: 'hop__node', 'aria-hidden': 'true' }),
        h('div', { class: 'hop__body' }, [
          h('div', { class: 'hop__line' }, [
            h('span', { class: 'hop__ip mono' }, hop.ip ?? '* * *'),
            h('span', { class: 'hop__ms mono', style: `color:${color}` }, fmtMs(hop.latency)),
          ]),
          h('div', { class: 'hop__line hop__line--sub' }, [place, isp]),
          h('div', { class: 'hop__bar' }, [
            h('span', { style: `--w:${pct}%; --c:${color}` }),
          ]),
        ]),
      ],
    );
    return li;
  }

  return {
    reset(targetLabel) {
      list.replaceChildren();
      rows.clear();
      empty.hidden = true;
      target.textContent = targetLabel;
    },
    add(hop) {
      const li = row(hop);
      rows.set(hop.hop, li);
      list.append(li);
      // Desplaza la lista para que el último salto quede a la vista
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    select(hopNumber) {
      for (const [n, li] of rows) li.classList.toggle('hop--selected', n === hopNumber);
      rows.get(hopNumber)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  };
}
