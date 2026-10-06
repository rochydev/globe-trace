// Utilidades de red sin dependencias: se usan en cliente y servidor.

/** Convierte una IPv4 "a.b.c.d" en entero sin signo, o null si no es válida. */
export function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// Rangos IPv4 que nunca tendrán geolocalización útil
const PRIVATE_V4 = [
  ['10.0.0.0', 8], // RFC 1918
  ['172.16.0.0', 12], // RFC 1918
  ['192.168.0.0', 16], // RFC 1918
  ['100.64.0.0', 10], // CGNAT (RFC 6598), muy típico en fibra doméstica
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local / APIPA
  ['0.0.0.0', 8],
].map(([base, bits]) => [ipv4ToInt(base), bits]);

const inRange = (n, [base, bits]) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((n & mask) >>> 0) === ((base & mask) >>> 0);
};

/** True si la IP es privada, loopback, link-local o CGNAT (v4 o v6). */
export function isPrivateIp(ip) {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    return (
      v6 === '::1' ||
      v6.startsWith('fe80:') || // link-local
      /^f[cd][0-9a-f]{2}:/.test(v6) // ULA fc00::/7
    );
  }
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return PRIVATE_V4.some((r) => inRange(n, r));
}

// Rangos que tampoco son destinos válidos en Internet: multicast, reservados, broadcast
const RESERVED_V4 = [
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservado (incluye 255.255.255.255)
  ['192.0.0.0', 24], // asignaciones IETF
  ['192.0.2.0', 24], // TEST-NET-1 (documentación)
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
].map(([base, bits]) => [ipv4ToInt(base), bits]);

/**
 * True si la IP no debe usarse como destino de un trace: privadas, loopback,
 * multicast, documentación... Evita que alguien use el servidor para mapear
 * la red interna en la que está desplegado.
 */
export function isNonRoutableIp(ip) {
  if (isPrivateIp(ip)) return true;
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    return (
      v6 === '::' ||
      v6.startsWith('ff') || // multicast
      v6.startsWith('2001:db8:') || // documentación
      v6.startsWith('::ffff:') // IPv4 mapeada: se valida como IPv4, no por esta vía
    );
  }
  const n = ipv4ToInt(ip);
  return n === null || RESERVED_V4.some((r) => inRange(n, r));
}

const EARTH_RADIUS_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

/** Distancia de círculo máximo (fórmula del haversine) en km. */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
