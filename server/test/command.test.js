import { describe, it, expect } from 'vitest';
import { buildCommand } from '../src/services/traceroute/command.js';

const base = { ip: '1.1.1.1', family: 4, maxHops: 30, probeTimeoutMs: 1000 };

describe('buildCommand', () => {
  it('Windows: tracert sin DNS, con límites y la IP como último argumento', () => {
    const c = buildCommand({ ...base, platform: 'win32' });
    expect(c.command).toBe('tracert');
    expect(c.args).toEqual(['-d', '-h', '30', '-w', '1000', '-4', '1.1.1.1']);
  });

  it('Linux: timeout en segundos', () => {
    const c = buildCommand({ ...base, platform: 'linux', probeTimeoutMs: 1500 });
    expect(c.command).toBe('traceroute');
    expect(c.args).toEqual(['-n', '-q', '3', '-w', '2', '-m', '30', '1.1.1.1']);
  });

  it('IPv6 en macOS usa traceroute6', () => {
    const c = buildCommand({ ...base, ip: '2606:4700::1', family: 6, platform: 'darwin' });
    expect(c.command).toBe('traceroute6');
  });
});
