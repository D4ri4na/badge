// UI del generador. Sin framework ni build: es una página que se sirve tal cual.
//
// Todo pasa en el navegador. La foto se abre con `createImageBitmap`, se
// compone en un canvas y se descarga desde ese mismo canvas. No hay servidor,
// no hay API, no hay nada que subir: la foto no sale del dispositivo ni siquiera
// de forma temporal, y el badge tampoco queda alojado en ningún lado.
//
// Dos cosas que importan del diseño de este archivo:
//
// 1. El estado inicial es el mascota, no un lienzo vacío. El badge ya existe
//    apenas entrás y la foto pasa a ser una mejora opcional. Sin foto ->
//    mascota, con foto -> tu cara: no hace falta ningún control extra.
//
// 2. Acá no hay cálculo de encuadre ni composición: eso vive en framing.mjs y
//    render.mjs, y la vista previa y la descarga usan exactamente el mismo.
//    Este archivo es solo eventos y estado.

import { PHOTO, resolveFormat, buildCaption, contentBox } from './theme.mjs';
import { panFocus, inspectPhoto } from './framing.mjs';
import { loadArt, paint, renderBadge } from './render.mjs';

// Link que va en el texto para publicar: el del propio generador, para que
// quien lea la publicación pueda armar el suyo.
//
// Se limpia la URL de la pestaña en vez de usarla cruda: el texto se pega en
// redes, y ahí un `?utm_source=…` o un `/index.html` quedan feos. Pero se
// conserva el resto del path, porque si el generador alguna vez se sirve bajo
// un subpath (`/badge/`) esa parte es justamente la que hace que el link
// lleve a algún lado. Si hace falta forzar una URL canónica —dominio de
// CloudFront, `www`—, `BADGE_SITE_URL` se fija a mano en el HTML y tiene
// prioridad sobre todo esto.
const SITE = window.BADGE_SITE_URL
  ?? location.href.split(/[?#]/)[0].replace(/index\.html$/, '');

const PREVIEW_WIDTH = 540;

const $ = (id) => document.getElementById(id);
const form = $('form');
const input = $('photo');
const stage = $('stage');
const pick = $('pick');
const clearBtn = $('clear');
const canvas = $('preview');
const ctx = canvas.getContext('2d');
const controls = $('controls');
const resetBtn = $('reset');
const zoomInput = $('zoom');
const roleSelect = $('role');
const layoutSelect = $('layout');
const backgroundSelect = $('background');
const poseSelect = $('pose');
const poseField = $('pose-field');
const submit = $('submit');
const status = $('status');
const warnings = $('warnings');
const result = $('result');
const badge = $('badge');
const download = $('download');
const shareBtn = $('share');

let bitmap = null;
let art = null;
let focus = { ...PHOTO.focus };
let zoom = 1;
let caption = '';
let badgeUrl = null;
let badgeFile = null;

zoomInput.max = String(Math.round(PHOTO.maxZoom * 100));

let artReady;
let artVersion = 0;
function refreshArt() {
  const version = ++artVersion;
  submit.disabled = true;
  artReady = loadArt(roleSelect.value, backgroundSelect.value, poseSelect.value)
    .then((next) => { if (version === artVersion) art = next; })
    .catch((err) => { if (version === artVersion) setStatus(err.message, 'error'); throw err; });
  return artReady.finally(() => { if (version === artVersion) submit.disabled = false; });
}
refreshArt().catch(() => {});

// --- Selectores ---

for (const selector of [roleSelect, backgroundSelect, poseSelect]) {
  selector.addEventListener('change', async () => {
    try {
      await refreshArt();
      setStatus('');
      draw();
    } catch { /* El error de carga ya está visible en el estado. */ }
  });
}

layoutSelect.addEventListener('change', () => {
  sizeCanvas();
  draw();
});

/** El lienzo de la vista previa sigue la proporción del formato elegido. */
function sizeCanvas() {
  const out = resolveFormat(layoutSelect.value);
  canvas.width = PREVIEW_WIDTH;
  canvas.height = Math.round((PREVIEW_WIDTH * out.h) / out.w);
}

// --- Elegir y quitar foto ---

pick.addEventListener('click', () => input.click());
input.addEventListener('change', () => selectFile(input.files?.[0]));

for (const type of ['dragenter', 'dragover']) {
  stage.addEventListener(type, (e) => {
    e.preventDefault();
    stage.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) {
  stage.addEventListener(type, (e) => {
    e.preventDefault();
    stage.classList.remove('over');
    if (type === 'drop') selectFile(e.dataTransfer?.files?.[0]);
  });
}

async function selectFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    setStatus('Ese archivo no es una imagen JPG, PNG o WEBP.', 'error');
    return;
  }

  let next;
  try {
    // Sin reducir: no hay nada que subir, así que el badge se compone desde la
    // foto en su resolución original y sale más nítido que pasando por un
    // servidor con límite de tamaño de request.
    next = await createImageBitmap(file);
  } catch {
    setStatus('No pudimos abrir esa imagen. Probá con otra.', 'error');
    return;
  }

  bitmap?.close?.();
  bitmap = next;
  resetFraming();
  setStatus('');
  renderWarnings(inspectPhoto(bitmap));
  applyMode();
  draw();
}

clearBtn.addEventListener('click', () => {
  bitmap?.close?.();
  bitmap = null;
  input.value = '';
  renderWarnings([]);
  applyMode();
  draw();
});

// --- Encuadre ---

function resetFraming() {
  focus = { ...PHOTO.focus };
  zoom = 1;
  zoomInput.value = '100';
}

resetBtn.addEventListener('click', () => {
  resetFraming();
  draw();
});

zoomInput.addEventListener('input', () => {
  zoom = Number(zoomInput.value) / 100;
  draw();
});

function applyMode() {
  const hasPhoto = Boolean(bitmap);
  // Sobre el mascota no hay nada que encuadrar.
  controls.hidden = !hasPhoto;
  poseField.hidden = hasPhoto;
  pick.hidden = hasPhoto;
  clearBtn.hidden = !hasPhoto;
  canvas.classList.toggle('draggable', hasPhoto);
}

// --- Arrastrar ---

let dragging = null;

canvas.addEventListener('pointerdown', (e) => {
  if (!bitmap) return;
  dragging = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging || !bitmap) return;
  // El canvas se muestra escalado por CSS: el gesto viene en píxeles de
  // pantalla y hay que llevarlo a píxeles del lienzo antes de mover el foco.
  const k = canvas.width / canvas.getBoundingClientRect().width;
  focus = panFocus(
    focus,
    { dx: (e.clientX - dragging.x) * k, dy: (e.clientY - dragging.y) * k },
    { width: bitmap.width, height: bitmap.height },
    { w: contentBox({ w: canvas.width, h: canvas.height }).w, h: contentBox({ w: canvas.width, h: canvas.height }).h },
    zoom,
  );
  dragging = { x: e.clientX, y: e.clientY };
  draw();
});

for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  canvas.addEventListener(type, () => (dragging = null));
}

