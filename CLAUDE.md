# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

El código, los comentarios y la documentación de este repo están en español.
Seguí esa convención.

## Qué es esto

Un generador de badges para el AWS Community Day Bolivia 2026 que corre **entero
en el navegador**. No hay backend, no hay API, no hay nada alojado: la persona
pone una foto, la encuadra, y se descarga el JPEG. La foto nunca sale del
dispositivo.

Existió una versión con dos Lambdas, S3, Rekognition y página de compartir con
meta Open Graph. Vive en la rama **`producto-lambda`** y no está muerta: si
vuelve a hacer falta el link que despliega el badge en LinkedIn, sale de ahí.
Antes de "recuperar" algo de esa rama, leé la sección de decisiones de abajo:
casi todo lo que se sacó se sacó a propósito.

## Comandos

```bash
pnpm install

pnpm dev                    # http://localhost:5173
pnpm test                   # node --test, sin dependencias
pnpm test -- test/framing.test.mjs   # un solo archivo

pnpm build:assets           # regenera frame-base.png, text-*.png y los íconos
pnpm build                  # arma dist/ para desplegar (aws s3 sync --delete ./dist/ s3://$BUCKET/)
```

No hay linter ni paso de build que transforme código: `web/` se sirve tal
cual, sin framework ni bundler. `pnpm build` no compila nada — solo copia
`web/` y los PNG de producción de `assets/` a `dist/`, en la misma lista que
usa `scripts/build.mjs` derivada de `web/theme.mjs`. `scripts/serve.mjs`
tampoco hace más que servir archivos — existe porque los módulos ES no se
cargan desde `file://`.

## Arquitectura

```
web/
  index.html   la página
  app.js       eventos y estado de la UI; nada de render ni de matemática
  render.mjs   composición en canvas: vista previa Y archivo descargado
  framing.mjs  matemática del encuadre, pura y testeable
  theme.mjs    la configuración de todo
assets/        los PNG que exporta diseño, más los generados en build
scripts/       servidor de archivos local + pipeline de assets (devDeps)
```

### Un solo render, dos tamaños

`paint()` en [web/render.mjs](web/render.mjs) apila: foto normalizada (o placa
de mascota) → velo superior → marco → texto del rol. La vista previa la llama
con un lienzo de 540px de ancho y la descarga con uno de 1080. **Es la misma
función**: no existe una segunda implementación con la que quedar
desincronizado.

Esto es lo que resolvió el defecto estructural de la versión anterior, donde el
navegador duplicaba a mano la matemática del servidor y había un test de paridad
para detectar cuándo se separaban. Si estás por copiar una constante o una
fórmula a otro archivo, casi seguro te equivocaste de enfoque.

La única diferencia entre los dos tamaños es el remuestreo: la descarga usa
`createImageBitmap` con recorte y escala en un solo paso (`hq: true`), que es
caro pero no deja aliasing. La vista previa usa `drawImage`, que es instantáneo
y alcanza para mirar.

### theme.mjs es el archivo de configuración

[web/theme.mjs](web/theme.mjs) concentra todo lo ajustable: formatos, roles,
velo, tratamiento de foto, tope de zoom, umbral de calidad, calidad del JPEG y
texto para redes. Empezá por acá antes de tocar el render.

Lo importa el navegador **y** los scripts de build, así que no puede depender de
nada de Node ni del DOM. Hoy no tiene un solo import: mantenelo así.

### El encuadre trabaja en coordenadas de la foto

`coverCrop()` en [web/framing.mjs](web/framing.mjs) devuelve *qué pedazo de la
foto se ve* (`sx, sy, sw, sh`), no un desplazamiento del lienzo. Eso es lo que
permite recortar y escalar en un solo paso sin materializar una copia gigante de
la imagen ampliada: con zoom 2.5 sobre una foto de 12MP, la versión ingenua
—escalar y después recortar— alocaría cientos de MB y voltearía la pestaña en un
celular viejo.

Es también lo único del render que se puede probar sin navegador, y
[test/framing.test.mjs](test/framing.test.mjs) lo aprovecha: verifica sobre
proporciones extremas que la foto **siempre** cubra el lienzo entero. El diseño
es a sangre completa y un píxel transparente en un borde se ve.

