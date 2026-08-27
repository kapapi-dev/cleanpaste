/**
 * Exports the test document and prints what is actually in it.
 *
 *   node tools/snapshot.mjs <label>
 *
 * The point of exporting rather than reading a report the add-on writes itself:
 * the export comes from Google, not from CleanPaste, so it cannot agree with a
 * bug in CleanPaste's own idea of what it did. Bold runs, links, list structure,
 * headings and tables all survive the HTML export, and invisible characters are
 * printed as their code points instead of vanishing.
 *
 * Google's Docs export puts formatting in inline `style` attributes rather than
 * in CSS classes, so the styles are read straight off each span.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DOC_ID = readFileSync(join(homedir(), '.cp_docid'), 'utf8').trim();
const OUT = new URL('../.snapshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

async function accessToken() {
  const store = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
  const token = store.tokens.default;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: token.client_id,
      client_secret: token.client_secret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  return (await response.json()).access_token;
}

const NAMED = {
  nbsp: ' ', shy: '­', zwj: '‍', zwnj: '‌',
  mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  lt: '<', gt: '>', quot: '"', apos: "'", amp: '&',
};

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED[name.toLowerCase()] ?? whole);
}

/** Prints characters that would otherwise be invisible in the report. */
function visible(text) {
  return text.replace(
    /[\u0000-\u001F\u007F\u00A0\u00AD\u180E\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g,
    (ch) => {
      const code = ch.charCodeAt(0);
      if (code === 0x000d) return '⟨BR⟩';
      if (code === 0x0009) return '⟨TAB⟩';
      return `⟨${code.toString(16).toUpperCase().padStart(4, '0')}⟩`;
    });
}

/** The b/i/u/colour marks carried by one inline style attribute. */
function marksOf(style) {
  const marks = [];
  if (/font-weight:\s*(bold|[7-9]00)/.test(style)) marks.push('b');
  if (/font-style:\s*italic/.test(style)) marks.push('i');
  if (/text-decoration:[^;"]*underline/.test(style)) marks.push('u');
  const colour = /(?:^|[^-])color:\s*#([0-9a-f]{6})/i.exec(style);
  if (colour && colour[1].toLowerCase() !== '000000') marks.push(`#${colour[1]}`);
  return marks.join('');
}

/** Reduces the export to one line per block, with the formatting made explicit. */
function outline(html) {
  const bodyHtml = html.slice(html.indexOf('<body'));
  const lines = [];
  const listStack = [];

  const tokens = bodyHtml.matchAll(
    /<(\/?)(ul|ol)\b([^>]*)>|<(h[1-6]|p|li|td)\b([^>]*)>([\s\S]*?)<\/\4>/g);

  for (const token of tokens) {
    const [, closing, listTag, listAttrs, tag, , inner] = token;

    if (listTag) {
      if (closing) {
        listStack.pop();
      } else {
        // The class carries both the list's identity and the nesting level, which
        // is how "this item is still in the same list, at the same depth" gets
        // checked rather than eyeballed.
        const cls = /class="([^"]*)"/.exec(listAttrs)?.[1] ?? '';
        const id = /lst-kix_(\w+?)-(\d+)/.exec(cls);
        listStack.push(id ? `${listTag}:${id[1].slice(-4)}:L${id[2]}` : listTag);
      }
      continue;
    }

    // Links carry the text they wrap, and Google routes them through a redirect.
    let cursor = inner.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
      (_, href, text) => {
        const target = decodeEntities(href)
          .replace(/^https:\/\/www\.google\.com\/url\?q=/, '')
          .split('&')[0];
        return `«link:${decodeURIComponent(target)}»${text}«/link»`;
      });

    cursor = cursor.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/g, (_, attrs, text) => {
      const style = decodeEntities(/style="([^"]*)"/.exec(attrs)?.[1] ?? '');
      const marks = marksOf(style);
      return marks ? `«${marks}»${text}«/${marks}»` : text;
    });

    const text = decodeEntities(
      cursor.replace(/<br\s*\/?>/g, '\u000D').replace(/<[^>]+>/g, ''));

    const label = tag === 'li'
      ? `LI(${listStack[listStack.length - 1] ?? '?'})`
      : tag.toUpperCase();

    lines.push(`${label.padEnd(20)} "${visible(text)}"`);
  }

  return lines.join('\n');
}

const label = process.argv[2] || 'snapshot';
const token = await accessToken();
const response = await fetch(
  `https://www.googleapis.com/drive/v3/files/${DOC_ID}/export?mimeType=text/html`,
  { headers: { Authorization: `Bearer ${token}` } });

if (!response.ok) {
  console.error(`Export failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const html = await response.text();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${label}.html`), html);

const text = outline(html);
writeFileSync(join(OUT, `${label}.txt`), text);
console.log(text);
