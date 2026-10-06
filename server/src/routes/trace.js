import { validateTarget, makeHop } from '@globe-trace/shared';
import { AppError } from '../lib/errors.js';
import { openSse } from '../lib/sse.js';
import { refineLocation } from '../services/geo/hints.js';

const querySchema = {
  querystring: {
    type: 'object',
    required: ['target'],
    properties: { target: { type: 'string', minLength: 1, maxLength: 260 } },
    additionalProperties: false,
  },
};

export default async function traceRoutes(app, { config, services, guard, origin }) {
  /**
   * Todo lo que puede fallar ANTES de lanzar el proceso. Se hace antes de abrir el
   * stream para poder responder con un código HTTP normal (400, 403, 429...).
   */
  async function prepare(request) {
    // Lista blanca de dominio / IPv4 / IPv6 (el esquema ya filtró tipo y longitud)
    const target = validateTarget(request.query.target);
    if (!target.ok) throw new AppError(400, 'INVALID_TARGET', target.reason);

    // Cuántos traces puede haber vivos a la vez
    const release = guard.acquire(request.ip);
    if (!release) {
      throw new AppError(429, 'TOO_MANY_TRACES', 'Ya hay un trace en curso: espera a que termine');
    }
    try {
      const { ip, family } = await services.resolveTarget(target);
      return { target, ip, family, release };
    } catch (err) {
      release();
      throw err;
    }
  }

  /** Añade hostname (PTR) y geolocalización. Nunca lanza: ambos servicios devuelven null si fallan. */
  async function enrich(raw) {
    if (!raw.ip) return makeHop(raw);
    const [hostname, dbGeo, originGeo] = await Promise.all([
      services.reverseLookup(raw.ip),
      services.geo.lookup(raw.ip),
      origin,
    ]);
    const geo = refineLocation({ dbGeo, hostname, rtts: raw.rtts, origin: originGeo });
    return makeHop({ ...raw, hostname, geo });
  }

  /**
   * Ejecuta el trace y llama a onHop con cada salto enriquecido, EN ORDEN.
   *
   * El enriquecimiento de cada salto empieza en cuanto llega, en paralelo con el
   * resto del trace. Pero el salto 5 puede tardar más en geolocalizarse que el 6,
   * así que los envíos se encadenan en una promesa: cada uno espera al anterior.
   */
  async function run({ ip, family, signal }, onHop) {
    let chain = Promise.resolve();
    try {
      for await (const raw of services.runTraceroute({ ip, family, ...config.trace, signal })) {
        const enriched = enrich(raw);
        chain = chain.then(() => enriched).then(onHop);
      }
    } finally {
      // Si el trace falla a mitad (timeout), los saltos ya recibidos se envían igualmente
      await chain;
    }
  }

  /** Aborta el trace si el cliente cierra la conexión antes de terminar. */
  function abortOnClose(reply) {
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort();
    });
    return abort.signal;
  }

  const routeOpts = { schema: querySchema, config: { rateLimit: config.rateLimit } };

  // GET /api/trace — respuesta JSON única al terminar (útil para scripts y tests)
  app.get('/api/trace', routeOpts, async (request, reply) => {
    const { target, ip, family, release } = await prepare(request);
    const startedAt = Date.now();
    try {
      const hops = [];
      await run({ ip, family, signal: abortOnClose(reply) }, (h) => hops.push(h));
      return {
        target: target.value,
        resolvedIp: ip,
        origin: await origin,
        reached: hops.at(-1)?.ip === ip,
        durationMs: Date.now() - startedAt,
        hops,
      };
    } finally {
      release();
    }
  });

  // GET /api/trace/stream — Server-Sent Events: un evento por salto en cuanto existe
  app.get('/api/trace/stream', routeOpts, async (request, reply) => {
    const { target, ip, family, release } = await prepare(request);
    const signal = abortOnClose(reply);
    const sse = openSse(reply);
    const startedAt = Date.now();

    try {
      sse.send('start', {
        target: target.value,
        resolvedIp: ip,
        origin: await origin,
        maxHops: config.trace.maxHops,
        geoProviders: services.geo.providers,
      });

      let last = null;
      await run({ ip, family, signal }, (hop) => {
        last = hop;
        sse.send('hop', hop);
      });

      sse.send('done', { reached: last?.ip === ip, durationMs: Date.now() - startedAt });
    } catch (err) {
      // Con el stream ya abierto no se puede cambiar el código HTTP: el error viaja como evento
      if (!signal.aborted) {
        if (!(err instanceof AppError)) request.log.error(err);
        sse.send('error', {
          code: err instanceof AppError ? err.code : 'INTERNAL',
          message: err instanceof AppError ? err.message : 'Error interno durante el trace',
        });
      }
    } finally {
      release();
      sse.close();
    }
  });
}
