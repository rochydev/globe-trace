// Proveedor remoto: ip-api.com (gratis, sin clave, uso no comercial).
// Su plan gratuito solo funciona por HTTP (no HTTPS) y admite 45 peticiones por minuto.

const FIELDS = 'status,country,countryCode,city,lat,lon,isp,as';
const TIMEOUT_MS = 2500;

/**
 * @param {{ fetch?: typeof fetch }} opts  fetch inyectable para los tests
 */
export function createIpApi({ fetch: doFetch = fetch } = {}) {
  // ip-api informa en cada respuesta de cuántas peticiones quedan (X-Rl) y de cuándo
  // se reinicia la ventana (X-Ttl). Si se agotan, se deja de llamar hasta entonces:
  // insistir con 429 hace que te bloqueen la IP durante una hora.
  let blockedUntil = 0;

  return {
    name: 'ip-api',
    async lookup(ip) {
      if (Date.now() < blockedUntil) return null;

      let res;
      try {
        res = await doFetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${FIELDS}&lang=es`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        return null; // timeout o sin red: el salto queda sin geolocalizar, el trace sigue
      }

      const remaining = Number(res.headers.get('x-rl'));
      const resetIn = Number(res.headers.get('x-ttl'));
      if (res.status === 429 || remaining === 0) {
        blockedUntil = Date.now() + (Number.isFinite(resetIn) ? resetIn : 60) * 1000;
      }
      if (!res.ok) return null;

      const d = await res.json();
      return d.status === 'success' ? fromIpApi(d) : null;
    },
  };
}

/** "AS3352 Telefonica De Espana" → 3352 */
export function fromIpApi(d) {
  const asn = /^AS(\d+)/.exec(d.as ?? '');
  return {
    city: d.city || null,
    country: d.country || null,
    countryCode: d.countryCode || null,
    lat: d.lat,
    lon: d.lon,
    accuracyKm: null, // ip-api no da radio de precisión
    isp: d.isp || null,
    asn: asn ? Number(asn[1]) : null,
  };
}
