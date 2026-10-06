import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { AppError } from './lib/errors.js';
import { createConcurrencyGuard } from './lib/concurrency.js';
import { runTraceroute } from './services/traceroute/index.js';
import { resolveTarget, reverseLookup } from './services/dns.js';
import { createGeoService } from './services/geo/index.js';
import { resolveOrigin } from './services/origin.js';
import traceRoutes from './routes/trace.js';

/**
 * Crea la aplicación sin ponerla a escuchar. Los servicios se pueden sustituir
 * (los tests inyectan un traceroute falso y no ejecutan nada real).
 */
export async function buildApp({ config, services = {}, logger = true }) {
  const app = Fastify({ logger, trustProxy: config.trustProxy });

  const geo =
    services.geo ?? (await createGeoService({ provider: config.geo.provider, dataDir: config.geo.dataDir, log: app.log }));

  const deps = {
    config,
    guard: createConcurrencyGuard(config.concurrency),
    services: { runTraceroute, resolveTarget, reverseLookup, ...services, geo },
    // Promesa: se calcula una vez al arrancar y las rutas la esperan (ya resuelta) en cada trace
    origin:
      services.origin ??
      resolveOrigin({ originEnv: config.geo.origin, useIpApi: geo.providers.includes('ip-api'), log: app.log }),
  };

  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    methods: ['GET'],
  });

  // global: false → el límite solo se aplica a las rutas que lo piden (el trace)
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, ctx) =>
      new AppError(429, 'RATE_LIMITED', `Demasiados traces: vuelve a intentarlo en ${Math.ceil(ctx.ttl / 1000)} s`),
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
  });

  // Todas las respuestas de error con la misma forma: { error: { code, message } }
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err.validation) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Petición no válida' } });
    }
    // Error inesperado: se registra completo, pero al cliente no se le dan detalles internos
    request.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
  });

  app.get('/api/health', async () => ({
    ok: true,
    activeTraces: deps.guard.active,
    geo: geo.providers,
  }));

  await app.register(traceRoutes, deps);
  return app;
}
