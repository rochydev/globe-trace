import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWindowsLine } from '../src/services/traceroute/parsers/windows.js';
import { parseUnixLine } from '../src/services/traceroute/parsers/unix.js';

const fixture = (name, enc = 'utf8') =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), enc).split(/\r?\n/);
const parseAll = (lines, parse) => lines.map(parse).filter(Boolean);

describe('parser de Windows (tracert)', () => {
  it('lee la salida real en castellano (CP850)', () => {
    const hops = parseAll(fixture('windows-es.txt', 'latin1'), parseWindowsLine);
    expect(hops).toHaveLength(9);
    expect(hops[0]).toEqual({ hop: 1, ip: '192.168.1.1', rtts: [18, 3, 3] });
    expect(hops[1]).toEqual({ hop: 2, ip: null, rtts: [null, null, null] });
    expect(hops[6]).toEqual({ hop: 7, ip: '81.173.106.39', rtts: [null, null, 19] });
    expect(hops.at(-1).ip).toBe('1.1.1.1');
  });

  it('lee la salida en inglés, "<1 ms" y destino inaccesible', () => {
    const hops = parseAll(fixture('windows-en.txt'), parseWindowsLine);
    expect(hops.map((h) => h.hop)).toEqual([1, 2, 3, 4, 5]);
    expect(hops[0].rtts).toEqual([0.5, 0.5, 0.5]);
    expect(hops[2]).toEqual({ hop: 3, ip: null, rtts: [null, null, null] });
    expect(hops[3].rtts).toEqual([12, null, 11]);
    expect(hops[4]).toEqual({ hop: 5, ip: '62.115.40.13', rtts: [null, null, null] });
  });

  it('lee IPv6', () => {
    const hops = parseAll(fixture('windows-ipv6.txt', 'latin1'), parseWindowsLine);
    expect(hops.map((h) => h.ip)).toEqual([
      '2a0c:5a80:1::1',
      '2001:7f8:a0::d6a',
      '2606:4700:4700::1111',
    ]);
  });

  it('extrae la IP de "host [ip]" cuando no se usa -d', () => {
    const line = '  3    10 ms    11 ms    10 ms  router.isp.net [81.46.7.61]';
    expect(parseWindowsLine(line).ip).toBe('81.46.7.61');
  });

  it('ignora cabeceras y líneas vacías', () => {
    expect(parseWindowsLine('Traza a 1.1.1.1 sobre caminos de 15 saltos como máximo.')).toBeNull();
    expect(parseWindowsLine('')).toBeNull();
  });
});

describe('parser de Linux/macOS (traceroute)', () => {
  it('lee la salida de Linux con balanceo y anotaciones !H', () => {
    const hops = parseAll(fixture('linux.txt'), parseUnixLine);
    expect(hops).toHaveLength(6);
    expect(hops[0]).toEqual({ hop: 1, ip: '192.168.1.1', rtts: [0.5, 0.5, 0.5] });
    expect(hops[1]).toEqual({ hop: 2, ip: null, rtts: [null, null, null] });
    expect(hops[3]).toEqual({ hop: 4, ip: '10.255.0.1', rtts: [9.1, 9.9, null] });
    expect(hops[4].rtts).toEqual([16.4, 16.3, 16.5]);
  });

  it('lee la salida de macOS ignorando las líneas de continuación', () => {
    const hops = parseAll(fixture('macos.txt'), parseUnixLine);
    expect(hops.map((h) => h.hop)).toEqual([1, 2, 3, 4]);
    expect(hops[2]).toEqual({ hop: 3, ip: '94.142.98.134', rtts: [12.4] });
  });

  it('ignora la cabecera', () => {
    expect(parseUnixLine('traceroute to 1.1.1.1 (1.1.1.1), 30 hops max')).toBeNull();
  });
});