// --- Dibujo de la vista previa ---

// El arrastre dispara muchos más eventos que cuadros puede pintar la pantalla.
// Sin esta cola los dibujos se encolarían y el gesto se sentiría pegajoso.
let painting = false;
let queued = false;

async function draw() {
  if (painting) {
    queued = true;
    return;
  }
  painting = true;
  try {
    await artReady;
    await paint(ctx, { w: canvas.width, h: canvas.height }, { bitmap, art, focus, zoom });
  } catch (err) {
    setStatus(err.message ?? 'No pudimos cargar el diseño.', 'error');
  } finally {
    painting = false;
    if (queued) {
      queued = false;
      requestAnimationFrame(draw);
    }
  }
}

// --- Generar ---

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submit.disabled = true;
  setStatus('Armando tu badge…');

  try {
    await artReady;
    const blob = await renderBadge({
      layout: layoutSelect.value,
      bitmap,
      art,
      focus,
      zoom,
    });

    // El object URL anterior se libera: si no, cada "usar otro" deja el JPEG
    // completo retenido en memoria hasta que se cierra la pestaña.
    if (badgeUrl) URL.revokeObjectURL(badgeUrl);
    badgeUrl = URL.createObjectURL(blob);
    badgeFile = new File([blob], 'badge-acd-bolivia.jpg', { type: 'image/jpeg' });

    caption = buildCaption({ role: roleSelect.value, url: 'link pendiente' });
    showResult();
    setStatus('');
  } catch (err) {
    console.error(err);
    setStatus(err.message ?? 'No pudimos armar el badge. Probá de nuevo.', 'error');
  } finally {
    submit.disabled = false;
  }
});

// --- Resultado ---

function showResult() {
  badge.src = badgeUrl;
  download.href = badgeUrl;
  $('captiontext').textContent = caption;

  // Web Share nivel 2 comparte el archivo, no un link. En celular es un solo
  // toque y la imagen va adjunta —en iOS es además la forma confiable de que
  // termine en Fotos—. En Chrome y Firefox de escritorio no existe, y ahí
  // queda el botón de descargar.
  shareBtn.hidden = !(navigator.canShare?.({ files: [badgeFile] }) ?? false);

  result.hidden = false;
  form.hidden = true;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

shareBtn.addEventListener('click', async () => {
  if (!badgeFile) return;
  try {
    await navigator.share({
      files: [badgeFile],
      title: 'AWS Student Community Day Santa Cruz - Bolivia 2026',
      text: caption,
    });
  } catch {
    // El usuario canceló: no hay nada que informar.
  }
});

$('copy').addEventListener('click', async (e) => {
  if (!caption) return;
  try {
    await navigator.clipboard.writeText(caption);
    e.target.textContent = 'Copiado ✓';
  } catch {
    getSelection()?.selectAllChildren($('captiontext'));
    e.target.textContent = 'Copialo a mano';
  }
  setTimeout(() => (e.target.textContent = 'Copiar'), 2500);
});

$('again').addEventListener('click', () => {
  result.hidden = true;
  form.hidden = false;
  setStatus('');
  // Sin esto el formulario reaparece arriba, fuera de pantalla, y parece que
  // el botón no hizo nada: seguís mirando donde antes estaba el resultado.
  stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// --- Utilidades ---

function renderWarnings(list) {
  warnings.innerHTML = '';
  for (const w of list) {
    const li = document.createElement('li');
    li.textContent = w.message;
    warnings.append(li);
  }
  warnings.hidden = list.length === 0;
}

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`;
}

// --- Arranque ---

sizeCanvas();
applyMode();
draw();
