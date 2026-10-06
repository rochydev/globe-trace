import { existsSync } from 'node:fs';
import { join } from 'node:path';
import maxmind from 'maxmind';

/**
 * Proveedor local: bases de datos GeoLite2 (.mmdb) leídas desde disco.
 * El formato MMDB es un árbol binario por bits de la IP: una consulta son unas
 * pocas lecturas en memoria, sin red. Por eso es instantáneo.
 *
 * @returns {Promise<{ name: string, lookup(ip: string): object|null } | null>}
 *          null si no están los archivos
 */
export async function openMaxmind(dataDir) {
  const cityPath = join(dataDir, 'GeoLite2-City.mmdb');
  const asnPath = join(dataDir, 'GeoLite2-ASN.mmdb');
  if (!existsSync(cityPath)) return null;

  const city = await maxmind.open(cityPath);
  const asn = existsSync(asnPath) ? await maxmind.open(asnPath) : null;

  return {
    name: 'maxmind',
    lookup(ip) {
      const c = city.get(ip);
      if (!c?.location) return null;
      const a = asn?.get(ip);
      return fromMaxmind(c, a);
    },
  };
}

/** Pasa un registro GeoIP2 al formato GeoInfo común. Exportado para testearlo. */
export function fromMaxmind(c, a) {
  const name = (n) => n?.names?.es ?? n?.names?.en ?? null;
  return {
    city: name(c.city),
    country: name(c.country),
    countryCode: c.country?.iso_code ?? null,
    lat: c.location.latitude,
    lon: c.location.longitude,
    // Radio de incertidumbre: si es enorme, la IP solo está ubicada a nivel de país
    accuracyKm: c.location.accuracy_radius ?? null,
    isp: a?.autonomous_system_organization ?? null,
    asn: a?.autonomous_system_number ?? null,
  };
}
