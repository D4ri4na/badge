// Genera los íconos del navegador a partir del perezoso.
//
//   node scripts/build-icons.mjs
//
// La mascota es lo único cuadrado y reconocible que tiene el producto: el logo
// del evento es 1670x499 y a 32px no se lee. Y como el badge sin foto ya muestra
// al perezoso sobre la placa azul, la pestaña termina pareciéndose a lo que la
// página hace.
//
// Dos recortes antes de escalar, los dos por lo mismo: que a 32px se vea algo.
//
// 1. Al alfa real. El PNG de origen trae mucho aire alrededor (sale de un
//    recorte por inundación, ver cutout-mascot.mjs).
// 2. Al cuadrado superior. Ya recortada, la mascota es 668x958: metida entera
//    en un ícono cuadrado queda una figurita alta y flaca con dos franjas de
//    fondo a los costados, y a 32px la cara mide seis píxeles. Quedándose con
//    el cuadrado de arriba —sombrero, cara y torso— el dibujo llena el ícono.
//
// Corre en build, nunca en el navegador. Los PNG quedan versionados: solo hace
// falta volver a correr esto si cambia la mascota.

import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MASCOT, ICONS } from '../web/theme.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// Misma placa que el badge sin foto, para que el ícono y el producto combinen.
const PLATE = MASCOT.gradient[0];

// Aire alrededor, en fracción del lado. Los íconos se recortan en círculo en
// varias plataformas (Android, algunos lanzadores), así que el dibujo no puede
// llegar al borde.
const MARGIN = 0.12;

const SIZES = {
  'favicon-32.png': 32,
  'favicon-192.png': 192,
  'apple-touch-icon.png': 180,
};

// La lista de archivos es la de theme.mjs, que es la que lee scripts/build.mjs.
// Si alguien agrega un nombre allá y se olvida del tamaño acá, corta el build en
// vez de dejar un <link> apuntando a un PNG que nunca se escribió.
for (const name of ICONS) {
  if (!SIZES[name]) throw new Error(`ICONS declara "${name}" pero no tiene tamaño en SIZES`);
}

// Los dos recortes, una sola vez para todos los tamaños.
const trimmed = await sharp(root(`assets/${MASCOT.asset}`)).trim({ threshold: 1 }).toBuffer();
const { width, height } = await sharp(trimmed).metadata();
console.log(`mascota recortada a ${width}x${height}`);

const side = Math.min(width, height);
const square = await sharp(trimmed)
  .extract({ left: Math.round((width - side) / 2), top: 0, width: side, height: side })
  .toBuffer();

for (const name of ICONS) {
  const size = SIZES[name];
  const inner = Math.round(size * (1 - 2 * MARGIN));

  const art = await sharp(square)
    .resize(inner, inner, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: PLATE },
  })
    .composite([{ input: art, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp(png).toFile(root(`assets/${name}`));
  console.log(`assets/${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
