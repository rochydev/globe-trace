import { describe, it, expect } from 'vitest';
import { hintFromHostname, isPhysicallyPossible, refineLocation } from '../src/services/geo/hints.js';

const BCN = { lat: 41.3874, lon: 2.1686 };
const BERLIN_DB = { city: 'Berlín', country: 'Alemania', countryCode: 'DE', lat: 52.52, lon: 13.4, isp: 'Inter.link GmbH', asn: 5405 };

describe('hintFromHostname', () => {
  it.each([
    ['r2-par1-fr.as5405.net', 'París'],
    ['r3-fra2-de.as5405.net', 'Fráncfort'],
    ['ae-4.r30.tokyjp05.jp.bb.gin.ntt.net', 'Tokio'],
    ['ldn-bb2-link.ip.twelve99.net', 'Londres'],
    ['be2-sjo-b23.cogentco.com', 'San José'],
    ['ae-8.r23.sngpsi07.sg.bb.gin.ntt.net', null], // "sngpsi" no es "sngp"+"sg": mejor no adivinar
  ])('%s → %s', (host, city) => {
    expect(hintFromHostname(host)?.city ?? null).toBe(city);
  });

  it('no inventa ubicaciones en hostnames residenciales', () => {
    expect(hintFromHostname('189.red-81-41-231.staticip.rima-tde.net')).toBeNull();
    expect(hintFromHostname('lb-140-82-121-4-fra.github.com')?.city).toBe('Fráncfort');
  });

  it('descarta la pista si el país del hostname no coincide', () => {
    expect(hintFromHostname('par1-de.example.net')).toBeNull();
  });
});

describe('isPhysicallyPossible', () => {
  it('Barcelona → Fráncfort (~1100 km) es posible con 38 ms', () => {
    expect(isPhysicallyPossible(BCN, { lat: 50.11, lon: 8.68 }, [38, 37, 38])).toBe(true);
  });

  it('Barcelona → Tokio (~10 400 km) es imposible con 20 ms', () => {
    expect(isPhysicallyPossible(BCN, { lat: 35.68, lon: 139.65 }, [20, null, 21])).toBe(false);
  });

  it('sin origen o sin RTT no se puede comprobar', () => {
    expect(isPhysicallyPossible(null, { lat: 0, lon: 0 }, [1])).toBe(true);
    expect(isPhysicallyPossible(BCN, { lat: 0, lon: 0 }, [null])).toBe(true);
  });
});

describe('refineLocation', () => {
  it('corrige la sede del operador con la ciudad del hostname, conservando ISP y ASN', () => {
    const geo = refineLocation({ dbGeo: BERLIN_DB, hostname: 'r2-par1-fr.as5405.net', rtts: [38], origin: BCN });
    expect(geo).toMatchObject({ city: 'París', country: 'Francia', countryCode: 'FR', isp: 'Inter.link GmbH', asn: 5405, source: 'hostname' });
  });

  it('ignora una pista físicamente imposible', () => {
    const geo = refineLocation({ dbGeo: BERLIN_DB, hostname: 'xe-0.tyo1.example.net', rtts: [30], origin: BCN });
    expect(geo.source).toBe('db');
  });

  it('marca como no plausible una ubicación de la base de datos que viola la latencia', () => {
    const tokyo = { ...BERLIN_DB, city: 'Tokio', lat: 35.68, lon: 139.65 };
    expect(refineLocation({ dbGeo: tokyo, hostname: null, rtts: [12], origin: BCN }).plausible).toBe(false);
  });
});
