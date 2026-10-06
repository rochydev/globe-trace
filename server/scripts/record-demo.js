// Graba traces reales para el modo demo (GitHub Pages, vídeo, uso sin servidor).
// Necesita el backend en marcha. Uso:
//   npm run demo:record -w server -- github.com www.u-tokyo.ac.jp
//
// Cada trace se guarda en client/public/demo/<destino>.json y se añade al índice
// client/public/demo/index.json, que es lo que lee el frontend.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const API = process.env.API_URL ?? 'http://127.0.0.1:8790';
const DEMO_DIR = fileURLToPath(new URL('../../client/public/demo', import.meta.url));
const INDEX = join(DEMO_DIR, 'index.json');

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Indica al menos un destino: npm run demo:record -w server -- github.com');
  process.exit(1);
}

const index = JSON.parse(await readFile(INDEX, 'utf8').catch(() => '[]'));

for (const target of targets) {
  process.stdout.write(`Trazando ${target}... `);
  const res = await fetch(`${API}/api/trace?target=${encodeURIComponent(target)}`);
  const body = await res.json();
  if (!res.ok) {
    console.log(`error: ${body.error?.message}`);
    continue;
  }

  const trace = { ...body, recordedAt: new Date().toISOString() };
  // El nombre de archivo sale del destino ya validado por el servidor (solo [a-z0-9.:-])
  const file = `${body.target.replaceAll(':', '_')}.json`;
  await writeFile(join(DEMO_DIR, file), JSON.stringify(trace, null, 2) + '\n');

  const entry = { target: body.target, file, hops: body.hops.length, recordedAt: trace.recordedAt };
  const i = index.findIndex((e) => e.target === body.target);
  if (i === -1) index.push(entry);
  else index[i] = entry;

  const last = body.hops.filter((h) => h.geo).at(-1)?.geo;
  console.log(`${body.hops.length} saltos, llega a ${last?.city ?? '?'} (${last?.countryCode ?? '?'})`);
}

await writeFile(INDEX, JSON.stringify(index, null, 2) + '\n');
console.log(`Índice actualizado: ${index.map((e) => e.target).join(', ')}`);
