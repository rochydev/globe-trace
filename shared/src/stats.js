import { haversineKm } from './net.js';
import { isPlottable } from './hop.js';

/**
 * Resumen de un trace: saltos, latencia final, km recorridos y países.
 * La distancia es aproximada: suma de tramos en línea recta entre saltos
 * geolocalizados (el cable real nunca va en línea recta).
 */
export function traceStats(hops) {
  const geoHops = hops.filter(isPlottable);
  let distanceKm = 0;
  for (let i = 1; i < geoHops.length; i++) {
    distanceKm += haversineKm(geoHops[i - 1].geo, geoHops[i].geo);
  }

  // La latencia "total" es el RTT del último salto que respondió
  const lastReply = [...hops].reverse().find((h) => h.latency !== null);

  const countries = [];
  for (const h of geoHops) {
    const cc = h.geo.countryCode;
    if (cc && !countries.includes(cc)) countries.push(cc);
  }

  return {
    hops: hops.length,
    latency: lastReply ? lastReply.latency : null,
    distanceKm: Math.round(distanceKm),
    countries,
  };
}

/**
 * Color de latencia en escala verde → amarillo → rojo.
 * 0 ms = verde (hue 140), >= max ms = rojo (hue 0).
 */
export function latencyHue(ms, max = 250) {
  if (ms === null || ms === undefined) return null;
  const t = Math.min(Math.max(ms / max, 0), 1);
  return Math.round(140 * (1 - t));
}
