// Composición del badge en canvas: foto (o placa de mascota) → velo → marco →
// texto del rol.
//
// Es el único render del producto. La vista previa y el archivo que se descarga
// salen de la misma función `paint()`, con el mismo cálculo de encuadre, y solo
// se diferencian en el tamaño del lienzo. No hay una segunda implementación en
// ningún lado con la que quedar desincronizado: lo que ves es literalmente lo
// que bajás, dibujado más grande.
//
// El diseño no está acá: son PNGs transparentes que exporta el equipo de
// diseño. Este archivo solo los recoloca.

import {
  CANVAS,
  BANDS,
  SCRIM,
  PHOTO,
  MASCOT,
  BASE_FRAME,
  JPEG_QUALITY,
  resolveFormat,
  resolveRoleText,
  DEFAULT_ROLE,
} from './theme.mjs';
import { coverCrop } from './framing.mjs';

const ASSETS = window.BADGE_ASSETS_URL ?? './assets';

// --- Carga de assets ---

const images = new Map();

/**
 * `crossOrigin` va siempre, incluso si los assets salen del mismo origen (donde
 * no cambia nada). Sin esto, el día que se sirvan desde otro dominio el canvas
 * queda contaminado y `toBlob()` tira SecurityError: la vista previa se vería
 * perfecta y la descarga no funcionaría nunca. Es un modo de fallar difícil de
 * diagnosticar y sale gratis prevenirlo.
 */
function loadImage(name) {
  if (!images.has(name)) {
    images.set(
      name,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`No se pudo cargar ${name}`));
        img.src = `${ASSETS}/${name}`;
      }),
    );
  }
  return images.get(name);
}

/**
 * Marco, texto del rol y mascota, listos para dibujar.
 *
 * Si alguno no carga se sigue sin él en vez de romper: un badge sin marco es
 * un defecto visible y recuperable; una página en blanco no.
 */
export async function loadArt(role) {
  const opcional = (p) => p.catch((err) => (console.warn(err.message), null));
  const [frame, text, mascot] = await Promise.all([
    opcional(loadImage(BASE_FRAME)),
    opcional(loadImage(resolveRoleText(role ?? DEFAULT_ROLE))),
    opcional(loadImage(MASCOT.asset)),
  ]);
  return { frame, text, mascot };
}

// --- Saturación ---

// `ctx.filter` es lo barato y lo que usa la GPU, pero Safari lo soporta recién
// desde la 17. Como acá el canvas ya no es una aproximación sino el producto
// final, no alcanza con que se vea distinto en un navegador viejo: se hace a
// mano con la misma matriz que usa CSS (feColorMatrix type="saturate").
const HAS_FILTER = (() => {
  try {
    const c = document.createElement('canvas').getContext('2d');
    c.filter = 'saturate(50%)';
    return c.filter !== 'none' && c.filter !== '';
  } catch {
    return false;
  }
})();

function desaturateManual(ctx, size, s) {
  const data = ctx.getImageData(0, 0, size.w, size.h);
  const px = data.data;
  const [lr, lg, lb] = [0.213, 0.715, 0.072];
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const luma = lr * r + lg * g + lb * b;
    px[i] = luma + (r - luma) * s;
    px[i + 1] = luma + (g - luma) * s;
    px[i + 2] = luma + (b - luma) * s;
  }
  ctx.putImageData(data, 0, 0);
}

// --- Piezas ---

async function drawPhoto(ctx, size, { bitmap, focus, zoom, hq }) {
  // Las fotos con transparencia van sobre blanco. Sin esto, un headshot
  // recortado en PNG queda sobre negro.
  ctx.fillStyle = PHOTO.matte;
  ctx.fillRect(0, 0, size.w, size.h);

  const src = { width: bitmap.width, height: bitmap.height };
  const crop = coverCrop(src, size, { focus, zoom });

  if (HAS_FILTER) ctx.filter = `saturate(${PHOTO.saturation * 100}%)`;

  // En la descarga se recorta y escala en un solo paso con `createImageBitmap`,
  // que hace un remuestreo de verdad. Un `drawImage` que baja una foto de 4000px
  // a 1080 de una sola vez deja aliasing bien visible en pelo y texturas.
  // Safari puede ignorar las opciones de resize: si devuelve el recorte sin
  // escalar, el drawImage de abajo lo estira igual y el resultado es correcto,
  // solo un poco menos nítido.
  const scaled = hq ? await cropBitmap(bitmap, crop, size) : null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (scaled) {
    ctx.drawImage(scaled, 0, 0, size.w, size.h);
    scaled.close?.();
  } else {
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.w, size.h);
  }

  ctx.filter = 'none';
  if (!HAS_FILTER) desaturateManual(ctx, size, PHOTO.saturation);
}