### Composición del badge

El diseño visual **no** está en el código: vive en PNGs transparentes de
`assets/` que exporta el equipo de diseño. El código solo los recoloca. El marco
base es 4:5; para 9:16 se parte en dos bandas (`BANDS`: logo arriba, ola abajo)
y se separan, porque el medio es transparente y solo muestra foto.

### Pipeline de assets

```
frame-volunteer.png (export de diseño)
  └─ scripts/strip-role-text.mjs  → assets/frame-base.png   (marco sin texto de rol)
     scripts/build-role-text.mjs  → assets/text-<rol>.png   (satori + resvg + Amazon Ember)
docs/peresoso.png
  └─ scripts/cutout-mascot.mjs    → assets/mascot.png
     scripts/build-icons.mjs      → assets/favicon-*.png, apple-touch-icon.png
```

Corre en build, nunca en el navegador: `sharp`, `satori` y `@resvg/resvg-js` son
devDependencies y son las únicas dependencias del repo. Los PNG resultantes están
versionados, así que **no hace falta correr `pnpm build:assets` para desarrollar
ni desplegar** — solo para agregar o recalibrar un rol.

`fonts/` (Amazon Ember) está versionado para que `pnpm build:assets` corra en un
clon limpio. Es tipografía propietaria de Amazon: aceptable en un repo privado,
pero si alguna vez se abre hay que purgarla del historial, no solo borrarla.

## Decisiones que parecen defectos y no lo son

**No hay moderación de contenido, y no puede haberla.** La versión con Lambda
pasaba cada foto por Rekognition. Sin servidor es imposible por construcción:
nadie puede revisar una imagen que nunca sale del dispositivo. Se aceptó a
sabiendas. No la "arregles" mandando la foto a un servicio: eso rompe la
promesa que es todo el producto.

**No hay encuadre automático por cara.** Lo daba Rekognition. El reemplazo es un
encuadre inicial en el tercio superior más arrastre y zoom manuales, siempre
visibles. La copia de la UI no promete detección de caras porque no la hay.
Meter un modelo en el cliente (BlazeFace, MediaPipe) es posible pero trae 1-2 MB
de WASM y un bundler a un proyecto que hoy se sirve tal cual: es un cambio de
arquitectura, no una mejora incremental.

**No hay link para compartir.** Lo daba `/b/{id}` y sus meta Open Graph. Sin
imagen alojada no hay URL que desplegar en LinkedIn. El texto para publicar
lleva el link del *generador*, no del badge, para que quien vea la publicación
arme el suyo. Es todo el alcance que este producto puede darse solo.

Corolario: la home **es** el canal de distribución, así que sus metadatos no son
cosmética. Ver la sección de SEO en el README.

**La página no tiene texto de contenido, y es a propósito.** Es un formulario y
nada más: el encabezado se dejó pelado (logo y título) para que el generador
arranque de una. Hubo un pie de página con un `h2`, un párrafo sobre el evento y
un enlace saliente, agregado por SEO, y se sacó justamente por eso.

Lo que ocupa su lugar es el **JSON-LD** del `<head>`: ahí van el nombre, la
fecha, la sede y el link a `awscommunity.org.bo` como datos estructurados, que es
la forma que Google pide para dar contexto sin texto visible. Si la próxima
ronda de SEO quiere "arreglar" que la página sea delgada, la respuesta es
enriquecer ese bloque, no volver a agregar copy. Y no se resuelve escondiendo
texto con CSS: eso es cloaking y se penaliza.

`@type` es `WebApplication` con el evento anidado en `about`, no `Event` arriba:
la página es una herramienta, no se puede asistir a nada desde acá. Pedir rich
results de evento para esto es reclamar algo que no corresponde.

**`twitter:card` es `summary` y no `summary_large_image`.** No hay `og:image`
todavía, y la variante grande sin imagen muestra un recuadro vacío. Se cambian
juntas o ninguna; [test/seo.test.mjs](test/seo.test.mjs) lo verifica.

**El canvas no se testea, y está bien.** `node --test` no tiene canvas, y meter
`jsdom` o `node-canvas` traería un binario nativo por poco. Como la vista previa
y la descarga salen de la misma función, mirar `pnpm dev` verifica las dos.

