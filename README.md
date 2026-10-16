# Generador de badges · AWS Student Community Day SCZ 2026

Elegís tu rol, ponés una foto y te descargás tu badge del evento.

Es una página estática: **no hay backend**. Todo —abrir la foto, encuadrarla,
componer el marco y generar el JPEG— pasa en el navegador de quien lo usa. No
hay nada que desplegar más que archivos, no hay nada que mantener andando y no
cuesta nada por badge generado.

```
web/
  index.html   la página
  app.js       eventos y estado de la UI
  render.mjs   composición en canvas (vista previa y descarga)
  framing.mjs  matemática del encuadre
  theme.mjs    la configuración de todo
assets/        los PNG que exporta diseño
```

## Qué pasa con la foto

Esta es la propiedad que define el producto, así que conviene ser preciso:

- **La foto no se sube a ningún lado.** No hay servidor al que subirla. Se abre
  con `createImageBitmap`, se dibuja en un canvas y ahí termina. Ni el EXIF ni
  la geolocalización salen del dispositivo.
- **El badge tampoco queda alojado.** Existe como un `blob:` en la pestaña. Si
  la persona no lo descarga y cierra la página, no queda nada en ninguna parte.
- **No hay logs, ni analítica, ni cuentas.** Tampoco hay a quién pedirle que
  borre nada, porque no hay nada guardado.

La contracara honesta: **no hay moderación de contenido**. La versión anterior
pasaba cada foto por Rekognition antes de componer el badge. Sin servidor eso es
imposible por construcción: nadie puede revisar una imagen que nunca sale del
dispositivo. Quien quiera armar un badge inapropiado con la marca del evento
puede hacerlo, igual que podría hacerlo con cualquier editor. Es una decisión
consciente, no un descuido.

Lo otro que se perdió es el link para compartir: no existe una URL que despliegue
el badge en LinkedIn o WhatsApp, porque no hay imagen alojada. El flujo es
descargar y publicar a mano, y el texto que ofrece la página lleva el link del
generador para que quien lo vea arme el suyo.

## SEO y cómo se ve el link

Como no hay badge alojado, **la home es el único link compartible que tiene el
producto**. Todo el ciclo depende de que alguien la pegue en LinkedIn o WhatsApp,
así que cómo se ve al pegarse no es cosmética: es el canal de distribución.

- `SITE_URL` en [web/theme.mjs](web/theme.mjs) es la URL canónica. Está escrita a
  mano en `index.html` (canonical, `og:url`, `window.BADGE_SITE_URL`), en
  `robots.txt` y en `sitemap.xml`, porque el HTML no se plantilla. Lo que impide
  que se separen es [test/seo.test.mjs](test/seo.test.mjs).
- `window.BADGE_SITE_URL` se fija en el `<head>`. Sin eso, el link que va dentro
  del "Texto para publicar" sale de `location.href`: quien entre por el dominio
  de CloudFront propaga ese dominio en su publicación.
- Los íconos del navegador salen del perezoso, generados por
  [scripts/build-icons.mjs](scripts/build-icons.mjs) y declarados en `ICONS`.
- El JSON-LD del `<head>` es lo único que le dice al crawler cuándo y dónde es el
  evento. **La página no tiene texto de contenido a propósito**: es un formulario
  y nada más, y el encabezado se dejó pelado para que arranque de una. Ahí van el
  nombre, la fecha, la sede y el link a `awscommunity.org.bo` como datos
  estructurados, que es la forma que Google pide para esto. Dejar el mismo texto
  escondido con CSS sería cloaking y se penaliza.

  Por eso `EVENT.startDate` existe además de `EVENT.date`: schema.org exige ISO
  8601 y `date` se pega tal cual en el texto para redes, así que no se puede
  reformatear. Son la misma fecha en dos formatos y se cambian juntas.

**Falta `og:image`**, así que la tarjeta sale de solo texto. Por eso el
`twitter:card` es `summary` y no `summary_large_image`, que sin imagen muestra un
recuadro vacío: las dos cosas se cambian juntas, y hay un test que lo verifica.

Queda un problema que no se arregla desde el repo: CloudFront tiene una *custom
error response* que mapea 404 a `/index.html` con status **200**, así que
cualquier URL inventada devuelve la home y Google la puede indexar como página
distinta. Esta página no tiene routing de cliente, así que ese fallback no hace
falta: conviene eliminarlo en la consola, o mapearlo a un `/404.html` con status
404. Mientras tanto, el `<link rel="canonical">` es lo que contiene el daño.

## Desarrollo local

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

`scripts/serve.mjs` no hace más que servir archivos: existe solo porque los
módulos ES no se cargan desde `file://`, así que abrir `web/index.html` a mano no
funciona. Sirve exactamente lo mismo que hay que publicar, así que si anda en
local, anda desplegado.

No hay linter ni paso de build para la web: `web/` se sirve tal cual, sin
framework ni bundler.

## Tests

```bash
pnpm test
pnpm test -- test/framing.test.mjs   # un solo archivo
```

Usan el runner que trae Node 22, así que no suman ninguna dependencia.

Cubren lo que se puede afirmar sin un navegador, que es la lógica pura:

- **`framing.test.mjs`** — que el recorte cubra siempre el lienzo entero, con
  cualquier proporción de foto, formato, zoom y punto de enfoque. El marco es a
  sangre completa: un solo píxel sin foto en un borde se ve.
- **`theme.test.mjs`** — los roles y el texto para redes.
- **`seo.test.mjs`** — que el canonical, `og:url`, `robots.txt`, `sitemap.xml` y
  `window.BADGE_SITE_URL` sigan diciendo el mismo dominio, que cada ícono
  declarado en el HTML exista en disco, y que el JSON-LD parsee y diga la misma
  fecha que `EVENT`. Un JSON-LD con una coma de más no da error en ningún lado:
  el navegador ni lo mira y Google lo descarta en silencio.

