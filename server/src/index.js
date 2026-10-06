import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const app = await buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Cierre ordenado: Fastify termina las peticiones en curso antes de salir
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => app.close().then(() => process.exit(0)));
}
