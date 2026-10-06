import { isPrivateIp } from '@globe-trace/shared';
import { openMaxmind } from './maxmind.js';
import { createIpApi } from './ipApi.js';
import { createTtlCache } from './cache.js';

/**
 * Servicio de geolocalización con proveedores encadenados.
 *
 *   GEO_PROVIDER=auto     MaxMind si están los .mmdb; si no, ip-api
 *   GEO_PROVIDER=maxmind  solo local (ningún dato sale del servidor)
 *   GEO_PROVIDER=ipapi    solo ip-api
 *   GEO_PROVIDER=none     sin geolocalización
 *
 * En modo auto, si MaxMind no conoce una IP se pregunta también a ip-api.
 */
export async function createGeoService({ provider = 'auto', dataDir, log, providers } = {}) {
  let chain = providers;

  if (!chain) {
    chain = [];
    if (provider === 'auto' || provider === 'maxmind') {
      const mm = await openMaxmind(dataDir);
      if (mm) chain.push(mm);
      else if (provider === 'maxmind') throw new Error(`No hay bases GeoLite2 en ${dataDir}`);
    }
    if (provider === 'ipapi' || (provider === 'auto' && chain.length === 0)) {
      chain.push(createIpApi());
      log?.warn('Geolocalización con ip-api.com: las IPs de los saltos se envían a un tercero');
    }
  }

  const cache = createTtlCache();
  const names = chain.map((p) => p.name);
  log?.info(`Proveedores de geolocalización: ${names.join(' → ') || 'ninguno'}`);

  return {
    providers: names,

    /** GeoInfo de una IP, o null. Nunca lanza: un fallo de geo no debe romper el trace. */
    async lookup(ip) {
      if (!ip || isPrivateIp(ip)) return null;
      const cached = cache.get(ip);
      if (cached !== undefined) return cached;

      let geo = null;
      for (const p of chain) {
        try {
          geo = await p.lookup(ip);
        } catch (err) {
          log?.warn({ err, provider: p.name }, 'Fallo de geolocalización');
        }
        if (geo) break;
      }
      // Solo se guardan aciertos: un null puede deberse a un timeout o a que ip-api
      // estaba limitando, y no debe quedarse "sin ubicación" durante 24 horas
      if (geo) cache.set(ip, geo);
      return geo;
    },
  };
}
