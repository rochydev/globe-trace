/**
 * Limita cuántos traces corren a la vez: en total y por cliente.
 *
 * El rate limit cuenta peticiones por minuto, pero un trace puede durar 60 s:
 * sin este límite, 5 peticiones seguidas serían 5 procesos vivos a la vez por IP.
 */
export function createConcurrencyGuard({ maxGlobal, maxPerClient }) {
  const perClient = new Map();
  let total = 0;

  return {
    /** Devuelve una función para liberar el hueco, o null si no hay sitio. */
    acquire(clientKey) {
      const mine = perClient.get(clientKey) ?? 0;
      if (total >= maxGlobal || mine >= maxPerClient) return null;

      total++;
      perClient.set(clientKey, mine + 1);
      let released = false;

      return () => {
        if (released) return; // liberar dos veces no debe descuadrar los contadores
        released = true;
        total--;
        const left = perClient.get(clientKey) - 1;
        if (left === 0) perClient.delete(clientKey);
        else perClient.set(clientKey, left);
      };
    },
    get active() {
      return total;
    },
  };
}
