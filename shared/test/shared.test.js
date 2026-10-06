import { describe, it, expect } from 'vitest';
import { isPrivateIp, ipv4ToInt, haversineKm, makeHop, traceStats, latencyHue } from '../src/index.js';

describe('isPrivateIp', () => {
  it.each(['192.168.1.1', '10.20.0.1', '172.16.5.4', '172.31.255.255', '100.64.0.1', '127.0.0.1', 'fe80::1', 'fd12:3456::1'])(
    '%s es privada',
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '2001:4860:4860::8888'])('%s es pública', (ip) =>
    expect(isPrivateIp(ip)).toBe(false),
  );
});

describe('ipv4ToInt', () => {
  it('rechaza octetos fuera de rango', () => expect(ipv4ToInt('1.2.3.256')).toBeNull());
  it('convierte correctamente', () => expect(ipv4ToInt('1.0.0.1')).toBe(16777217));
});

describe('haversineKm', () => {
  it('Madrid → Nueva York ronda los 5770 km', () => {
    const km = haversineKm({ lat: 40.4168, lon: -3.7038 }, { lat: 40.7128, lon: -74.006 });
    expect(km).toBeGreaterThan(5700);
    expect(km).toBeLessThan(5850);
  });
});

describe('makeHop', () => {
  it('marca timeout cuando no hay IP', () => {
    expect(makeHop({ hop: 4, rtts: [null, null, null] })).toMatchObject({ status: 'timeout', latency: null });
  });
  it('promedia solo las sondas válidas', () => {
    expect(makeHop({ hop: 1, ip: '192.168.1.1', rtts: [1, null, 3] })).toMatchObject({ status: 'private', latency: 2 });
  });
  it('IP pública sin geo es nogeo', () => {
    expect(makeHop({ hop: 5, ip: '8.8.8.8', rtts: [9] }).status).toBe('nogeo');
  });
});

describe('traceStats', () => {
  const geo = (lat, lon, countryCode) => ({ lat, lon, countryCode });
  const hops = [
    makeHop({ hop: 1, ip: '192.168.1.1', rtts: [1] }),
    makeHop({ hop: 2, ip: '1.1.1.1', rtts: [10], geo: geo(40.4, -3.7, 'ES') }),
    makeHop({ hop: 3, ip: '2.2.2.2', rtts: [30], geo: geo(48.85, 2.35, 'FR') }),
    makeHop({ hop: 4, rtts: [null, null, null] }),
  ];
  it('usa el último salto que respondió como latencia total', () => {
    const s = traceStats(hops);
    expect(s.latency).toBe(30);
    expect(s.hops).toBe(4);
    expect(s.countries).toEqual(['ES', 'FR']);
    expect(s.distanceKm).toBeGreaterThan(1000);
  });
});

describe('latencyHue', () => {
  it('va de verde a rojo', () => {
    expect(latencyHue(0)).toBe(140);
    expect(latencyHue(1000)).toBe(0);
    expect(latencyHue(null)).toBeNull();
  });
});