## Cosas que se rompen fácil

**`crossOrigin` en los assets del canvas.** [web/render.mjs](web/render.mjs) lo
setea siempre, incluso en mismo origen, donde no cambia nada. Si algún día los
assets se sirven desde otro dominio y falta, el canvas queda contaminado y
`toBlob()` tira `SecurityError`: **la vista previa se vería perfecta y la
descarga no funcionaría nunca**. Es un modo de fallar carísimo de diagnosticar y
sale gratis prevenirlo.

**`ctx.filter` no existe en Safari anterior a la 17.** La desaturación tiene un
camino manual por píxel para ese caso. Cuando el canvas era solo una vista
previa, que un navegador viejo mostrara los colores un poco distintos era
cosmético; ahora el canvas *es* el archivo que se descarga, así que no.

**El `<select>` de roles es la única puerta de entrada.** Ya no hay API que
devuelva 400 ante un rol desconocido: `resolveRoleText()` cae al default y el
badge sale con el rol equivocado, sin error. Lo cubre un test en
[test/theme.test.mjs](test/theme.test.mjs) que compara las `<option>` del HTML
contra `ROLE_TEXT`.

**`EVENT.date` y `EVENT.startDate` son la misma fecha en dos formatos.** `date`
es texto en español (`'29 de Agosto, 2026'`) y se pega tal cual en el caption;
`startDate` es ISO 8601 porque es lo que exige schema.org. No se puede unificar
—reformatear `date` rompe el texto para redes— y desincronizarlas hace que Google
publique una fecha vieja sin que nada falle. Hay dos tests que las atan, y el
JSON-LD del HTML tiene la fecha escrita otra vez a mano.

**La URL canónica está escrita cinco veces.** `SITE_URL` en `theme.mjs` es la
referencia, pero el HTML no se plantilla, así que el mismo string aparece a mano
en el canonical, en `og:url`, en `window.BADGE_SITE_URL`, en `web/robots.txt` y
en `web/sitemap.xml`. Es la excepción a la regla de no copiar constantes: un
paso de build por cinco strings no se paga. Lo que impide que se separen es
[test/seo.test.mjs](test/seo.test.mjs), igual que el test del `<select>`.

**CloudFront devuelve 200 con la home para cualquier ruta.** Hay una custom
error response que mapea 404 → `/index.html` con status 200. Esta página no tiene
routing de cliente, así que ese fallback no hace falta y genera duplicados
indexables; además hace que un archivo faltante parezca existir. Está en la
consola de AWS, no en el repo.

**Agregar un rol** es una línea en `ROLE_TEXT` de `theme.mjs`, una en `LEADS` de
`build-role-text.mjs`, una en `ROLE_COPY`, la `<option>` en el HTML y correr
`pnpm build:assets`. Ver el README.

**Toda la config de pnpm va en `pnpm-workspace.yaml`. No hay `.npmrc`, y no
conviene volver a crearlo.** pnpm 11 ignora en silencio desde ahí las opciones
que importan: `pnpm config list` no muestra ninguna de las claves puestas en
`.npmrc` y sí las del yaml. El `.npmrc` que existía no hacía nada, que es peor
que no existir, porque parecía que sí.

**`verifyDepsBeforeRun` es un enum, no un booleano.** Con `true` —y por
defecto— pnpm reinstala solo y sigue: un lockfile desincronizado se corrige en
silencio. Solo `error` corta. Está en `error`, así que si `pnpm test` se queja
de dependencias, corré `pnpm install`: eso es la opción funcionando, no un bug.

## Privacidad

La foto no se sube a ningún lado porque no hay ningún lado: se abre con
`createImageBitmap`, se dibuja en un canvas y ahí termina. El badge existe como
un `blob:` en la pestaña hasta que la persona lo descarga. No hay logs, ni
analítica, ni cuentas, ni nada que borrar después.

Cualquier cambio que mande la foto o el badge fuera del dispositivo —una
subida, una métrica con la imagen, un servicio de terceros— rompe la promesa
central del producto y del README. Si hace falta, es una decisión de producto,
no un detalle de implementación.
