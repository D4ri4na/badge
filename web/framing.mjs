// Matemática del encuadre. Funciones puras, sin canvas ni DOM: es lo único del
// render que se puede probar con `node --test`, así que acá va todo lo que
// tiene una respuesta correcta y verificable.
//
// El resultado es siempre un rectángulo en coordenadas de la foto original
// —qué pedazo de la foto se ve— y no un desplazamiento del lienzo. Trabajar en
// el espacio de la foto es lo que después deja recortar y escalar en un solo
// paso, sin materializar una copia gigante de la imagen ampliada.

import { PHOTO, QUALITY } from './theme.mjs';

/**
 * Pedazo de la foto que llena el lienzo, tipo `cover`, alrededor de un punto
 * de enfoque.
 *
 * @param {{width:number,height:number}} src   medidas de la foto
 * @param {{w:number,h:number}} out            medidas del lienzo
 * @param {{focus?:{x:number,y:number}, zoom?:number}} opts
 *   focus en fracciones 0..1 sobre la foto; zoom 1 = el mínimo que cubre.
 * @returns {{sx:number, sy:number, sw:number, sh:number}} recorte en píxeles
 *   de la foto original, siempre dentro de sus bordes.
 */
export function coverCrop(src, out, opts = {}) {
  const focus = { ...PHOTO.focus, ...(opts.focus ?? {}) };
  const zoom = clamp(opts.zoom ?? 1, 1, PHOTO.maxZoom);

  // Píxeles del lienzo por píxel de la foto. El máximo de las dos razones es
  // lo que garantiza que no queden huecos: el diseño es a sangre completa.
  const scale = Math.max(out.w / src.width, out.h / src.height) * zoom;

  // Ventana visible sobre la foto. El mínimo con las medidas de la foto cubre
  // el caso degenerado de una imagen más chica que el lienzo, donde la ventana
  // calculada se pasaría de los bordes.
  const sw = Math.min(src.width, out.w / scale);
  const sh = Math.min(src.height, out.h / scale);

  return {
    sx: clamp(src.width * focus.x - sw / 2, 0, src.width - sw),
    sy: clamp(src.height * focus.y - sh / 2, 0, src.height - sh),
    sw,
    sh,
  };
}

/**
 * Cuánto hay que mover el foco para que la foto se desplace `dx`/`dy` píxeles
 * de lienzo. Lo usa el arrastre, que piensa en píxeles de pantalla y necesita
 * traducirlos al 0..1 del foco.
 */
export function panFocus(focus, { dx, dy }, src, out, zoom = 1) {
  const { sw, sh } = coverCrop(src, out, { focus, zoom });
  const scale = out.w / sw; // píxeles de lienzo por píxel de foto
  return {
    x: clamp(focus.x - dx / scale / src.width, 0, 1),
    y: clamp(focus.y - dy / scale / src.height, 0, 1),
  };
}

/**
 * Avisos accionables sobre la foto elegida. No bloquean nada: es el usuario
 * quien decide si sube otra.
 *
 * Es una lista corta porque sin detección de caras no hay mucho más que se
 * pueda afirmar con honestidad. Los avisos de "estás muy cerca" o "no
 * detectamos una cara" salían de Rekognition; decirlos a ojo sería inventar.
 */
export function inspectPhoto({ width, height }) {
  const warnings = [];
  const shortSide = Math.min(width, height);

  if (shortSide < QUALITY.minShortSide) {
    warnings.push({
      code: 'low-resolution',
      message: `Tu foto mide ${width}×${height}. Va a salir algo borrosa; si podés, usá una de al menos ${QUALITY.minShortSide}px de lado corto.`,
    });
  }
  return warnings;
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}
