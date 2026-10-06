import { createSseParser } from './sseParser.js';

// En desarrollo, Vite redirige /api al backend. En producción se puede apuntar
// a otro servidor con VITE_API_URL (p. ej. frontend en GitHub Pages + API aparte).
const API = import.meta.env.VITE_API_URL ?? '';

/** ¿Hay backend disponible? Se usa al arrancar para elegir modo real o demo. */
export async function isBackendAvailable() {
  try {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Trace real por SSE. Misma interfaz que la fuente de demo:
 *   startLiveTrace(target, { onStart, onHop, onDone, onError }) → { cancel() }
 *
 * Se usa fetch() leyendo el cuerpo como stream en vez de EventSource porque:
 *  - EventSource no deja leer el código ni el cuerpo de una respuesta de error
 *    (un 429 o un 403 llegarían como un "error" genérico sin mensaje);
 *  - EventSource se reconecta solo al cerrarse la conexión, y aquí eso
 *    significaría lanzar otro trace sin que nadie lo pida;
 *  - con fetch, cancelar es tan simple como AbortController.abort().
 */
export function startLiveTrace(target, handlers) {
  const abort = new AbortController();
  let finished = false;

  const finish = (fn, arg) => {
    if (finished) return;
    finished = true;
    fn?.(arg);
  };

  (async () => {
    const url = `${API}/api/trace/stream?target=${encodeURIComponent(target)}`;
    const res = await fetch(url, { signal: abort.signal, headers: { Accept: 'text/event-stream' } });

    // Errores antes de abrir el stream: llegan como JSON con código HTTP
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? `Error ${res.status}`);
    }

    const parse = createSseParser((event, data) => {
      const payload = JSON.parse(data);
      if (event === 'start') handlers.onStart?.(payload);
      else if (event === 'hop') handlers.onHop?.(payload);
      else if (event === 'done') finish(handlers.onDone, payload);
      else if (event === 'error') finish(handlers.onError, new Error(payload.message));
    });

    // TextDecoderStream convierte los bytes en texto respetando los caracteres UTF-8
    // que queden partidos entre dos trozos (la "á" de "París" ocupa dos bytes)
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parse(value);
    }

    // El servidor cerró sin "done" ni "error": la conexión se cortó a mitad
    finish(handlers.onError, new Error('Se perdió la conexión con el servidor'));
  })().catch((err) => {
    if (abort.signal.aborted) return; // cancelado a propósito: no es un error
    const msg = err instanceof TypeError ? 'No se pudo conectar con el servidor' : err.message;
    finish(handlers.onError, new Error(msg));
  });

  return {
    cancel() {
      finished = true;
      abort.abort();
    },
  };
}
