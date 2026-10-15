// Borra la línea del rol del marco oficial y deja assets/frame-base.png.
//
// El marco que exporta diseño trae "Soy Voluntario/a en el / AWS Community Day
// Bolivia" horneado, así que sirve para un solo rol. Esto lo despega para que
// el texto se componga aparte y un mismo marco valga para todos.
//
// No se puede rellenar con un color plano: el verde tiene degradado vertical
// (37,72,60 arriba → 18,33,28 abajo) y grano. Se interpola el degradado entre
// las filas limpias de arriba y abajo, y se le devuelve el grano como ruido
// sintético con la misma desviación que el grano real del marco.
//
// Primero intenté copiar el grano de la franja limpia de abajo: reutilizar las
// mismas filas correlaciona las columnas y salen estrías verticales. El ruido
// generado no tiene estructura y a esta escala se ve igual.
//
//   node scripts/strip-role-text.mjs

import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// sharp no acepta objetos URL, solo rutas.
const SRC = fileURLToPath(new URL('../assets/frame-volunteer.png', import.meta.url));
const OUT = fileURLToPath(new URL('../assets/frame-base.png', import.meta.url));

// Caja del bloque de texto, medida sobre el PNG, con margen.
const BOX = { x0: 48, x1: 614, y0: 1206, y1: 1312 };
// Filas limpias inmediatamente arriba y abajo, de donde sale el degradado.
const TOP_ROW = 1204;
const BOTTOM_ROW = 1314;
// Franja limpia bajo el texto, de donde se copia el grano.
const GRAIN = { y0: 1316, y1: 1349 };

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W } = info;
const at = (x, y) => (y * W + x) * 4;

// Desviación típica del grano real, medida sobre la franja limpia de abajo.
// Se estima con la diferencia entre píxeles vecinos: para ruido independiente,
// std(diferencia) = std(ruido) * raíz(2), y así el degradado de fondo no la
// contamina.
const sigma = [0, 1, 2].map((c) => {
  let sum = 0;
  let n = 0;
  for (let y = GRAIN.y0; y < GRAIN.y1; y++) {
    for (let x = BOX.x0; x < BOX.x1; x++) {
      const d = data[at(x, y) + c] - data[at(x + 1, y) + c];
      sum += d * d;
      n++;
    }
  }
  return Math.sqrt(sum / n / 2);
});
console.log('grano medido (sigma RGB):', sigma.map((s) => s.toFixed(1)).join(', '));

// Ruido gaussiano por Box-Muller.
const gauss = () => {
  const u = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

/**
 * Perfil de color limpio de una banda: promedia varias filas y después suaviza
 * horizontalmente. Sin esto el ruido de las filas de origen se estira 106 filas
 * hacia abajo y salen estrías verticales — que fue exactamente lo que pasó en
 * el primer intento.
 */
function profile(yStart, rows) {
  const raw = [];
  for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0];
    for (let y = yStart; y < yStart + rows; y++) {
      const i = at(x, y);
      acc[0] += data[i];
      acc[1] += data[i + 1];
      acc[2] += data[i + 2];
    }
    raw.push(acc.map((v) => v / rows));
  }

  const R = 20; // media móvil de 41px: alcanza para borrar el grano
  return raw.map((_, x) => {
    const acc = [0, 0, 0];
    let n = 0;
    for (let k = Math.max(0, x - R); k <= Math.min(W - 1, x + R); k++) {
      acc[0] += raw[k][0];
      acc[1] += raw[k][1];
      acc[2] += raw[k][2];
      n++;
    }
    return acc.map((v) => v / n);
  });
}

const topProfile = profile(TOP_ROW - 8, 9);
const bottomProfile = profile(BOTTOM_ROW, 9);

for (let y = BOX.y0; y <= BOX.y1; y++) {
  const t = (y - TOP_ROW) / (BOTTOM_ROW - TOP_ROW);

  for (let x = BOX.x0; x <= BOX.x1; x++) {
    const o = at(x, y);
    for (let c = 0; c < 3; c++) {
      const base = topProfile[x][c] * (1 - t) + bottomProfile[x][c] * t;
      const value = base + gauss() * sigma[c];
      data[o + c] = Math.max(0, Math.min(255, Math.round(value)));
    }
    data[o + 3] = 255;
  }
}

await sharp(data, { raw: { width: W, height: info.height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log('assets/frame-base.png escrito');
