import { makeHop } from '@globe-trace/shared';

const DEMO_BASE = `${import.meta.env.BASE_URL}demo/`;
let indexPromise = null;

/**
 * Índice de traces grabados (public/demo/index.json). Son traces REALES grabados
 * con `npm run demo:record -w server`, no datos inventados.
 * @returns {Promise<{ target: string, file: string, hops: number, recordedAt: string }[]>}
 */
export function loadDemoIndex() {
  indexPromise ??= fetch(`${DEMO_BASE}index.json`)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return indexPromise;
}

/**
 * Reproduce un trace grabado con el mismo ritmo que uno real: cada salto llega
 * tras un retardo, y los "* * *" tardan más (el traceroute espera su timeout).
 *
 * Interfaz común a todas las fuentes de trace:
 *   startTrace(target, { onStart, onHop, onDone, onError }) → { cancel() }
 */
export function startDemoTrace(target, handlers, { speed = 1 } = {}) {
  let cancelled = false;
  const timers = [];
  const wait = (ms) => new Promise((resolve) => timers.push(setTimeout(resolve, ms / speed)));

  (async () => {
    try {
      const index = await loadDemoIndex();
      const entry = index.find((e) => e.target === target);
      if (!entry) {
        const list = index.map((e) => e.target).join(', ');
        throw new Error(
          import.meta.env.VITE_DEMO_ONLY === 'true'
            ? `Esta demo pública reproduce traces reales grabados: prueba con ${list}. ` +
                'Para trazar cualquier destino, ejecuta el proyecto en local (instrucciones en GitHub).'
            : `Modo demo (no hay servidor conectado): solo se pueden reproducir los traces grabados de ${list}. ` +
                'Arranca el backend con "npm run dev:server" para trazar cualquier destino.',
        );
      }
      const res = await fetch(DEMO_BASE + entry.file);
      if (!res.ok) throw new Error(`No se pudo cargar el trace de demo (${res.status})`);
      const trace = await res.json();
      if (cancelled) return;

      handlers.onStart?.({
        target: trace.target,
        resolvedIp: trace.resolvedIp,
        origin: trace.origin,
        demo: true,
      });

      await wait(700);
      for (const raw of trace.hops) {
        if (cancelled) return;
        const timeout = raw.ip === null;
        await wait(timeout ? 1500 : 380 + Math.min(raw.rtts[0] ?? 0, 300) * 1.6);
        if (cancelled) return;
        handlers.onHop?.(makeHop(raw));
      }
      if (!cancelled) handlers.onDone?.({ reached: trace.reached });
    } catch (err) {
      if (!cancelled) handlers.onError?.(err);
    }
  })();

  return {
    cancel() {
      cancelled = true;
      timers.forEach(clearTimeout);
    },
  };
}
