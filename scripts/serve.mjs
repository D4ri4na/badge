// Servidor de desarrollo. Sirve archivos y nada más.
//
//   pnpm dev
//
// No hay API ni render acá: el generador entero corre en el navegador. Este
// script existe solo porque los módulos ES no se pueden cargar desde file://,
// así que abrir web/index.html a mano no funciona.
//
// Sirve exactamente lo mismo que hay que publicar: web/ en la raíz y assets/
// bajo /assets/. Si acá anda, desplegado anda.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const PORT = Number(process.env.PORT ?? 5173);
const BASE = `http://localhost:${PORT}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  // Sin esto el logo sale como octet-stream y el navegador no lo dibuja.
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  // robots.txt y sitemap.xml: sin esto salen como octet-stream y acá no se
  // notaría nada, pero la promesa de este servidor es que si algo anda local
  // anda desplegado.
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);

  // Un pedido con ".." se sale del directorio servido. En un dev-server el
  // riesgo es acotado, pero cuesta una línea.
  if (name.includes('..')) return send(res, 400, 'text/plain', 'Ruta inválida');

  // Los PNG del diseño viven en assets/ de la raíz, no dentro de web/, porque
  // los scripts de build también los escriben ahí.
  const file = name.startsWith('assets/')
    ? new URL(`../${name}`, import.meta.url)
    : new URL(`../web/${name}`, import.meta.url);

  const buf = await readFile(file).catch(() => null);
  if (!buf) return send(res, 404, 'text/plain', 'No existe');
  send(res, 200, TYPES[extname(name)] ?? 'application/octet-stream', buf);
});

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

server.listen(PORT, () => {
  console.log(`\n  Generador de badges en ${BASE}\n`);
});
