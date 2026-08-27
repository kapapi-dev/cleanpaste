/**
 * Generates the Marketplace image assets from one vector source.
 *
 *   node tools/assets.mjs
 *
 * Drawn rather than photographed or generated, because every size has to be
 * pixel-exact and the 32px icon has to stay legible. The mark is the product:
 * a block of text whose ragged last line has been pulled back into place.
 */

import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../marketplace/assets/', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1');

const TEAL = '#0F7B8A';
const TEAL_DARK = '#0B5C68';
const AMBER = '#F2A33C';
const PAPER = '#FFFFFF';

/**
 * The icon mark, drawn on a 128-unit grid.
 *
 * Four bars read as a paragraph. The third is broken in two with a gap, which is
 * what a paste does to a line, and the amber connector sitting in that gap is what
 * CleanPaste does about it. At 32px the gap and connector survive as one distinct
 * coloured pixel cluster, which is what keeps the icon from being another
 * anonymous blue document.
 */
function mark({ bg = true } = {}) {
  const bar = (y, x, w, fill = PAPER) =>
    `<rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="${fill}"/>`;

  return `
    ${bg ? `<rect width="128" height="128" rx="28" fill="${TEAL}"/>
            <rect width="128" height="128" rx="28" fill="url(#sheen)"/>` : ''}
    ${bar(30, 24, 80)}
    ${bar(52, 24, 80)}
    ${bar(74, 24, 30)}
    ${bar(74, 74, 30)}
    <rect x="58" y="72" width="14" height="14" rx="4" fill="${AMBER}"/>
    ${bar(96, 24, 56)}
  `;
}

function svg(size, { bg = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
    <defs>
      <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.10"/>
      </linearGradient>
    </defs>
    ${mark({ bg })}
  </svg>`;
}

/**
 * The 220x140 store card. Wider than it is tall, so the mark sits left and the
 * name sits beside it rather than being shrunk to fit.
 */
function banner() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${TEAL}"/>
        <stop offset="1" stop-color="${TEAL_DARK}"/>
      </linearGradient>
    </defs>
    <rect width="220" height="140" fill="url(#bg)"/>
    <g transform="translate(18 38) scale(0.46)">
      ${mark({ bg: false })}
    </g>
    <text x="88" y="66" font-family="Roboto, Arial, Helvetica, sans-serif"
          font-size="19" font-weight="700" fill="${PAPER}">CleanPaste</text>
    <text x="88" y="86" font-family="Roboto, Arial, Helvetica, sans-serif"
          font-size="10.5" fill="${PAPER}" fill-opacity="0.82">Tidy up pasted text</text>
  </svg>`;
}

mkdirSync(OUT, { recursive: true });

const written = [];

async function png(name, source, width, height) {
  const buffer = await sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, name), buffer);
  written.push(`${name}  ${width}x${height}  ${buffer.length} bytes`);
}

for (const size of [16, 32, 48, 96, 120, 128, 512]) {
  await png(`icon-${size}.png`, svg(size), size, size);
}
await png('card-banner-220x140.png', banner(), 220, 140);

writeFileSync(join(OUT, 'icon.svg'), svg(128));

for (const line of written) console.log(line);
console.log('icon.svg  (vector source)');
