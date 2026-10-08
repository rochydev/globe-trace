import './styles/main.css';
import { traceStats, isPlottable, validateTarget } from '@globe-trace/shared';
import { GlobeScene } from './globe/GlobeScene.js';
import { startDemoTrace, loadDemoIndex } from './stream/demoSource.js';
import { startLiveTrace, isBackendAvailable } from './stream/liveSource.js';
import { hydrateIcons } from './ui/dom.js';
import { createHud } from './ui/hud.js';
import { createSearchBar } from './ui/searchBar.js';
import { createHopList } from './ui/hopList.js';
import { createStatsPanel } from './ui/statsPanel.js';
import { createHopDetail } from './ui/hopDetail.js';
import { createIntroModal } from './ui/introModal.js';

// Estado de la aplicación: un único sitio donde viven los datos del trace actual
const state = {
  hops: [],
  selected: null,
  running: null, // { cancel } de la fuente activa
  mode: 'demo', // 'live' si hay backend, 'demo' si no
};

// Destinos que no están detrás de una CDN: el paquete viaja de verdad hasta allí
const LIVE_SUGGESTIONS = ['github.com', 'www.u-tokyo.ac.jp', 'www.usp.br', 'www.anu.edu.au'];

hydrateIcons();

const hud = createHud();
const stats = createStatsPanel();
const detail = createHopDetail({ onClose: () => select(null) });
const hopList = createHopList({ onSelect: (n) => select(n, { fly: true }) });
const globe = new GlobeScene(document.getElementById('globe'), {
  onHopClick: (n) => select(n, { fly: true }),
  onView: (pov) => hud.setView(pov),
});
// Solo en desarrollo: acceso a la escena desde la consola para depurar
if (import.meta.env.DEV) window.__globe = globe;

const search = createSearchBar({ suggestions: [], onSubmit: runTrace });
// Destinos de los traces grabados (public/demo/index.json)
const DEMO_TARGETS = (await loadDemoIndex()).map((e) => e.target);
const modeTag = document.getElementById('mode-tag');

stats.reset();

const params = new URLSearchParams(location.search);
// ?t=destino: enlace directo que lanza el trace al entrar (para compartir o grabar)
const autoTarget = params.get('t');

// Al cerrar la bienvenida, el foco pasa al buscador para poder escribir directamente
const intro = createIntroModal({ onClose: () => document.getElementById('target').focus() });
if (!autoTarget) intro.open();

// Modo real si responde el backend; ?demo en la URL fuerza los traces grabados
// (útil para grabar el vídeo o para GitHub Pages, donde no hay servidor)
// VITE_DEMO_ONLY se activa al compilar para GitHub Pages: allí no hay servidor,
// así que ni siquiera se intenta conectar y los textos explican que es una demo
const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === 'true';
const forceDemo = DEMO_ONLY || params.has('demo');

if (DEMO_ONLY) {
  document.getElementById('intro-note-text').textContent =
    'Demo pública: se reproducen traces reales grabados desde un servidor en Barcelona. Para trazar cualquier destino, ejecuta el proyecto en local.';
}

function setMode(mode) {
  state.mode = mode;
  const live = mode === 'live';
  modeTag.textContent = live ? 'LIVE' : 'DEMO';
  modeTag.classList.toggle('brand__tag--live', live);
  modeTag.title = live
    ? 'Traces reales lanzados desde el servidor'
    : 'Sin servidor: se reproducen traces grabados';
  search.setSuggestions(live ? LIVE_SUGGESTIONS : DEMO_TARGETS);
}

setMode(!forceDemo && (await isBackendAvailable()) ? 'live' : 'demo');

if (autoTarget) {
  document.getElementById('target').value = autoTarget;
  runTrace(autoTarget);
}

async function runTrace(target) {
  // Si se abrió la web antes de arrancar el backend, se vuelve a comprobar al lanzar:
  // así no hace falta recargar la página para pasar a modo real
  if (state.mode === 'demo' && !forceDemo && (await isBackendAvailable())) setMode('live');

  // Validación en el cliente: la misma lista blanca que usa el servidor (de shared).
  // Solo mejora la experiencia; la que protege de verdad es la del servidor.
  const valid = validateTarget(target);
  if (!valid.ok) {
    search.showError(valid.reason);
    return;
  }

  state.running?.cancel();
  state.hops = [];
  select(null);
  search.setBusy(true);
  hud.setState('resolving');

  const start = state.mode === 'live' ? startLiveTrace : startDemoTrace;
  state.running = start(valid.value, {
    onStart({ target: name, resolvedIp, origin }) {
      hopList.reset(`${name} → ${resolvedIp}`);
      stats.reset();
      globe.reset(origin);
      // Sin origen conocido, el recorrido empieza a dibujarse en el primer salto geolocalizado
      hud.setRoute(origin?.city ?? 'servidor', name);
      hud.setState('tracing');
    },
    onHop(hop) {
      state.hops.push(hop);
      hopList.add(hop);
      stats.update(traceStats(state.hops));
      hud.setState('tracing', `HOP ${String(hop.hop).padStart(2, '0')}`);
      if (isPlottable(hop)) globe.addHop(hop);
    },
    onDone({ reached } = {}) {
      // Muchos destinos no responden a las sondas: el trace acaba, pero sin llegar
      hud.setState('done', reached === false ? '· NO REPLY' : '');
      search.setBusy(false);
      setTimeout(() => state.selected === null && globe.overview(), 900);
    },
    onError(err) {
      hud.setState('error');
      search.setBusy(false);
      search.showError(err.message);
    },
  });
}

/** Selecciona un salto (desde la lista o desde el globo) y sincroniza las tres vistas. */
function select(hopNumber, { fly = false } = {}) {
  state.selected = hopNumber;
  globe.select(hopNumber);
  hopList.select(hopNumber);
  const hop = state.hops.find((h) => h.hop === hopNumber);
  if (hop?.geo) {
    detail.show(hop);
    // A una ubicación que se sabe falsa no se vuela: se ve el aviso en el detalle
    if (fly && isPlottable(hop)) globe.flyTo(hop);
  } else {
    detail.hide();
  }
}
