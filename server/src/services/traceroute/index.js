import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { buildCommand } from './command.js';
import { AppError } from '../../lib/errors.js';

/**
 * Ejecuta traceroute y va devolviendo cada salto EN CUANTO aparece su línea.
 *
 * Es un generador asíncrono: quien lo consume hace `for await (const hop of ...)`
 * y recibe los saltos uno a uno mientras el proceso sigue corriendo. Esa es la
 * base del streaming de la fase 3.
 *
 * Si quien consume deja de iterar (break, error, cliente desconectado), se ejecuta
 * el `finally` y el proceso se mata: nunca quedan traceroutes huérfanos.
 *
 * @param {{ ip: string, family: 4|6, maxHops: number, probeTimeoutMs: number,
 *           timeoutMs: number, maxSilentHops?: number, signal?: AbortSignal,
 *           platform?: string, spawn?: Function }} opts
 */
export async function* runTraceroute({
  ip,
  family,
  maxHops,
  probeTimeoutMs,
  timeoutMs,
  maxSilentHops = 5,
  signal,
  platform = process.platform,
  spawn = nodeSpawn,
}) {
  const { command, args, parseLine, encoding } = buildCommand({
    platform,
    ip,
    family,
    maxHops,
    probeTimeoutMs,
  });

  const child = spawn(command, args, {
    shell: false, // explícito: nunca una shell intermedia
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let spawnError = null;
  child.on('error', (err) => (spawnError = err));

  // Límite duro de tiempo para todo el trace
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  const onAbort = () => child.kill();
  signal?.addEventListener('abort', onAbort, { once: true });

  child.stdout.setEncoding(encoding);
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });

  let emitted = 0;
  let silent = 0;
  try {
    for await (const line of lines) {
      const hop = parseLine(line);
      // Defensa extra: nunca más saltos de los pedidos, y siempre en orden
      if (!hop || hop.hop <= emitted || hop.hop > maxHops) continue;
      emitted = hop.hop;
      yield hop;

      // Muchos servidores (y cortafuegos) no responden a las sondas: sin este corte,
      // el trace seguiría con "* * *" hasta el salto máximo, unos 3 s por salto.
      // Tras N saltos seguidos en silencio se da por terminado, como hace mtr.
      silent = hop.ip === null ? silent + 1 : 0;
      if (silent >= maxSilentHops) break;
    }

    if (spawnError?.code === 'ENOENT') {
      throw new AppError(500, 'TRACEROUTE_MISSING', `"${command}" no está instalado en el servidor`);
    }
    if (spawnError) throw spawnError;
    if (timedOut) {
      throw new AppError(504, 'TRACE_TIMEOUT', `El trace superó el límite de ${timeoutMs / 1000} s`);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    lines.close();
    if (child.exitCode === null) child.kill();
  }
}
