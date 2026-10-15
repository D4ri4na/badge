// Recorta el fondo del perezoso y deja assets/mascot.png con transparencia real.
//
// El PNG que llegó tiene canal alfa pero 0% de píxeles no-opacos: el gris está
// horneado, así que como sticker no sirve.
//
//   node scripts/cutout-mascot.mjs
//
// Dos decisiones que importan:
//
// 1. Relleno por inundación desde los bordes, no reemplazo global de color. El
//    personaje tiene grises en las sombras del pelaje; un color-key global le
//    haría agujeros. Inundando desde afuera solo se borra lo que está conectado
//    al borde, que es el fondo por definición.
//
// 2. Alfa gradual en vez de corte binario. Entre INNER y OUTER el alfa sube de
//    0 a 255, lo que reconstruye el antialias del borde del sticker. Con un
//    corte duro quedaría un contorno escalonado.

import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SRC = fileURLToPath(new URL('../docs/peresoso.png', import.meta.url));
const OUT = fileURLToPath(new URL('../assets/mascot.png', import.meta.url));

// Medido sobre el borde de la imagen: distancia mediana 2.6, máxima 10.6.
const INNER = 16; // por debajo: fondo puro
const OUTER = 44; // por encima: sticker

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const at = (x, y) => (y * W + x) * 4;

// Color de referencia del fondo, muestreado en el perímetro.
const samples = [];
for (let x = 0; x < W; x += 7) samples.push(at(x, 0), at(x, H - 1));
for (let y = 0; y < H; y += 7) samples.push(at(0, y), at(W - 1, y));
const ref = [0, 1, 2].map(
  (c) => samples.reduce((sum, i) => sum + data[i + c], 0) / samples.length,
);

const distance = (i) =>
  Math.hypot(data[i] - ref[0], data[i + 1] - ref[1], data[i + 2] - ref[2]);

// Inundación desde el perímetro sobre los píxeles parecidos al fondo.
const visited = new Uint8Array(W * H);
const queue = new Int32Array(W * H);
let head = 0;
let tail = 0;

const push = (x, y) => {
  const p = y * W + x;
  if (visited[p]) return;
  if (distance(p * 4) >= OUTER) return;
  visited[p] = 1;
  queue[tail++] = p;
};

for (let x = 0; x < W; x++) {
  push(x, 0);
  push(x, H - 1);
}
for (let y = 0; y < H; y++) {
  push(0, y);
  push(W - 1, y);
}

while (head < tail) {
  const p = queue[head++];
  const x = p % W;
  const y = (p - x) / W;
  if (x > 0) push(x - 1, y);
  if (x < W - 1) push(x + 1, y);
  if (y > 0) push(x, y - 1);
  if (y < H - 1) push(x, y + 1);
}

// Alfa gradual solo en lo alcanzado por la inundación.
let cleared = 0;
let partial = 0;
for (let p = 0; p < W * H; p++) {
  if (!visited[p]) continue;
  const i = p * 4;
  const d = distance(i);
  const alpha = Math.round(Math.min(1, Math.max(0, (d - INNER) / (OUTER - INNER))) * 255);
  data[i + 3] = alpha;
  if (alpha === 0) cleared++;
  else partial++;
}

// El arte traía una estrellita decorativa suelta abajo a la derecha. Como no
// toca el borde, la inundación la respetó —correctamente, no es fondo— pero
// como sticker sobra. En vez de borrar esas coordenadas a mano, se etiquetan
// los grupos conectados de píxeles opacos y se descarta todo lo que no sea el
// más grande: así cae cualquier mota suelta, no solo esa.
const SOLID = 24; // alfa mínimo para considerar que un píxel es del sticker

const label = new Int32Array(W * H).fill(-1);
const sizes = [];

for (let start = 0; start < W * H; start++) {
  if (label[start] !== -1 || data[start * 4 + 3] < SOLID) continue;
  const id = sizes.length;
  let count = 0;
  let qh = 0;
  let qt = 0;
  queue[qt++] = start;
  label[start] = id;

  while (qh < qt) {
    const p = queue[qh++];
    count++;
    const x = p % W;
    const y = (p - x) / W;
    const neighbours = [];
    if (x > 0) neighbours.push(p - 1);
    if (x < W - 1) neighbours.push(p + 1);
    if (y > 0) neighbours.push(p - W);
    if (y < H - 1) neighbours.push(p + W);
    for (const n of neighbours) {
      if (label[n] === -1 && data[n * 4 + 3] >= SOLID) {
        label[n] = id;
        queue[qt++] = n;
      }
    }
  }
  sizes.push(count);
}

const biggest = sizes.indexOf(Math.max(...sizes));
let dropped = 0;
for (let p = 0; p < W * H; p++) {
  if (label[p] !== -1 && label[p] !== biggest) {
    data[p * 4 + 3] = 0;
    dropped++;
  }
}
console.log(
  `grupos conectados: ${sizes.length} · se conserva el mayor (${sizes[biggest]} px) · ` +
    `descartados: ${dropped} px`,
);

await sharp(data, { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

const total = W * H;
console.log(`gris de referencia: ${ref.map((v) => v.toFixed(0)).join(',')}`);
console.log(
  `transparente: ${((100 * cleared) / total).toFixed(1)}% · ` +
    `borde gradual: ${partial} px · opaco: ${((100 * (total - cleared - partial)) / total).toFixed(1)}%`,
);
console.log('assets/mascot.png escrito');
