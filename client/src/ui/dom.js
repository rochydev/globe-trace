import {
  createElement,
  Radar,
  Send,
  Route,
  Activity,
  Timer,
  Ruler,
  Globe2,
  Server,
  ShieldOff,
  CircleSlash,
  MapPinOff,
  MapPin,
  Network,
  X,
  Crosshair,
  Info,
  Keyboard,
  SquareTerminal,
  Earth,
  ArrowRight,
  ArrowUpRight,
  TriangleAlert,
} from 'lucide';

// Solo se importan los iconos usados: así el bundle no incluye los ~1500 de Lucide
const ICONS = {
  Radar, Send, Route, Activity, Timer, Ruler, Globe2, Server,
  ShieldOff, CircleSlash, MapPinOff, MapPin, Network, X, Crosshair,
  Info, Keyboard, SquareTerminal, Earth, ArrowRight, ArrowUpRight, TriangleAlert,
};

/** Devuelve un <svg> de Lucide listo para insertar. */
export function icon(name, size = 16) {
  const svg = createElement(ICONS[name]);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/** Sustituye los <span data-icon="Nombre"> del HTML estático por su icono. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.replaceChildren(icon(el.dataset.icon, Number(el.dataset.size) || 16));
    el.classList.add('icon');
  });
}

/** Mini helper para crear elementos: h('div', { class: 'x' }, [hijos]). */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Bandera del país (imagen de flagcdn: Windows no pinta los emojis de bandera). */
export function flag(countryCode) {
  if (!countryCode) return null;
  const cc = countryCode.toLowerCase();
  return h('img', {
    class: 'flag',
    src: `https://flagcdn.com/w40/${cc}.png`,
    alt: countryCode,
    width: 18,
    height: 13,
  });
}
