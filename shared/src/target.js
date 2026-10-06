// Validación del destino que escribe el usuario. Es una LISTA BLANCA: no se buscan
// caracteres peligrosos, se define con precisión qué es válido y todo lo demás se
// rechaza. Así no hay que imaginar todos los ataques posibles (; | $() ` -opción...).

const MAX_DOMAIN_LENGTH = 253;

/** IPv4 en notación decimal estricta: 4 octetos 0-255, sin ceros a la izquierda. */
export function isIPv4(value) {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255)
  );
}

/** IPv6 (con compresión ::, sin zona %eth0 ni IPv4 embebida, que no hacen falta aquí). */
export function isIPv6(value) {
  if (!/^[0-9a-f:]+$/i.test(value) || value.length > 39) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false; // "::" solo puede aparecer una vez
  const groups = halves.flatMap((h) => (h === '' ? [] : h.split(':')));
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return halves.length === 2 ? groups.length < 8 : groups.length === 8;
}

/**
 * Nombre de dominio: etiquetas de letras, dígitos y guiones (sin guion al principio
 * ni al final), al menos dos etiquetas y un TLD alfabético o punycode (xn--).
 */
export function isDomain(value) {
  if (value.length > MAX_DOMAIN_LENGTH) return false;
  const labels = value.split('.');
  if (labels.length < 2) return false;
  const labelOk = (l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l);
  const tld = labels.at(-1);
  return labels.every(labelOk) && (/^[a-z]{2,63}$/.test(tld) || /^xn--[a-z0-9-]{1,59}$/.test(tld));
}

/**
 * Normaliza y clasifica la entrada.
 * @returns {{ ok: true, kind: 'ipv4'|'ipv6'|'domain', value: string } | { ok: false, reason: string }}
 */
export function validateTarget(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'Destino no válido' };

  // Se toleran el espacio y el punto final ("github.com.") y las mayúsculas
  const value = input.trim().toLowerCase().replace(/\.$/, '');
  if (!value) return { ok: false, reason: 'Escribe un dominio o una IP' };
  if (value.length > MAX_DOMAIN_LENGTH) return { ok: false, reason: 'Demasiado largo' };

  if (isIPv4(value)) return { ok: true, kind: 'ipv4', value };
  if (isIPv6(value)) return { ok: true, kind: 'ipv6', value };
  if (isDomain(value)) return { ok: true, kind: 'domain', value };

  return { ok: false, reason: 'Introduce un dominio (ej. github.com) o una IPv4/IPv6 válida' };
}
