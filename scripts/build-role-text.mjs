// Textos transparentes: el mismo pie se usa en Feed y Story.
import { readFile, writeFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { CANVAS, EVENT, ROLE_TEXT } from '../web/theme.mjs';

const LEADS = {
  volunteer: 'Soy Voluntario/a', speaker: 'Soy Speaker', attendee: 'Voy a estar ahí',
  organizer: 'Soy Organizador/a', sponsor: 'Somos Sponsor', ally: 'Somos Comunidad Aliada',
};
const font = await readFile(new URL('../fonts/AmazonEmber_Bd.woff', import.meta.url));
for (const [role, asset] of Object.entries(ROLE_TEXT)) {
  const svg = await satori({ type: 'div', props: {
    style: { display: 'flex', width: '100%', height: '100%', position: 'relative', fontFamily: 'Ember', color: '#FFFFFF' },
    children: [{ type: 'div', props: {
      style: { display: 'flex', position: 'absolute', top: 1100, left: 175, width: 730, height: 170,
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 },
      children: [
        { type: 'div', props: { style: { fontSize: role === 'ally' ? 42 : 48, color: '#FFB84A' }, children: LEADS[role] } },
        { type: 'div', props: { style: { fontSize: 27 }, children: 'AWS STUDENT COMMUNITY DAY' } },
        { type: 'div', props: { style: { fontSize: 22, letterSpacing: 3 }, children: 'SANTA CRUZ - BOLIVIA' } },
      ],
    } }],
  } }, { width: CANVAS.w, height: CANVAS.h, fonts: [{ name: 'Ember', data: font, weight: 700, style: 'normal' }] });
  await writeFile(new URL('../assets/' + asset, import.meta.url), new Resvg(svg).render().asPng());
  console.log(asset + ' · ' + EVENT.name);
}
