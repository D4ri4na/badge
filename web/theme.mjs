// Configuración del badge. Es el archivo por el que hay que empezar.
//
// El diseño (ola, logo, íconos, fecha y sede) vive en el PNG transparente que
// exporta el equipo de diseño, no acá. Este archivo solo tiene lo que el código
// necesita saber: qué marco usar y cómo tratar la foto.
//
// Vive en web/ y no en src/ porque el navegador lo importa como módulo: es la
// única fuente de verdad de todo el generador. Los scripts de build también lo
// leen desde acá.

export const CANVAS = { w: 1080, h: 1350 };

// Formatos de salida. El marco que exporta diseño es 4:5; el 9:16 se arma
// extendiendo ese mismo marco: la banda del logo queda arriba, la de la ola
// abajo, y el medio —que es transparente y solo muestra foto— se estira.
// Por eso no hace falta un export nuevo por formato.
//
// BANDS son las filas del marco 4:5 que contienen dibujo. Medidas sobre
// assets/frame-base.png: el logo termina en 159 y la ola arranca en 1060.
export const BANDS = { topEnd: 210, bottomStart: 1030 };

export const FORMATS = {
  feed: { w: 1080, h: 1350, label: 'Feed 4:5' },
  story: { w: 1080, h: 1920, label: 'Story 9:16' },
};

export const DEFAULT_FORMAT = 'feed';

export function resolveFormat(name) {
  return FORMATS[name] ?? FORMATS[DEFAULT_FORMAT];
}

// Calidad del JPEG final. Alta a propósito: el badge no se sube a ningún lado
// —se descarga— así que el peso del archivo no le cuesta nada a nadie, y las
// redes lo van a volver a comprimir igual.
export const JPEG_QUALITY = 0.94;

export const EVENT = {
  name: 'AWS Community Day Bolivia',
  date: '29 de Agosto, 2026',
  // La misma fecha en ISO 8601, que es lo que exige schema.org para el
  // JSON-LD del <head>. Va aparte y no reformateada porque `date` se pega
  // tal cual en el texto para redes. Se cambian juntas; las compara
  // test/seo.test.mjs.
  startDate: '2026-08-29',
  venue: 'UCB, Santa Cruz, Bolivia',
};

// URL canónica del generador. Es el link que va en el texto para publicar y el
// que declaran <link rel="canonical">, og:url, robots.txt y sitemap.xml.
//
// El HTML es estático y no se plantilla, así que ese string está escrito cuatro
// veces más fuera de acá. No vale un paso de build por cuatro strings: lo que
// evita que se separen es test/seo.test.mjs, que los compara contra este valor.
export const SITE_URL = 'https://badge.awscommunity.org.bo/';

// Marco común a todos los roles: el export v4 con la línea del rol borrada
// (scripts/strip-role-text.mjs). El texto de cada rol va aparte, en un PNG
// transparente generado en build por scripts/build-role-text.mjs.
//
// Antes había un marco por rol con el texto horneado, lo que obligaba a pedirle
// un export a diseño por cada rol nuevo. Ahora sumar un rol es una línea acá y
// volver a correr el script.
export const BASE_FRAME = 'frame-base.png';

export const ROLE_TEXT = {
  volunteer: 'text-volunteer.png',
  speaker: 'text-speaker.png',
  attendee: 'text-attendee.png',
  organizer: 'text-organizer.png',
  sponsor: 'text-sponsor.png',
  ally: 'text-ally.png',
};

export const DEFAULT_ROLE = 'volunteer';

// Modo mascota: badge sin foto, para quien no quiere subir su cara. Un
// porcentaje nada despreciable de la gente abandona el generador justo ahí.
//
// El fondo es propuesta del código, no viene de diseño: degradado con la paleta
// del marco más grano tenue para que combine con la textura de la ola.
export const MASCOT = {
  asset: 'mascot.png',
  width: 0.66, // fracción del ancho del lienzo
  gradient: ['#232F3E'],
  grain: 0.055,
};