function cropBitmap(bitmap, crop, size) {
  // Los enteros evitan que el redondeo interno pida un píxel fuera de la foto,
  // que se rellenaría con transparente y dejaría una línea clara en el borde.
  const sx = Math.round(crop.sx);
  const sy = Math.round(crop.sy);
  const sw = Math.min(Math.round(crop.sw), bitmap.width - sx);
  const sh = Math.min(Math.round(crop.sh), bitmap.height - sy);
  return createImageBitmap(bitmap, sx, sy, sw, sh, {
    resizeWidth: size.w,
    resizeHeight: size.h,
    resizeQuality: 'high',
  }).catch(() => null);
}

function drawScrim(ctx, size, s) {
  const height = SCRIM.height * s;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, `rgba(0,0,0,${SCRIM.opacity})`);
  grad.addColorStop(0.55, `rgba(0,0,0,${SCRIM.opacity * 0.28})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size.w, height);
}

// Grano del fondo de la mascota. Un mosaico chico generado una sola vez y
// repetido: regenerarlo en cada dibujo costaría más que todo el resto junto.
let grainTile = null;

function grain() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const c = tile.getContext('2d');
  const data = c.createImageData(128, 128);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  c.putImageData(data, 0, 0);
  grainTile = tile;
  return tile;
}

function drawMascot(ctx, size, s, mascot) {
  // El degradado admite cualquier cantidad de paradas, repartidas parejo.
  // Con un solo color queda plano, que es un uso válido y no un error.
  const g = ctx.createLinearGradient(size.w, 0, size.w * 0.1, size.h);
  MASCOT.gradient.forEach((color, i, all) =>
    g.addColorStop(all.length === 1 ? 0 : i / (all.length - 1), color),
  );
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size.w, size.h);

  ctx.save();
  ctx.globalAlpha = MASCOT.grain;
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat');
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.restore();

  if (!mascot) return;
  const target = size.w * MASCOT.width;
  const h = (target * mascot.height) / mascot.width;
  // Centrado en el espacio libre entre el logo y la ola, no en el alto total:
  // así queda bien tanto en 4:5 como en 9:16, que tiene mucho más aire.
  const freeBottom = size.h - (CANVAS.h - BANDS.bottomStart) * s;
  const top = BANDS.topEnd * s + (freeBottom - BANDS.topEnd * s - h) / 2;
  ctx.drawImage(mascot, (size.w - target) / 2, top, target, h);
}

/**
 * Dibuja el marco. En 4:5 va estirado al lienzo; en formatos más altos se parte
 * en las dos bandas con dibujo —logo arriba, ola abajo— y se separan, porque el
 * medio es transparente y solo muestra foto. Estirarlo no pierde nada y evita
 * pedirle a diseño un export por formato.
 */
function drawBanded(ctx, size, s, img) {
  if (!img) return;
  const isFeed = Math.abs(size.h / size.w - CANVAS.h / CANVAS.w) < 0.001;
  if (isFeed) {
    ctx.drawImage(img, 0, 0, size.w, size.h);
    return;
  }
  const bh = CANVAS.h - BANDS.bottomStart;
  ctx.drawImage(img, 0, 0, CANVAS.w, BANDS.topEnd, 0, 0, size.w, BANDS.topEnd * s);
  ctx.drawImage(img, 0, BANDS.bottomStart, CANVAS.w, bh, 0, size.h - bh * s, size.w, bh * s);
}

// --- Render ---

/**
 * Pinta el badge completo sobre un contexto ya dimensionado.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{w:number,h:number}} size  medidas del lienzo destino
 * @param {object} state  { bitmap, art, focus, zoom, hq }
 *   bitmap null = modo mascota · hq = remuestreo caro, solo para la descarga
 */
export async function paint(ctx, size, state) {
  // Las medidas del diseño (BANDS, SCRIM) están en el sistema del marco 4:5 a
  // 1080 de ancho. `s` las lleva al lienzo que toque.
  const s = size.w / CANVAS.w;
  ctx.clearRect(0, 0, size.w, size.h);

  if (state.bitmap) {
    await drawPhoto(ctx, size, state);
    // El velo solo aplica al modo foto: el fondo de la mascota ya es oscuro y
    // el logo se lee sin problema.
    drawScrim(ctx, size, s);
  } else {
    drawMascot(ctx, size, s, state.art?.mascot);
  }

  drawBanded(ctx, size, s, state.art?.frame);
  drawBanded(ctx, size, s, state.art?.text);
}

/**
 * El badge final, a resolución completa y listo para descargar.
 * @returns {Promise<Blob>} JPEG
 */
export async function renderBadge({ layout, ...state }) {
  const size = resolveFormat(layout);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;

  await paint(canvas.getContext('2d'), size, { ...state, hq: true });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('El navegador no pudo generar la imagen.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}
