// El encuadre es lo único del render que tiene una respuesta verificable sin
// un navegador: dado el tamaño de una foto y un lienzo, qué pedazo se ve.
//
// Lo que estos tests protegen es la promesa del diseño: la foto SIEMPRE cubre
// el lienzo entero, sin huecos ni barras, venga la foto que venga. El marco es
// a sangre completa y un solo píxel transparente en un borde se nota.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverCrop, panFocus, inspectPhoto } from '../web/framing.mjs';
import { PHOTO, QUALITY, FORMATS } from '../web/theme.mjs';

const feed = FORMATS.feed;
const story = FORMATS.story;

/** El recorte tiene la misma proporción que el lienzo y cae dentro de la foto. */
function assertCubre(src, out, crop) {
  assert.ok(crop.sx >= 0 && crop.sy >= 0, `el recorte se sale por arriba/izquierda: ${JSON.stringify(crop)}`);
  assert.ok(
    crop.sx + crop.sw <= src.width + 0.001 && crop.sy + crop.sh <= src.height + 0.001,
    `el recorte se sale por abajo/derecha: ${JSON.stringify(crop)}`,
  );
  assert.ok(crop.sw > 0 && crop.sh > 0, 'recorte vacío');
  // Misma proporción que el lienzo = la foto lo llena sin deformarse.
  assert.ok(
    Math.abs(crop.sw / crop.sh - out.w / out.h) < 0.001,
    `proporción ${crop.sw / crop.sh} contra ${out.w / out.h}`,
  );
}

const fotos = [
  { nombre: 'apaisada de celular', width: 4032, height: 3024 },
  { nombre: 'vertical de celular', width: 3024, height: 4032 },
  { nombre: 'cuadrada', width: 1200, height: 1200 },
  { nombre: 'panorámica', width: 4000, height: 1000 },
  { nombre: 'tira vertical', width: 800, height: 3000 },
  { nombre: 'exactamente 4:5', width: 1080, height: 1350 },
  { nombre: 'más chica que el lienzo', width: 400, height: 300 },
];

for (const foto of fotos) {
  for (const [layout, out] of Object.entries({ feed, story })) {
    test(`una foto ${foto.nombre} cubre el ${layout} sin huecos`, () => {
      for (const zoom of [1, 1.5, PHOTO.maxZoom]) {
        for (const focus of [{ x: 0, y: 0 }, { x: 0.5, y: 0.38 }, { x: 1, y: 1 }]) {
          assertCubre(foto, out, coverCrop(foto, out, { focus, zoom }));
        }
      }
    });
  }
}

test('el zoom se acota al tope del tema', () => {
  const foto = { width: 3000, height: 2000 };
  const tope = coverCrop(foto, feed, { zoom: PHOTO.maxZoom });
  const pasado = coverCrop(foto, feed, { zoom: PHOTO.maxZoom * 4 });
  assert.deepEqual(pasado, tope, 'un zoom fuera de rango debería quedar en el tope');

  // Y por abajo: menos de 1 dejaría la foto sin cubrir el lienzo.
  assert.deepEqual(coverCrop(foto, feed, { zoom: 0.2 }), coverCrop(foto, feed, { zoom: 1 }));
});

test('más zoom es ver menos foto', () => {
  const foto = { width: 3000, height: 2000 };
  const cerca = coverCrop(foto, feed, { zoom: 2 });
  const lejos = coverCrop(foto, feed, { zoom: 1 });
  assert.ok(cerca.sw < lejos.sw, 'acercarse debería achicar la ventana visible');
});

test('sin foco explícito manda el del tema', () => {
  const foto = { width: 2000, height: 2000 };
  assert.deepEqual(coverCrop(foto, feed), coverCrop(foto, feed, { focus: PHOTO.focus }));
});

test('arrastrar mueve el foco en contra del gesto y se frena en el borde', () => {
  const foto = { width: 4000, height: 3000 };
  const out = { w: 540, h: 675 };
  const medio = { x: 0.5, y: 0.5 };

  // Arrastrar hacia la derecha muestra lo que estaba a la izquierda.
  const derecha = panFocus(medio, { dx: 40, dy: 0 }, foto, out, 1);
  assert.ok(derecha.x < medio.x, 'el foco debería ir al revés que el dedo');

  // Y nunca se pasa del 0..1, o el recorte pediría píxeles inexistentes.
  const tope = panFocus(medio, { dx: 100000, dy: 100000 }, foto, out, 1);
  assert.deepEqual(tope, { x: 0, y: 0 });
});

test('el aviso de resolución baja mira el lado corto', () => {
  const chica = inspectPhoto({ width: 4000, height: QUALITY.minShortSide - 1 });
  assert.equal(chica.length, 1);
  assert.equal(chica[0].code, 'low-resolution');

  assert.deepEqual(inspectPhoto({ width: QUALITY.minShortSide, height: QUALITY.minShortSide }), []);
});
