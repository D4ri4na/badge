// Arma dist/, listo para `aws s3 sync --delete ./dist/ s3://$BUCKET/`.
//
//   pnpm build
//
// No hay bundler ni transformación: es una copia. web/ entero pasa tal cual a
// la raíz de dist/ (incluye web/assets/logo-AWS-CD-Bo-white.svg). De la
// carpeta raíz assets/ solo se copian los PNG de producción, derivados de
// web/theme.mjs en vez de una lista hardcodeada, para que agregar un rol no
// requiera acordarse de tocar también este script.
//
// Lo que queda afuera por construcción: frame-volunteer.png (export crudo de
// diseño) y ref-*.jpeg (referencias internas). No están en ROLE_TEXT ni en
// BASE_FRAME/MASCOT, así que nunca se copian.

import { fileURLToPath } from 'node:url';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { BACKGROUNDS, POSES, LOGO, ICONS, ROLE_TEXT } from '../web/theme.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const WEB = root('web');
const ASSETS = root('assets');
const DIST = root('dist');

await rm(DIST, { recursive: true, force: true });
await cp(WEB, DIST, { recursive: true });

const roleAssets = [...Object.values(BACKGROUNDS), ...Object.values(POSES), LOGO, ...Object.values(ROLE_TEXT), ...ICONS];
const distAssets = root('dist/assets');
await mkdir(distAssets, { recursive: true });

for (const name of roleAssets) {
  const src = `${ASSETS}/${name}`;
  await stat(src); // falla fuerte si diseño todavía no exportó este PNG.
  await cp(src, `${distAssets}/${name}`);
}

console.log(`dist/ armado: web/ completo + ${roleAssets.length} imágenes de assets/`);
