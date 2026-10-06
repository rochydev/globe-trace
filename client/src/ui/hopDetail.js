import { h, icon, flag } from './dom.js';
import { pad2, fmtMs, fmtCoord, latencyColor } from './format.js';

const SOURCE_LABEL = { db: 'Base de datos', hostname: 'Hostname (DNS)' };

/** Tarjeta con el detalle del salto seleccionado. */
export function createHopDetail({ onClose }) {
  const root = document.getElementById('detail');

  const field = (label, value, mono = true) =>
    h('div', { class: 'detail__field' }, [
      h('dt', {}, label),
      h('dd', { class: mono ? 'mono' : '' }, value ?? '—'),
    ]);

  return {
    show(hop) {
      const g = hop.geo;
      const parts = [
        h('header', { class: 'panel__head' }, [
          icon('Crosshair', 16),
          h('h2', {}, `Salto ${pad2(hop.hop)}`),
          h(
            'button',
            { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar detalle', onclick: onClose },
            icon('X', 16),
          ),
        ]),
        h('div', { class: 'detail__hero' }, [
          flag(g.countryCode),
          h('div', {}, [h('strong', {}, g.city ?? 'Ciudad desconocida'), h('span', {}, g.country)]),
        ]),
        h('dl', { class: 'detail__grid' }, [
          field('IP', hop.ip),
          field('Hostname', hop.hostname),
          field('ISP', g.isp, false),
          field('ASN', g.asn ? `AS${g.asn}` : null),
          field('Coordenadas', `${fmtCoord(g.lat, 'lat')} ${fmtCoord(g.lon, 'lon')}`),
          field('Media', fmtMs(hop.latency)),
          field('Fuente', SOURCE_LABEL[g.source] ?? 'Base de datos', false),
          field('Precisión', g.accuracyKm ? `± ${g.accuracyKm} km` : null),
        ]),
        g.plausible === false
          ? h('p', { class: 'detail__warn' }, [
              icon('TriangleAlert', 14),
              'Esta ubicación es imposible con la latencia medida: la luz no recorre esa distancia en ese tiempo. Probablemente sea la sede del operador.',
            ])
          : null,
        h('div', { class: 'detail__probes' }, [
          h('span', { class: 'detail__probes-label' }, 'Sondas'),
          ...hop.rtts.map((r) =>
            h('span', { class: 'probe mono', style: `--c:${latencyColor(r)}` }, r === null ? '*' : r.toFixed(1)),
          ),
        ]),
      ];
      // replaceChildren convertiría un null en el texto "null": se filtran los vacíos
      root.replaceChildren(...parts.filter(Boolean));
      root.hidden = false;
      // Reinicia la animación de entrada en cada salto nuevo
      root.classList.remove('is-in');
      void root.offsetWidth;
      root.classList.add('is-in');
    },
    hide() {
      root.hidden = true;
    },
  };
}
