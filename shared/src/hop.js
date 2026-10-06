// Formato común de un salto. Lo usan el backend (al emitir) y el frontend (al pintar),
// así ambos lados hablan exactamente el mismo idioma.
import { isPrivateIp } from './net.js';

/**
 * @typedef {Object} GeoInfo
 * @property {string|null} city
 * @property {string|null} country      Nombre del país
 * @property {string|null} countryCode  ISO 3166-1 alpha-2 (ES, DE, US...)
 * @property {number} lat
 * @property {number} lon
 * @property {string|null} isp          Organización / ISP
 * @property {number|null} asn          Número de sistema autónomo
 * @property {number|null} [accuracyKm] Radio de incertidumbre (solo MaxMind)
 * @property {'db'|'hostname'} [source]  De dónde sale la ubicación
 * @property {boolean} [plausible]       false si choca con la velocidad de la luz
 */

/**
 * @typedef {'ok' | 'private' | 'timeout' | 'nogeo'} HopStatus
 *  ok      → responde y está geolocalizado: se dibuja en el globo
 *  private → IP privada (RFC 1918, CGNAT...): solo en la lista
 *  timeout → "* * *": el router no contestó
 *  nogeo   → IP pública sin datos de ubicación
 */

/**
 * @typedef {Object} Hop
 * @property {number} hop                 Número de salto (TTL)
 * @property {string|null} ip
 * @property {string|null} hostname
 * @property {(number|null)[]} rtts       Las tres sondas en ms (null = sin respuesta)
 * @property {number|null} latency       Media de las sondas que respondieron
 * @property {GeoInfo|null} geo
 * @property {HopStatus} status
 */

/** Media de las sondas válidas, redondeada a 0,1 ms. */
export function averageRtt(rtts) {
  const valid = rtts.filter((r) => typeof r === 'number');
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

/** Deduce el estado de un salto a partir de sus datos. */
export function hopStatus({ ip, geo }) {
  if (!ip) return 'timeout';
  if (isPrivateIp(ip)) return 'private';
  if (!geo) return 'nogeo';
  return 'ok';
}

/** Construye un Hop completo a partir de los datos crudos. */
export function makeHop({ hop, ip = null, hostname = null, rtts = [], geo = null }) {
  const h = { hop, ip, hostname, rtts, latency: averageRtt(rtts), geo };
  h.status = hopStatus(h);
  return h;
}

/**
 * True si el salto se puede dibujar en el globo. Una ubicación incompatible con la
 * velocidad de la luz se sabe falsa: se muestra en la lista, pero no entra en la
 * ruta ni en las estadísticas (metería un arco y unos kilómetros que no existen).
 */
export const isPlottable = (h) => h.status === 'ok' && h.geo.plausible !== false;
