/**
 * Caché en memoria con caducidad y tamaño máximo.
 * Un Map recuerda el orden de inserción: el primer elemento es siempre el más antiguo,
 * así que al llenarse basta con borrar ese.
 */
export function createTtlCache({ max = 5000, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  const map = new Map();

  return {
    get(key) {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expires < Date.now()) {
        map.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      map.delete(key); // reinsertar = pasa al final de la cola
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(key, { value, expires: Date.now() + ttlMs });
    },
  };
}
