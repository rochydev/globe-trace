import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { resolveTarget } from '../src/services/dns.js';

const config = {
  trustProxy: false,
  corsOrigins: [],
  trace: { maxHops: 30, timeoutMs: 5000, probeTimeoutMs: 500 },
  rateLimit: { max: 10, timeWindow: 60_000 },
  concurrency: { maxGlobal: 4, maxPerClient: 1 },
  geo: { provider: 'none', dataDir: '', origin: null },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function services(overrides = {}) {
  return {
    resolveTarget: (t) => resolveTarget(t, { lookup: async () => [{ address: '1.1.1.1', family: 4 }] }),
    reverseLookup: async () => null,
    origin: Promise.resolve(null),
    // La geo del salto 1 tarda más que la del 2: el orden de salida debe respetarse igual
    geo: {
      providers: ['fake'],
      lookup: async (ip) => {
        await wait(ip === '9.9.9.1' ? 60 : 5);
        return { city: ip, countryCode: 'XX', lat: 0, lon: 0, isp: null, asn: null };
      },
    },
    runTraceroute: async function* () {
      yield { hop: 1, ip: '9.9.9.1', rtts: [1] };
      yield { hop: 2, ip: '1.1.1.1', rtts: [2] };
    },
    ...overrides,
  };
}

/** Convierte el cuerpo SSE en una lista de { event, data }. */
function parseSse(body) {
  return body
    .split('\n\n')
    .filter((block) => block.startsWith('event:'))
    .map((block) => {
      const [ev, data] = block.split('\n');
      return { event: ev.slice(7), data: JSON.parse(data.slice(6)) };
    });
}

const stream = (app, target = '1.1.1.1') =>
  app.inject({ method: 'GET', url: '/api/trace/stream', query: { target } });

describe('GET /api/trace/stream', () => {
  it('emite start → hop → hop → done con cabeceras SSE', async () => {
    const app = await buildApp({ config, services: services(), logger: false });
    const res = await stream(app);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSse(res.body);
    expect(events.map((e) => e.event)).toEqual(['start', 'hop', 'hop', 'done']);
    expect(events[0].data).toMatchObject({ target: '1.1.1.1', resolvedIp: '1.1.1.1' });
    expect(events[3].data.reached).toBe(true);
  });

  it('respeta el orden de los saltos aunque se geolocalicen en otro orden', async () => {
    const app = await buildApp({ config, services: services(), logger: false });
    const hops = parseSse((await stream(app)).body).filter((e) => e.event === 'hop');
    expect(hops.map((e) => e.data.hop)).toEqual([1, 2]);
    expect(hops[0].data.status).toBe('ok');
  });

  it('los errores de validación siguen siendo HTTP normales (antes de abrir el stream)', async () => {
    const app = await buildApp({ config, services: services(), logger: false });
    const res = await stream(app, 'a;b');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_TARGET');
  });

  it('un fallo a mitad de trace llega como evento error, tras los saltos ya recibidos', async () => {
    const app = await buildApp({
      config,
      logger: false,
      services: services({
        runTraceroute: async function* () {
          yield { hop: 1, ip: '9.9.9.1', rtts: [1] };
          const err = new Error('timeout');
          throw Object.assign(err, { statusCode: 504, code: 'X' });
        },
      }),
    });
    const events = parseSse((await stream(app)).body);
    expect(events.map((e) => e.event)).toEqual(['start', 'hop', 'error']);
    // Un error inesperado no filtra detalles internos al cliente
    expect(events[2].data.code).toBe('INTERNAL');
  });
});
