/**
 * Ubicación del servidor: el punto desde el que sale el trace (el primer arco).
 *
 * 1. Variable ORIGIN="lat,lon,Ciudad,CC" → lo más fiable, recomendado en producción.
 * 2. Si se usa ip-api, se le pregunta por la IP pública del propio servidor.
 * 3. Si no, null: el frontend empieza a dibujar desde el primer salto geolocalizado.
 *
 * @returns {Promise<{ lat: number, lon: number, city: string|null, countryCode: string|null } | null>}
 */
export async function resolveOrigin({ originEnv, useIpApi, log, fetch: doFetch = fetch }) {
  if (originEnv) {
    const [lat, lon, city = null, countryCode = null] = originEnv.split(',').map((s) => s.trim());
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
      return { lat: Number(lat), lon: Number(lon), city, countryCode };
    }
    log?.warn('ORIGIN mal formado: se esperaba "lat,lon,Ciudad,CC"');
  }

  if (useIpApi) {
    try {
      const res = await doFetch('http://ip-api.com/json/?fields=status,city,countryCode,lat,lon&lang=es', {
        signal: AbortSignal.timeout(3000),
      });
      const d = await res.json();
      if (d.status === 'success') {
        return { lat: d.lat, lon: d.lon, city: d.city || null, countryCode: d.countryCode || null };
      }
    } catch {
      // Sin red al arrancar: se sigue sin origen
    }
  }
  return null;
}
