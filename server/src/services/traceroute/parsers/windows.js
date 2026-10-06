import { isIPv4, isIPv6 } from '@globe-trace/shared';

// Una sonda de tracert: "12 ms", "<1 ms" o "*"
const PROBE = String.raw`(\*|<?\d+\s*ms)`;

// "  7     *        *       19 ms  81.173.106.39"
// número de salto, tres sondas y el resto de la línea (IP o mensaje)
const HOP_LINE = new RegExp(String.raw`^\s*(\d+)\s+${PROBE}\s+${PROBE}\s+${PROBE}\s+(.*)$`);

// "  3  192.168.1.254  informa: Host de destino inaccesible."
// Algunos errores ICMP llegan sin tiempos: solo número de salto e IP
const UNREACHABLE_LINE = /^\s*(\d+)\s+([0-9a-f.:]+)\s+\S/i;

function parseProbe(text) {
  if (text === '*') return null;
  // "<1 ms" significa menos de un milisegundo: se guarda como 0,5 para no mentir con un 0
  if (text.startsWith('<')) return 0.5;
  return Number.parseInt(text, 10);
}

/** Busca la IP en el resto de la línea: "1.1.1.1", "host [1.1.1.1]" o un texto sin IP. */
function extractIp(rest) {
  const bracket = rest.match(/\[([0-9a-f.:]+)\]/i);
  if (bracket) return bracket[1];
  const first = rest.trim().split(/\s+/)[0] ?? '';
  return isIPv4(first) || isIPv6(first) ? first : null;
}

/**
 * Parser de `tracert` de Windows. No depende del idioma: el texto
 * ("Tiempo de espera agotado", "Request timed out"...) se ignora y solo
 * se usa la estructura de columnas.
 *
 * @param {string} line
 * @returns {{ hop: number, ip: string|null, rtts: (number|null)[] } | null}
 */
export function parseWindowsLine(line) {
  const m = line.match(HOP_LINE);
  if (m) {
    const rtts = [m[2], m[3], m[4]].map(parseProbe);
    const ip = extractIp(m[5]);
    return { hop: Number(m[1]), ip, rtts };
  }

  const u = line.match(UNREACHABLE_LINE);
  if (u && (isIPv4(u[2]) || isIPv6(u[2]))) {
    return { hop: Number(u[1]), ip: u[2], rtts: [null, null, null] };
  }

  return null; // cabecera, línea en blanco o "Traza completa."
}
