import { parseWindowsLine } from './parsers/windows.js';
import { parseUnixLine } from './parsers/unix.js';

/**
 * Elige ejecutable, argumentos y parser según el sistema operativo.
 *
 * Los argumentos se devuelven como ARRAY y se pasan tal cual a spawn(): cada
 * elemento llega al programa como un argumento independiente y ninguna shell
 * interpreta su contenido. Además, `ip` ya es una IP validada (nunca el texto
 * del usuario), así que no puede empezar por "-" y colarse como una opción.
 *
 * @param {{ platform: string, ip: string, family: 4|6, maxHops: number, probeTimeoutMs: number }} opts
 */
export function buildCommand({ platform, ip, family, maxHops, probeTimeoutMs }) {
  if (platform === 'win32') {
    return {
      command: 'tracert',
      args: [
        '-d', // sin DNS inverso: lo hace Node en paralelo, mucho más rápido
        '-h', String(maxHops),
        '-w', String(probeTimeoutMs), // milisegundos por sonda
        family === 6 ? '-6' : '-4',
        ip,
      ],
      parseLine: parseWindowsLine,
      // La consola de Windows en español usa CP850. Solo leemos números e IPs,
      // así que latin1 basta para que los acentos no rompan nada.
      encoding: 'latin1',
    };
  }

  // Linux y macOS: traceroute6 para IPv6, que existe en ambos
  return {
    command: family === 6 ? 'traceroute6' : 'traceroute',
    args: [
      '-n',
      '-q', '3', // tres sondas por salto, como tracert
      '-w', String(Math.max(1, Math.ceil(probeTimeoutMs / 1000))), // aquí son segundos
      '-m', String(maxHops),
      ip,
    ],
    parseLine: parseUnixLine,
    encoding: 'utf8',
  };
}
