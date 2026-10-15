// Renderiza el bloque de texto de cada rol a un PNG transparente de 1080x1350,
// listo para componerse sobre assets/frame-base.png.
//
// Corre en build, no en Lambda: satori y resvg son devDependencies y nunca
// viajan al zip. En producción la Lambda solo compone PNGs ya hechos, así que
// esto no suma ni una dependencia de runtime ni milisegundos de render.
//
//   node scripts/build-role-text.mjs
//
// La tipografía es Amazon Ember (verificado comparando formas contra el texto
// horneado del marco v4). El marco parece usar el peso Medium, que AWS no
// publica en su CDN, así que se usa Regular y se compensa con tracking hasta
// igualar el ancho medido.
//
// En vez de hardcodear tamaños, el script se calibra solo: busca el tamaño que
// iguala el alto medido en el marco y después el tracking que iguala el ancho.
// Si diseño reexporta el marco con otra tipografía, se actualizan los TARGETS
// y vuelve a cuadrar.

import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { CANVAS, EVENT } from '../web/theme.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// Cajas medidas sobre assets/frame-volunteer.png, que es la referencia.
const TARGETS = {
  lead: { text: 'Soy Voluntario/a en el', x: 63, y: 1215, w: 418, h: 38 },
  name: { text: EVENT.name, x: 61, y: 1265, w: 538, h: 40 },
};

// Primera línea de cada rol. La segunda es siempre el nombre del evento.
const LEADS = {
  volunteer: 'Soy Voluntario/a en el',
  speaker: 'Soy Speaker en el',
  attendee: 'Voy a estar en el',
  organizer: 'Soy Organizador/a del',
  sponsor: 'Somos Sponsor del',
  ally: 'Somos Comunidad Aliada del',
};

const fonts = [
  { name: 'Ember', data: await readFile(root('fonts/AmazonEmber_Rg.woff')), weight: 400, style: 'normal' },
];

const el = (type, style, children) => ({ type, props: { style, children } });

/** Renderiza una línea suelta y la recorta a la caja real de los glifos. */
async function renderLine(text, size, tracking) {
  const svg = await satori(
    el(
      'div',
      {
        display: 'flex',
        fontFamily: 'Ember',
        fontWeight: 400,
        fontSize: size,
        letterSpacing: tracking,
        color: '#FFFFFF',
        lineHeight: 1.6,
      },
      text,
    ),
    { width: 1400, height: Math.ceil(size * 3), fonts },
  );
  const png = new Resvg(svg).render().asPng();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let minX = Infinity;
  let maxX = 0;
  let minY = Infinity;
  let maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 120) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return {
    w,
    h,
    buffer: await sharp(png).extract({ left: minX, top: minY, width: w, height: h }).png().toBuffer(),
  };
}

/** Busca tamaño (por alto) y tracking (por ancho) que reproducen la caja medida. */
async function calibrate(target) {
  let size = target.h;
  for (let i = 0; i < 12; i++) {
    const { h } = await renderLine(target.text, size, 0);
    if (h === target.h) break;
    size += h < target.h ? 1 : -1;
  }

  const { w } = await renderLine(target.text, size, 0);
  const gaps = Math.max(1, [...target.text].length - 1);
  const tracking = Number(((target.w - w) / gaps).toFixed(2));

  const check = await renderLine(target.text, size, tracking);
  console.log(
    `  calibrado: tamaño ${size}, tracking ${tracking} -> ${check.w}x${check.h}` +
      ` (objetivo ${target.w}x${target.h})`,
  );
  return { size, tracking };
}

console.log('Calibrando contra el marco original…');
const lead = await calibrate(TARGETS.lead);
const name = await calibrate(TARGETS.name);

for (const [role, text] of Object.entries(LEADS)) {
  const l = await renderLine(text, lead.size, lead.tracking);
  const n = await renderLine(EVENT.name, name.size, name.tracking);

  const png = await sharp({
    create: { width: CANVAS.w, height: CANVAS.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: l.buffer, left: TARGETS.lead.x, top: TARGETS.lead.y },
      { input: n.buffer, left: TARGETS.name.x, top: TARGETS.name.y },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(root(`assets/text-${role}.png`), png);
  console.log(`assets/text-${role}.png  ${(png.length / 1024).toFixed(0)} KB`);
}
