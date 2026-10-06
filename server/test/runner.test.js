import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runTraceroute } from '../src/services/traceroute/index.js';

/** Proceso falso: escribe las líneas indicadas con un pequeño retardo entre ellas. */
function fakeSpawn(lines, { hang = false } = {}) {
  const spawn = (command, args, options) => {
    spawn.calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.exitCode = null;
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.exitCode = 1;
      child.stdout.end();
    };
    (async () => {
      for (const l of lines) {
        await new Promise((r) => setTimeout(r, 5));
        if (child.killed) return;
        child.stdout.write(l + '\n');
      }
      if (!hang) {
        child.exitCode = 0;
        child.stdout.end();
      }
    })();
    spawn.last = child;
    return child;
  };
  spawn.calls = [];
  return spawn;
}

const opts = {
  ip: '1.1.1.1',
  family: 4,
  maxHops: 30,
  probeTimeoutMs: 500,
  timeoutMs: 2000,
  platform: 'linux',
};

describe('runTraceroute', () => {
  it('emite los saltos a medida que llegan y nunca usa shell', async () => {
    const spawn = fakeSpawn(['traceroute to 1.1.1.1', ' 1  192.168.1.1  1.0 ms', ' 2  1.1.1.1  9.0 ms']);
    const hops = [];
    for await (const h of runTraceroute({ ...opts, spawn })) hops.push(h);
    expect(hops.map((h) => h.ip)).toEqual(['192.168.1.1', '1.1.1.1']);
    expect(spawn.calls[0].options.shell).toBe(false);
    expect(spawn.calls[0].args.at(-1)).toBe('1.1.1.1');
  });

  it('mata el proceso y lanza TRACE_TIMEOUT si se pasa de tiempo', async () => {
    const spawn = fakeSpawn([' 1  192.168.1.1  1.0 ms'], { hang: true });
    const hops = [];
    await expect(async () => {
      for await (const h of runTraceroute({ ...opts, timeoutMs: 100, spawn })) hops.push(h);
    }).rejects.toMatchObject({ code: 'TRACE_TIMEOUT' });
    expect(hops).toHaveLength(1);
    expect(spawn.last.killed).toBe(true);
  });

  it('mata el proceso si quien consume deja de iterar', async () => {
    const spawn = fakeSpawn([' 1  192.168.1.1  1.0 ms', ' 2  10.0.0.1  2.0 ms'], { hang: true });
    // eslint-disable-next-line no-unused-vars
    for await (const _ of runTraceroute({ ...opts, spawn })) break;
    expect(spawn.last.killed).toBe(true);
  });

  it('descarta saltos repetidos, desordenados o por encima del máximo', async () => {
    const spawn = fakeSpawn([
      ' 1  9.9.9.1  1 ms',
      ' 1  9.9.9.1  1 ms',
      ' 3  9.9.9.3  3 ms',
      ' 2  9.9.9.2  2 ms',
      ' 4  9.9.9.4  4 ms',
    ]);
    const hops = [];
    for await (const h of runTraceroute({ ...opts, maxHops: 3, spawn })) hops.push(h.hop);
    expect(hops).toEqual([1, 3]);
  });
});

describe('corte por silencio', () => {
  it('termina tras N saltos seguidos sin respuesta y mata el proceso', async () => {
    const spawn = fakeSpawn(
      [' 1  9.9.9.1  1 ms', ' 2  * * *', ' 3  9.9.9.3  3 ms', ' 4  * * *', ' 5  * * *', ' 6  * * *', ' 7  9.9.9.7  7 ms'],
      { hang: true },
    );
    const hops = [];
    for await (const h of runTraceroute({ ...opts, maxSilentHops: 3, spawn })) hops.push(h.hop);
    expect(hops).toEqual([1, 2, 3, 4, 5, 6]);
    expect(spawn.last.killed).toBe(true);
  });
});
