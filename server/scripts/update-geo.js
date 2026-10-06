// Descarga (o actualiza) las bases GeoLite2 City y ASN de MaxMind en server/data.
//
// Requiere una cuenta gratuita en https://www.maxmind.com/en/geolite2/signup y una
// clave de licencia. Uso:
//   MAXMIND_ACCOUNT_ID=123456 MAXMIND_LICENSE_KEY=xxxx npm run geo:update -w server
// (o ponlas en server/.env)
//
// MaxMind actualiza GeoLite2 dos veces por semana: conviene programarlo (cron / tarea).

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rename, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const EDITIONS = ['GeoLite2-City', 'GeoLite2-ASN'];
const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url));

const { MAXMIND_ACCOUNT_ID: account, MAXMIND_LICENSE_KEY: key } = process.env;
if (!account || !key) {
  console.error('Faltan MAXMIND_ACCOUNT_ID y MAXMIND_LICENSE_KEY (ver comentario del script)');
  process.exit(1);
}

/** Ejecuta un comando con argumentos separados (sin shell) y espera a que acabe. */
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: false });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}`))));
  });

/** Busca recursivamente el primer .mmdb dentro de una carpeta. */
async function findMmdb(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findMmdb(full);
      if (found) return found;
    } else if (entry.name.endsWith('.mmdb')) {
      return full;
    }
  }
  return null;
}

await mkdir(DATA_DIR, { recursive: true });
const auth = 'Basic ' + Buffer.from(`${account}:${key}`).toString('base64');

for (const edition of EDITIONS) {
  const url = `https://download.maxmind.com/geoip/databases/${edition}/download?suffix=tar.gz`;
  process.stdout.write(`Descargando ${edition}... `);

  // fetch sigue la redirección al almacenamiento de MaxMind y NO reenvía la cabecera
  // Authorization a otro dominio, que es justo lo que queremos
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) {
    console.error(`\nError ${res.status}: ¿ID de cuenta o clave incorrectos?`);
    process.exit(1);
  }

  const tmp = await mkdtemp(join(tmpdir(), 'geolite-'));
  const archive = join(tmp, `${edition}.tar.gz`);
  await writeFile(archive, Buffer.from(await res.arrayBuffer()));

  // tar viene de serie en Linux, macOS y Windows 10+
  await run('tar', ['-xzf', archive, '-C', tmp]);
  const mmdb = await findMmdb(tmp);
  if (!mmdb) throw new Error(`No se encontró el .mmdb dentro de ${edition}`);

  // rename es atómico: el servidor nunca ve un archivo a medio escribir
  await rename(mmdb, join(DATA_DIR, `${edition}.mmdb`));
  await rm(tmp, { recursive: true, force: true });
  console.log('ok');
}

console.log(`Bases guardadas en ${DATA_DIR}. Reinicia el servidor para usarlas.`);
