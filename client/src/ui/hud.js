import { fmtCoord } from './format.js';

const STATES = {
  idle: 'STANDBY',
  resolving: 'RESOLVING…',
  tracing: 'TRACING…',
  done: 'TRACE COMPLETE',
  error: 'FAULT',
};

/** Barra superior derecha (estado + reloj UTC) y telemetría inferior. */
export function createHud() {
  const status = document.getElementById('hud-status');
  const statusText = document.getElementById('hud-status-text');
  const clock = document.getElementById('hud-clock');
  const tm = {
    lat: document.getElementById('tm-lat'),
    lon: document.getElementById('tm-lon'),
    alt: document.getElementById('tm-alt'),
    origin: document.getElementById('tm-origin'),
    dest: document.getElementById('tm-dest'),
  };

  const tickClock = () => {
    clock.textContent = new Date().toISOString().slice(11, 19);
  };
  tickClock();
  setInterval(tickClock, 1000);

  // La cámara emite muchos eventos por segundo: se agrupan en un frame
  let pendingView = null;
  const flushView = () => {
    const { lat, lng, altitude } = pendingView;
    tm.lat.textContent = fmtCoord(lat, 'lat');
    tm.lon.textContent = fmtCoord(lng, 'lon');
    tm.alt.textContent = altitude.toFixed(2);
    pendingView = null;
  };

  return {
    setState(state, detail) {
      status.dataset.state = state;
      statusText.textContent = detail ? `${STATES[state]} ${detail}` : STATES[state];
    },
    setView(pov) {
      if (!pendingView) requestAnimationFrame(flushView);
      pendingView = pov;
    },
    setRoute(origin, dest) {
      tm.origin.textContent = origin ?? '—';
      tm.dest.textContent = dest ?? '—';
    },
  };
}
