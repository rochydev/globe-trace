import { promises as dns } from 'node:dns';
import { isNonRoutableIp } from '@globe-trace/shared';
import { AppError } from '../lib/errors.js';

const LOOKUP_TIMEOUT_MS = 3000;

/** Rechaza la promesa si tarda más de `ms`. dns.lookup no tiene timeout propio. */
function withTimeout(promise, ms, error) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(error), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Convierte el destino validado en la IP que se va a trazar.
 *
 * Resolver aquí (y no dejar que lo haga traceroute) tiene dos ventajas:
 *  1. Se comprueba la IP final ANTES de lanzar nada: "intranet.miempresa.com"
 *     podría resolver a 10.0.0.5 y el servidor acabaría mapeando su red interna.
 *  2. Al comando solo le llega una IP, nunca texto escrito por el usuario.
 *
 * @param {{ kind: 'ipv4'|'ipv6'|'domain', value: string }} target
 * @returns {Promise<{ ip: string, family: 4|6 }>}
 */
export async function resolveTarget(target, { lookup = dns.lookup } = {}) {
  let ip;
  let family;

  if (target.kind === 'domain') {
    const notFound = new AppError(422, 'DNS_NOT_FOUND', `No se pudo resolver ${target.value}`);
    let results;
    try {
      results = await withTimeout(lookup(target.value, { all: true }), LOOKUP_TIMEOUT_MS, notFound);
    } catch {
      throw notFound;
    }
    // Se prefiere IPv4: muchos servidores no tienen salida IPv6
    const chosen = results.find((r) => r.family === 4) ?? results[0];
    if (!chosen) throw notFound;
    ({ address: ip, family } = chosen);
  } else {
    ip = target.value;
    family = target.kind === 'ipv6' ? 6 : 4;
  }

  if (isNonRoutableIp(ip)) {
    throw new AppError(
      403,
      'TARGET_NOT_ALLOWED',
      `${ip} es una dirección privada o reservada: solo se permiten destinos públicos`,
    );
  }
  return { ip, family };
}

// DNS inverso con timeout corto y una sola petición: un PTR lento no debe frenar el trace
const resolver = new dns.Resolver({ timeout: 1500, tries: 1 });
const ptrCache = new Map();
const PTR_CACHE_MAX = 2000;

/** Hostname de una IP (registro PTR), o null si no tiene o tarda demasiado. */
export async function reverseLookup(ip) {
  if (ptrCache.has(ip)) return ptrCache.get(ip);
  let name = null;
  try {
    const [first] = await resolver.reverse(ip);
    // El PTR lo controla el dueño de la IP: se limita a caracteres de hostname
    if (first && /^[a-z0-9.-]{1,253}$/i.test(first)) name = first.toLowerCase();
  } catch {
    // Sin PTR: es lo normal en muchos routers
  }
  if (ptrCache.size >= PTR_CACHE_MAX) ptrCache.delete(ptrCache.keys().next().value);
  ptrCache.set(ip, name);
  return name;
}
