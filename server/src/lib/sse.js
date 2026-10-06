/**
 * Server-Sent Events sobre una respuesta HTTP normal que no se cierra.
 *
 * El protocolo es texto plano, un evento por bloque separado por línea en blanco:
 *
 *   event: hop
 *   data: {"hop":3,"ip":"81.41.231.189",...}
 *
 * A diferencia de WebSocket, es unidireccional (servidor → cliente), va sobre
 * HTTP corriente y lo entienden proxies y balanceadores sin configuración extra.
 * Para un trace, donde el cliente solo escucha, es justo lo que hace falta.
 */
export function openSse(reply, { heartbeatMs = 15_000 } = {}) {
  // hijack: Fastify deja de gestionar la respuesta y escribimos en el socket a mano.
  // Las cabeceras ya preparadas por los plugins (CORS...) se copian explícitamente.
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    ...reply.getHeaders(),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
    'X-Accel-Buffering': 'no', // que nginx no acumule los eventos en su búfer
  });

  // Un comentario (": ...") cada 15 s mantiene viva la conexión durante los "* * *"
  // largos: algunos proxies cortan las conexiones que pasan un rato sin datos
  const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);

  return {
    send(event, data) {
      if (res.writableEnded) return;
      // JSON.stringify nunca produce saltos de línea reales, así que cabe en una línea data:
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
  };
}
