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
  contentBox,
  resolveBackground,
  resolvePose,
  LOGO,
  PHOTO,
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
export async function loadArt(role, background, pose) {
  const [frame, text, mascot, logo] = await Promise.all([
    loadImage(resolveBackground(background)),
    loadImage(resolveRoleText(role ?? DEFAULT_ROLE)),
    loadImage(resolvePose(pose)),
    loadImage(LOGO),
  ]);
  return { frame, text, mascot, logo };
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

// El SVG del logo ya define el área visible y conserva su proporción.
function drawLogo(ctx, size, logo) {
  if (!logo) return;
  const s = size.w / CANVAS.w;
  ctx.drawImage(logo, 260 * s, 115 * s, 560 * s, 240 * s);
}

function drawMascot(ctx, box, mascot) {
  if (!mascot) return;
  const scale = Math.min(box.w / mascot.width, box.h / mascot.height);
  const w = mascot.width * scale;
  const h = mascot.height * scale;
  ctx.drawImage(mascot, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
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
  const s = size.w / CANVAS.w;
  const box = contentBox(size);
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, size.w, size.h);
  if (state.art?.frame) ctx.drawImage(state.art.frame, 0, 0, size.w, size.h);

  if (state.bitmap) {
    ctx.save();
    try {
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, 32 * s);
      ctx.clip();
      ctx.translate(box.x, box.y);
      await drawPhoto(ctx, { w: box.w, h: box.h }, state);
    } finally {
      ctx.restore();
    }
  } else {
    drawMascot(ctx, box, state.art?.mascot);
  }

  drawLogo(ctx, size, state.art?.logo);
  if (state.art?.text) {
    ctx.drawImage(state.art.text, 0, 1100, 1080, 250,
      0, size.h - 250 * s, size.w, 250 * s);
  }
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
