// Configuración y texto para redes. Son funciones puras y baratísimas de
// probar, y es lo que se toca al agregar un rol.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCaption,
  hasFrame,
  availableRoles,
  resolveFormat,
  resolveRoleText,
  ROLE_TEXT,
  FORMATS,
  DEFAULT_ROLE,
  EVENT,
} from '../web/theme.mjs';

test('todos los roles declarados tienen su PNG de texto', () => {
  for (const role of availableRoles()) {
    assert.match(resolveRoleText(role), /^text-.+\.png$/);
  }
});

test('hasFrame reconoce solo los roles declarados', () => {
  assert.ok(hasFrame(DEFAULT_ROLE));
  assert.ok(!hasFrame('astronauta'));
  assert.ok(!hasFrame(undefined));
});

test('un rol desconocido cae al default en vez de romper', () => {
  assert.equal(resolveRoleText('astronauta'), ROLE_TEXT[DEFAULT_ROLE]);
});

// Sin API que valide el rol, el <select> es la única puerta de entrada: una
// opción que no esté en ROLE_TEXT no da error, da el badge equivocado. Es
// silencioso y visual, que es la peor combinación, así que se chequea acá.
test('las opciones del <select> coinciden con los roles declarados', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  const bloque = html.match(/<select id="role">([\s\S]*?)<\/select>/);
  assert.ok(bloque, 'no se encontró el <select id="role"> en index.html');

  const opciones = [...bloque[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(opciones.length > 0, 'el <select> de roles quedó vacío');

  for (const role of opciones) {
    assert.ok(hasFrame(role), `la UI ofrece "${role}" pero no está en ROLE_TEXT`);
  }
  for (const role of availableRoles()) {
    assert.ok(opciones.includes(role), `"${role}" está en ROLE_TEXT pero no en el <select>`);
  }
});

test('un formato desconocido cae al 4:5', () => {
  assert.deepEqual(resolveFormat('cuadrado'), FORMATS.feed);
  assert.deepEqual(resolveFormat(undefined), FORMATS.feed);
});

// El caption es lo que cada asistente pega en LinkedIn junto con el badge que
// descargó. Como no hay nada alojado, ese texto es todo el alcance que el
// generador puede darse a sí mismo: si el link se rompe, nadie llega acá.
test('el caption lleva el link en su propia línea', () => {
  const url = 'https://example.test/b/abc';
  const caption = buildCaption({ role: 'speaker', url });
  // Algunas plataformas absorben el link si queda pegado al texto.
  const line = caption.split('\n').find((l) => l.includes(url));
  assert.ok(line, 'el link no aparece en el caption');
  assert.ok(line.trim().endsWith(url), `el link debería cerrar su línea: "${line}"`);
});

test('el caption nombra el rol y el evento en los dos idiomas', () => {
  const es = buildCaption({ role: 'volunteer', locale: 'es' });
  assert.match(es, /voluntario\/a/);
  assert.match(es, new RegExp(EVENT.name));

  const en = buildCaption({ role: 'volunteer', locale: 'en' });
  assert.match(en, /a volunteer/);
});

test('el caption funciona sin argumentos', () => {
  assert.ok(buildCaption().length > 0);
});

test('cada rol tiene su forma de nombrarse en el caption', () => {
  for (const role of availableRoles()) {
    const caption = buildCaption({ role, locale: 'es' });
    const fallback = buildCaption({ role: 'astronauta', locale: 'es' });
    if (role !== DEFAULT_ROLE) {
      assert.notEqual(caption, fallback, `el rol "${role}" no tiene entrada en ROLE_COPY`);
    }
  }
});
