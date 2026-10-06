import { fileURLToPath } from 'node:url';

// Configuración por variables de entorno, con valores por defecto seguros.

const int = (name, fallback) => {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export function loadConfig() {
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: int('PORT', 8790),

    trace: {
      maxHops: Math.min(int('MAX_HOPS', 30), 64), // techo fijo aunque se configure más
      timeoutMs: int('TRACE_TIMEOUT_MS', 60_000),
      probeTimeoutMs: int('PROBE_TIMEOUT_MS', 1000),
      // Saltos seguidos sin respuesta tras los que se da el trace por terminado
      maxSilentHops: int('MAX_SILENT_HOPS', 5),
    },

    rateLimit: {
      max: int('RATE_LIMIT_MAX', 5), // traces por ventana y por IP
      timeWindow: int('RATE_LIMIT_WINDOW_MS', 60_000),
    },

    concurrency: {
      maxGlobal: int('MAX_CONCURRENT_TRACES', 4),
      maxPerClient: int('MAX_CONCURRENT_PER_IP', 1),
    },

    geo: {
      provider: process.env.GEO_PROVIDER ?? 'auto', // auto | maxmind | ipapi | none
      dataDir: process.env.GEO_DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url)),
      origin: process.env.ORIGIN ?? null, // "lat,lon,Ciudad,CC" del servidor
    },

    // Orígenes permitidos para CORS (p. ej. el frontend en GitHub Pages)
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),

    // Solo activar detrás de un proxy propio (nginx, Caddy...). Si no, cualquiera
    // podría inventarse la cabecera X-Forwarded-For y saltarse el rate limit.
    trustProxy: process.env.TRUST_PROXY === 'true',
  };
}
