// Metadatos de la página. Se testean por la misma razón que el <select> de
// roles: no hay servidor que valide nada, así que un canonical con el dominio
// equivocado o un <link rel="icon"> apuntando a un PNG que no existe no dan
// error en ningún lado. Se ven mal en LinkedIn dos semanas después, si alguien
// mira.
//
// El HTML es estático y no se plantilla, así que SITE_URL está escrita a mano
// en cuatro lugares más. Esto es lo que impide que se separen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { SITE_URL, ICONS, EVENT } from '../web/theme.mjs';

const leer = (nombre) => readFile(new URL(`../web/${nombre}`, import.meta.url), 'utf8');

const html = await leer('index.html');
const robots = await leer('robots.txt');
const sitemap = await leer('sitemap.xml');

/** Valor de un <meta name="…"> o <meta property="…">, tolerante al orden y a los saltos de línea. */
function meta(clave) {
  const re = new RegExp(
    `<meta[^>]*(?:name|property)="${clave}"[^>]*content="([^"]*)"|` +
      `<meta[^>]*content="([^"]*)"[^>]*(?:name|property)="${clave}"`,
    's',
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

test('canonical y og:url son exactamente SITE_URL', () => {
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
  assert.equal(canonical, SITE_URL, 'el <link rel="canonical"> no coincide con SITE_URL');
  assert.equal(meta('og:url'), SITE_URL, 'og:url no coincide con SITE_URL');
});

// Sin esto el link que la gente pega en LinkedIn sale con el dominio por el que
// entró —el de CloudFront, por ejemplo— en vez del dominio real.
test('BADGE_SITE_URL fija el dominio real', () => {
  const fijado = html.match(/window\.BADGE_SITE_URL\s*=\s*'([^']+)'/)?.[1];
  assert.equal(fijado, SITE_URL, 'window.BADGE_SITE_URL no coincide con SITE_URL');
});

test('robots.txt apunta al sitemap del mismo dominio', () => {
  assert.match(robots, /^User-agent: \*$/m);
  const declarado = robots.match(/^Sitemap:\s*(\S+)$/m)?.[1];
  assert.equal(declarado, `${SITE_URL}sitemap.xml`);
});

test('el sitemap declara la home y nada más', () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [SITE_URL]);
});

test('están el título y las descripciones que se ven al compartir', () => {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title, 'falta el <title>');
  assert.match(title, /AWS Student Community Day/);

  // Google corta alrededor de los 160 caracteres, y por debajo de 70 se está
  // desperdiciando el único texto que aparece en el resultado de búsqueda.
  const description = meta('description');
  assert.ok(description, 'falta la meta description');
  assert.ok(
    description.length >= 70 && description.length <= 160,
    `la description mide ${description.length} caracteres; conviene entre 70 y 160`,
  );

  for (const clave of ['og:title', 'og:description', 'og:type', 'og:site_name']) {
    assert.ok(meta(clave), `falta ${clave}`);
  }
});

// summary_large_image sin og:image muestra un recuadro vacío. Las dos cosas se
// cambian juntas o ninguna.
test('el tipo de tarjeta de Twitter concuerda con haber o no og:image', () => {
  const card = meta('twitter:card');
  assert.ok(card, 'falta twitter:card');
  if (meta('og:image')) {
    assert.equal(card, 'summary_large_image', 'hay og:image: la tarjeta debería ser grande');
  } else {
    assert.equal(card, 'summary', 'no hay og:image: summary_large_image saldría vacía');
  }
});

test('cada ícono declarado en el HTML existe y está en ICONS', async () => {
  const declarados = [...html.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map(
    (m) => m[0].match(/href="([^"]+)"/)?.[1],
  );
  assert.ok(declarados.length > 0, 'el HTML no declara ningún ícono');

  for (const href of declarados) {
    const nombre = href.replace('./assets/', '');
    assert.ok(ICONS.includes(nombre), `el HTML usa "${href}" pero no está en ICONS`);
    await stat(new URL(`../assets/${nombre}`, import.meta.url));
  }

  for (const nombre of ICONS) {
    assert.ok(
      declarados.some((href) => href.endsWith(nombre)),
      `ICONS trae "${nombre}" pero el HTML no lo declara`,
    );
  }
});

// El JSON-LD es lo único que le dice al crawler cuándo y dónde es el evento: la
// página no tiene copy propio a propósito. Y es texto suelto dentro de un
// <script>, así que una coma de más no da error en ninguna parte —el navegador
// ni lo mira— y Google lo descarta en silencio. De ahí el JSON.parse.
test('el JSON-LD parsea y concuerda con theme.mjs', () => {
  const bloque = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(bloque, 'no se encontró el bloque JSON-LD');

  const datos = JSON.parse(bloque);
  assert.equal(datos.url, SITE_URL, 'el JSON-LD declara otra URL que SITE_URL');
  assert.equal(datos['@type'], 'WebApplication');

  // El evento va anidado a propósito: la página es una herramienta, no una
  // página de evento. Si algún día pasa a ser el @type de arriba, es una
  // decisión de producto y este assert la obliga a ser explícita.
  assert.equal(datos.about['@type'], 'Event');
  assert.match(datos.about.name, new RegExp(EVENT.name));
  assert.equal(
    datos.about.startDate,
    EVENT.startDate,
    'la fecha del JSON-LD se separó de EVENT.startDate',
  );
});

// Las dos son la misma fecha en dos formatos, y solo una la puede leer Google.
test('EVENT.startDate es la misma fecha que EVENT.date', () => {
  assert.match(EVENT.startDate, /^\d{4}-\d{2}-\d{2}$/, 'startDate no está en ISO 8601');

  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const [año, mes, día] = EVENT.startDate.split('-');

  assert.match(EVENT.date, new RegExp(`\\b${Number(día)}\\b`), 'el día no coincide');
  assert.match(EVENT.date, new RegExp(meses[Number(mes) - 1], 'i'), 'el mes no coincide');
  assert.match(EVENT.date, new RegExp(año), 'el año no coincide');
});
