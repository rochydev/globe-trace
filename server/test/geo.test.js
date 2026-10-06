import { describe, it, expect, vi } from 'vitest';
import { createGeoService } from '../src/services/geo/index.js';
import { createIpApi, fromIpApi } from '../src/services/geo/ipApi.js';
import { fromMaxmind } from '../src/services/geo/maxmind.js';

describe('fromMaxmind', () => {
  it('prefiere los nombres en castellano y añade el ASN', () => {
    const geo = fromMaxmind(
      {
        city: { names: { en: 'Frankfurt am Main', es: 'Fráncfort' } },
        country: { iso_code: 'DE', names: { en: 'Germany', es: 'Alemania' } },
        location: { latitude: 50.11, longitude: 8.68, accuracy_radius: 20 },
      },
      { autonomous_system_number: 36459, autonomous_system_organization: 'GITHUB' },
    );
    expect(geo).toEqual({
      city: 'Fráncfort',
      country: 'Alemania',
      countryCode: 'DE',
      lat: 50.11,
      lon: 8.68,
      accuracyKm: 20,
      isp: 'GITHUB',
      asn: 36459,
    });
  });
});

describe('ip-api', () => {
  it('extrae el número de AS', () => {
    expect(fromIpApi({ as: 'AS3352 Telefonica De Espana', lat: 1, lon: 2 }).asn).toBe(3352);
  });

  const response = (body, headers = {}, status = 200) => ({
    ok: status === 200,
    status,
    headers: new Headers(headers),
    json: async () => body,
  });

  it('deja de llamar cuando la cabecera X-Rl indica que no quedan peticiones', async () => {
    const fetch = vi.fn(async () =>
      response({ status: 'success', city: 'Madrid', lat: 40, lon: -3, as: 'AS1' }, { 'x-rl': '0', 'x-ttl': '30' }),
    );
    const api = createIpApi({ fetch });
    expect((await api.lookup('8.8.8.8')).city).toBe('Madrid');
    expect(await api.lookup('8.8.4.4')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('devuelve null si la red falla, sin lanzar', async () => {
    const api = createIpApi({ fetch: async () => Promise.reject(new Error('ECONNRESET')) });
    expect(await api.lookup('8.8.8.8')).toBeNull();
  });
});

describe('createGeoService', () => {
  const hit = { city: 'X', lat: 0, lon: 0 };

  it('no consulta IPs privadas', async () => {
    const lookup = vi.fn();
    const geo = await createGeoService({ providers: [{ name: 'a', lookup }] });
    expect(await geo.lookup('192.168.1.1')).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('pasa al siguiente proveedor si el primero no conoce la IP', async () => {
    const geo = await createGeoService({
      providers: [
        { name: 'local', lookup: () => null },
        { name: 'remoto', lookup: async () => hit },
      ],
    });
    expect(await geo.lookup('8.8.8.8')).toBe(hit);
  });

  it('cachea los aciertos pero no los fallos', async () => {
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(hit);
    const geo = await createGeoService({ providers: [{ name: 'a', lookup }] });
    expect(await geo.lookup('8.8.8.8')).toBeNull();
    expect(await geo.lookup('8.8.8.8')).toBe(hit);
    expect(await geo.lookup('8.8.8.8')).toBe(hit);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
