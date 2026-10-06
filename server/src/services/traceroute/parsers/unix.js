import { isIPv4, isIPv6 } from '@globe-trace/shared';

const isIp = (t) => isIPv4(t) || isIPv6(t);

/**
 * Parser de `traceroute` de Linux y macOS (ejecutado con -n, sin DNS inverso).
 *
 * Formatos que se ven en la práctica:
 *   " 1  192.168.1.1  0.512 ms  0.480 ms  0.455 ms"
 *   " 2  * * *"
 *   " 5  10.0.0.1  5.123 ms 10.0.0.2  5.301 ms *"   ← balanceo: otra IP en la misma línea
 *   " 9  1.1.1.1  17.3 ms !H  17.1 ms !H  17.0 ms !H" ← anotaciones ICMP
 *
 * En vez de una regex para cada caso, se recorren los tokens uno a uno.
 * Si un salto responde desde varias IPs (balanceo de carga), se guarda la primera.
 *
 * @param {string} line
 * @returns {{ hop: number, ip: string|null, rtts: (number|null)[] } | null}
 */
export function parseUnixLine(line) {
  const m = line.match(/^\s*(\d+)\s+(.*)$/);
  if (!m) return null; // cabecera "traceroute to ..." o líneas de continuación de macOS

  const tokens = m[2].trim().split(/\s+/);
  let ip = null;
  const rtts = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '*') {
      rtts.push(null);
    } else if (isIp(t.replace(/^\((.*)\)$/, '$1'))) {
      ip ??= t.replace(/^\((.*)\)$/, '$1');
    } else if (/^\d+(\.\d+)?$/.test(t) && tokens[i + 1] === 'ms') {
      rtts.push(Math.round(Number(t) * 10) / 10);
      i++; // se salta el "ms"
    }
    // El resto ("!H", "!N", hostnames si no se usó -n...) se ignora
  }

  if (rtts.length === 0 && ip === null) return null;
  return { hop: Number(m[1]), ip, rtts };
}
