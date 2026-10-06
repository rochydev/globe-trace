import { describe, it, expect } from 'vitest';
import { validateTarget, isIPv6, isNonRoutableIp } from '../src/index.js';

describe('validateTarget', () => {
  it.each([
    ['github.com', 'domain'],
    ['  WWW.Example.CO.UK. ', 'domain'],
    ['xn--bcher-kva.example', 'domain'],
    ['1.1.1.1', 'ipv4'],
    ['2606:4700:4700::1111', 'ipv6'],
    ['::1', 'ipv6'],
  ])('acepta %j como %s', (input, kind) => {
    expect(validateTarget(input)).toMatchObject({ ok: true, kind });
  });

  it.each([
    '',
    'localhost',
    '-oops.com',
    'a..com',
    '01.1.1.1',
    '1.1.1',
    'exa_mple.com',
    'a;b.com',
    'x'.repeat(300),
    42,
  ])('rechaza %j', (input) => {
    expect(validateTarget(input).ok).toBe(false);
  });
});

describe('isIPv6', () => {
  it('rechaza dos "::" y grupos de más', () => {
    expect(isIPv6('1::2::3')).toBe(false);
    expect(isIPv6('1:2:3:4:5:6:7:8:9')).toBe(false);
    expect(isIPv6('1:2:3:4:5:6:7:8')).toBe(true);
  });
});

describe('isNonRoutableIp', () => {
  it.each(['10.1.1.1', '239.255.255.250', '255.255.255.255', '192.0.2.10', 'ff02::1', '2001:db8::1'])(
    '%s no es un destino válido',
    (ip) => expect(isNonRoutableIp(ip)).toBe(true),
  );

  it.each(['1.1.1.1', '140.82.121.4', '2606:4700:4700::1111'])('%s sí lo es', (ip) => {
    expect(isNonRoutableIp(ip)).toBe(false);
  });
});
