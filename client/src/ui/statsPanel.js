import { h, icon, flag } from './dom.js';

const CARDS = [
  { key: 'hops', label: 'Saltos', icon: 'Route', unit: '', decimals: 0 },
  { key: 'latency', label: 'Latencia', icon: 'Timer', unit: 'ms', decimals: 1 },
  { key: 'distanceKm', label: 'Distancia', icon: 'Ruler', unit: 'km', decimals: 0 },
  { key: 'countries', label: 'Países', icon: 'Globe2', unit: '', decimals: 0 },
];

/** Las cuatro tarjetas de estadísticas, con números que cuentan hacia arriba. */
export function createStatsPanel() {
  const root = document.getElementById('stats');
  const cards = {};

  for (const c of CARDS) {
    const value = h('span', { class: 'stat__value mono' }, '0');
    const extra = h('div', { class: 'stat__extra' });
    root.append(
      h('div', { class: 'stat panel' }, [
        h('div', { class: 'stat__head' }, [icon(c.icon, 14), h('span', {}, c.label)]),
        h('div', { class: 'stat__row' }, [value, c.unit ? h('span', { class: 'stat__unit mono' }, c.unit) : null]),
        extra,
      ]),
    );
    cards[c.key] = { ...c, value, extra, current: 0, raf: 0 };
  }

  /** Anima el número desde su valor actual hasta el nuevo con easing. */
  function countTo(card, to) {
    cancelAnimationFrame(card.raf);
    const from = card.current;
    const start = performance.now();
    const duration = 700;
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
      // Math.max evita que el redondeo pinte "-0" en algún frame
      const v = Math.max(0, from + (to - from) * eased);
      card.value.textContent = v.toLocaleString('es-ES', {
        minimumFractionDigits: card.decimals,
        maximumFractionDigits: card.decimals,
      });
      if (t < 1) card.raf = requestAnimationFrame(step);
    };
    card.current = to;
    card.raf = requestAnimationFrame(step);
  }

  return {
    update(stats) {
      countTo(cards.hops, stats.hops);
      countTo(cards.latency, stats.latency ?? 0);
      countTo(cards.distanceKm, stats.distanceKm);
      countTo(cards.countries, stats.countries.length);
      // Banderas de los países atravesados
      const flags = cards.countries.extra;
      if (flags.childElementCount !== stats.countries.length) {
        flags.replaceChildren(...stats.countries.map(flag));
      }
    },
    reset() {
      this.update({ hops: 0, latency: 0, distanceKm: 0, countries: [] });
    },
  };
}