// Íconos del navegador. Los genera scripts/build-icons.mjs recortando la
// mascota sobre la misma placa que usa el badge, así la pestaña y el producto
// se parecen. Están acá y no sueltos en el HTML porque scripts/build.mjs deriva
// de este archivo la lista de lo que copia a dist/.
export const ICONS = ['favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png'];

// --- Texto para compartir ---

// PLACEHOLDER: falta confirmar los hashtags y cuentas oficiales del evento.
// Tres o cuatro alcanzan; en LinkedIn más hashtags rinden peor, y en X comen
// caracteres del límite.
export const HASHTAGS = ['#AWSCommunityDayBolivia', '#AWSCommunity', '#AWSBolivia', '#AWS', '#CloudComputing', '#Bolivia'];

// Cómo se nombra cada rol dentro del texto.
const ROLE_COPY = {
  volunteer: { es: 'voluntario/a', en: 'a volunteer' },
  speaker: { es: 'speaker', en: 'a speaker' },
  attendee: { es: 'asistente', en: 'an attendee' },
  organizer: { es: 'organizador/a', en: 'an organizer' },
  sponsor: { es: 'sponsor', en: 'a sponsor' },
  ally: { es: 'comunidad aliada', en: 'a community partner' },
};

/**
 * Texto listo para pegar en redes. El link va en su propia línea porque
 * algunas plataformas lo absorben si queda pegado al texto.
 *
 * El link es el del generador, no el del badge: no hay badge alojado en ningún
 * lado. Sirve para que quien vea la publicación arme el suyo, que es todo el
 * alcance que este producto puede dar por sí solo.
 */
export function buildCaption({ role = DEFAULT_ROLE, locale = 'es', url = '' } = {}) {
  const named = ROLE_COPY[role] ?? ROLE_COPY[DEFAULT_ROLE];
  const tags = HASHTAGS.join(' ');

  if (locale === 'en') {
    return [
      `I'll be ${named.en} at ${EVENT.name} 2026 🇧🇴`,
      '',
      `📅 August 29 · 📍 ${EVENT.venue}`,
      url && `Make yours 👉 ${url}`,
      '',
      tags,
    ]
      .filter((line) => line !== undefined && line !== false)
      .join('\n');
  }

  return [
    `Voy a estar como ${named.es} en el ${EVENT.name} 2026 🇧🇴`,
    '',
    `📅 ${EVENT.date} · 📍 ${EVENT.venue}`,
    url && `Armá el tuyo 👉 ${url}`,
    '',
    tags,
  ]
    .filter((line) => line !== undefined && line !== false)
    .join('\n');
}

export function resolveRoleText(role) {
  return ROLE_TEXT[role] ?? ROLE_TEXT[DEFAULT_ROLE];
}

export function hasFrame(role) {
  return Boolean(ROLE_TEXT[role]);
}

export function availableRoles() {
  return Object.keys(ROLE_TEXT);
}

// Velo superior. El marco oficial no trae ninguno, así que sobre una foto con
// una pared blanca o una ventana arriba el "COMMUNITY DAY" blanco desaparece.
// Sobre fotos oscuras es invisible, así que no cuesta nada dejarlo siempre.
export const SCRIM = {
  height: 360,
  opacity: 0.62,
};

// Tratamiento de foto: desatura sin llegar a blanco y negro. Mantiene el color
// humano del diseño Bolivia pero acerca fotos muy dispares entre sí.
export const PHOTO = {
  saturation: 0.85,
  // Fondo para fotos con transparencia (headshots recortados, muy comunes).
  // Sin esto el badge sale con un fondo negro accidental.
  matte: '#FFFFFF',
  // Encuadre inicial: tercio superior, que es donde suele caer una cara.
  focus: { x: 0.5, y: 0.38 },
  // Tope del zoom manual. Más que esto es ampliar píxeles que no existen.
  maxZoom: 2.5,
};

// Umbral de calidad. No bloquea: alimenta un aviso en la UI.
export const QUALITY = {
  minShortSide: 900, // menos que esto obliga a ampliar y se nota
};