Lo que **no** cubren es la composición en canvas: `node --test` no tiene canvas,
y meter uno (`jsdom`, `node-canvas`) traería un binario nativo por un beneficio
chico. La verificación de eso es abrir `pnpm dev` y mirar. Alcanza porque la
vista previa y el archivo descargado salen de la misma función: lo que se ve en
pantalla es lo que se baja, dibujado más grande.

## Regenerar los assets

Los PNG del marco, los textos de rol y los íconos están versionados, así que
**no hace falta correr esto** para desarrollar ni desplegar. Solo para agregar o
recalibrar un rol, o si cambia la mascota:

```bash
pnpm build:assets
```

Usa las fuentes Amazon Ember de `fonts/`, que están versionadas para que el
script corra en un clon limpio. Son propietarias de Amazon: mientras el repo sea
privado no hay problema, pero **antes de hacerlo público hay que sacarlas del
historial**, no solo del árbol.

`sharp`, `satori` y `@resvg/resvg-js` son devDependencies y solo las usa este
paso. El generador en sí no tiene ninguna dependencia de runtime.

## Desplegar

Son archivos estáticos: sirve cualquier hosting. `pnpm build` arma `dist/`
con todo lo que hay que publicar —`web/` completo más los PNG de producción
de `assets/`— y nada de lo que no: `frame-volunteer.png` (el export crudo de
diseño) y `ref-*.jpeg` (capturas de referencia) quedan afuera porque no están
en `ROLE_TEXT` ni en `BASE_FRAME`/`MASCOT` de [web/theme.mjs](web/theme.mjs),
que es de donde `scripts/build.mjs` saca la lista.

```bash
pnpm build
aws s3 sync --delete ./dist/ "s3://$BUCKET/"
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths '/*'
```

En `main` esto ya lo hace [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
solo: cada push despliega a development y `workflow_dispatch` despliega a
producción. Los pasos de arriba son para un despliegue puntual a mano.

Sin la invalidación, CloudFront sigue sirviendo la versión anterior hasta que
venza el TTL, y parece que el deploy no hizo nada.

Si los assets terminan en otro origen que la página, definí
`window.BADGE_ASSETS_URL` antes de cargar `app.js` — y asegurate de que ese
origen mande cabeceras CORS, porque el canvas los lee para generar el JPEG.

> La versión con Lambda, S3 y página de compartir vive en la rama
> **`producto-lambda`**, con su `template.yaml` y su `Makefile`.

## Seguridad

Sin backend no hay superficie de ataque del lado del servidor: no hay endpoint
que invocar, no hay credenciales en juego y no hay gasto que alguien pueda
disparar. Lo que queda es la cadena de dependencias.

- **Cero dependencias de runtime.** Lo que se publica es HTML, CSS y JS propio.
- `minimumReleaseAge: 10080` — no se instala nada publicado hace menos de
  7 días. Las versiones comprometidas se despublican casi siempre en horas.
- `onlyBuiltDependencies: []` — allowlist vacío y explícito. Es lo que de verdad
  bloquea los scripts de instalación: probado con un paquete con `postinstall`,
  pnpm lo rechaza con `ERR_PNPM_IGNORED_BUILDS`.
- `verifyDepsBeforeRun: error` — si `node_modules` no coincide con
  `package.json`, los comandos fallan en vez de reinstalar solos. El valor
  importa: es un enum, y con `true` (que además es el default) pnpm lo arregla
  en silencio.

> **No hay `.npmrc`, y conviene que siga sin haberlo.** pnpm 11 ignora en
> silencio desde ahí las opciones que importan: `pnpm config list` no muestra
> ninguna de las claves puestas en `.npmrc` y sí las de
> [pnpm-workspace.yaml](pnpm-workspace.yaml). El archivo que existía declaraba
> dos opciones y no aplicaba ninguna.

## Agregar un rol

Los cinco roles del evento —voluntario, speaker, asistente, organizador y
sponsor— ya están. Esto es para sumar uno nuevo.

El texto del rol **no** viene horneado en el marco: `frame-base.png` es común a
todos y la línea de cada rol se compone aparte, desde un PNG transparente que
genera [scripts/build-role-text.mjs](scripts/build-role-text.mjs). Por eso sumar
un rol no requiere pedirle nada a diseño. Son cuatro cambios:

```js
// 1. scripts/build-role-text.mjs — la primera línea del badge
const LEADS = { mentor: 'Soy Mentor/a en el' };

// 2. web/theme.mjs — qué PNG usar
export const ROLE_TEXT = { mentor: 'text-mentor.png' };

// 3. web/theme.mjs — cómo se nombra en el texto para redes
const ROLE_COPY = { mentor: { es: 'mentor/a', en: 'a mentor' } };
```

```bash
# 4. Genera assets/text-mentor.png
pnpm build:assets
```

Y la `<option>` correspondiente en [web/index.html](web/index.html). Un rol que
está en el `<select>` pero no en `ROLE_TEXT` cae al marco del rol por defecto:
sin API que devuelva 400, el error es silencioso y visual.

## Ajustar el diseño

Todo lo tocable vive en [web/theme.mjs](web/theme.mjs): formatos, roles, velo,
tratamiento de foto, tope de zoom, umbral de calidad y el texto para redes.

El velo existe porque el marco oficial no trae ninguno: sobre una foto con una
pared blanca o una ventana arriba, el "COMMUNITY DAY" blanco desaparecería.
Sobre fotos oscuras es invisible, así que no cuesta nada dejarlo siempre.

## Licencia

Este proyecto está licenciado bajo la [Licencia MIT](./LICENSE.md).