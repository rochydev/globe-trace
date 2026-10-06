import { latencyHue } from '@globe-trace/shared';

export const pad2 = (n) => String(n).padStart(2, '0');

export const fmtMs = (ms) => (ms === null || ms === undefined ? '—' : `${ms.toFixed(1)} ms`);

export const fmtKm = (km) => `${Math.round(km).toLocaleString('es-ES')} km`;

/** Color CSS de una latencia (verde → amarillo → rojo). */
export function latencyColor(ms) {
  const hue = latencyHue(ms);
  return hue === null ? 'var(--muted)' : `hsl(${hue} 85% 55%)`;
}

/** Coordenada con hemisferio: 41.387°N */
export function fmtCoord(value, axis) {
  const hemi = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(3)}°${hemi}`;
}

// Texto y estilo de cada estado de salto que no se dibuja en el globo
export const STATUS_INFO = {
  private: { label: 'Red privada', icon: 'ShieldOff' },
  timeout: { label: 'Sin respuesta', icon: 'CircleSlash' },
  nogeo: { label: 'Sin geolocalización', icon: 'MapPinOff' },
};
