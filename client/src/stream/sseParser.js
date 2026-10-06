/**
 * Parser incremental de Server-Sent Events.
 *
 * Los datos llegan por la red en trozos arbitrarios: un trozo puede traer medio
 * evento, o tres y medio. Por eso se acumula texto en un búfer y solo se procesa
 * cada bloque cuando llega su línea en blanco final.
 *
 * @param {(event: string, data: string) => void} onEvent
 */
export function createSseParser(onEvent) {
  let buffer = '';

  return function push(chunk) {
    buffer += chunk.replace(/\r\n?/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);

      let event = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue; // comentario (el "ping" de mantenimiento)
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length) onEvent(event, data.join('\n'));
    }
  };
}
