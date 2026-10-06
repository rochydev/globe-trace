// Cálculos geográficos que solo necesita la cámara del globo.

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/**
 * Punto medio sobre la esfera entre dos coordenadas. Se hace con vectores 3D
 * para que funcione al cruzar el antimeridiano (p. ej. San José → Tokio),
 * donde promediar longitudes daría un punto en el lado equivocado del planeta.
 */
export function sphericalMidpoint(a, b) {
  const v = (p) => [
    Math.cos(toRad(p.lat)) * Math.cos(toRad(p.lon)),
    Math.cos(toRad(p.lat)) * Math.sin(toRad(p.lon)),
    Math.sin(toRad(p.lat)),
  ];
  const [x1, y1, z1] = v(a);
  const [x2, y2, z2] = v(b);
  const x = x1 + x2;
  const y = y1 + y2;
  const z = z1 + z2;
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon: toDeg(Math.atan2(y, x)) };
}

/**
 * Centroide de varios puntos sobre la esfera: suma de sus vectores unitarios.
 * Sirve para encuadrar una ruta entera aunque dé media vuelta al mundo.
 */
export function sphericalCentroid(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += Math.cos(toRad(p.lat)) * Math.cos(toRad(p.lon));
    y += Math.cos(toRad(p.lat)) * Math.sin(toRad(p.lon));
    z += Math.sin(toRad(p.lat));
  }
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon: toDeg(Math.atan2(y, x)) };
}

/** Altura de cámara (en radios terrestres) para que un tramo de N km quepa en pantalla. */
export function altitudeForDistance(km) {
  return Math.min(Math.max(1.1 + km / 5500, 1.25), 2.8);
}
