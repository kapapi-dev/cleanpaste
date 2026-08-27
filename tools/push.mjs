/**
 * Pushes src/ into the Apps Script project named in .clasp.json.
 *
 * This exists because clasp's own push shells out to a login flow that cannot run
 * unattended. The Apps Script REST API takes the whole project content in one
 * call, which is both simpler and atomic: either every file lands or none does.
 *
 *   node tools/push.mjs            # push src/ to the project
 *   node tools/push.mjs --version  # push, then cut an immutable version
 *
 * Credentials are read from ~/.clasprc.json, which is clasp's own token store and
 * is never committed. Nothing here writes a secret to disk beyond that file.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, extname, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');

const TYPES = { '.gs': 'SERVER_JS', '.js': 'SERVER_JS', '.html': 'HTML', '.json': 'JSON' };

async function accessToken() {
  const store = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
  const token = store.tokens?.default ?? store.token ?? store;

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

  if (!response.ok) {
    throw new Error(`Could not refresh the Google token: ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

function read(directory, name) {
  return {
    name: extname(name) === '.json' ? basename(name, '.json') : basename(name, extname(name)),
    type: TYPES[extname(name)],
    source: readFileSync(join(directory, name), 'utf8'),
  };
}

/**
 * The release file list, plus the dev probe when --dev is passed.
 *
 * The probe is appended last on purpose. Apps Script concatenates a project's
 * files in order and the last declaration of a function name wins, so the probe's
 * showSidebar() replaces the real one without the shipped source containing a
 * single line of test scaffolding.
 */
function collectFiles({ dev }) {
  const files = readdirSync(SRC)
    .filter((name) => TYPES[extname(name)])
    .map((name) => read(SRC, name));

  if (!dev) return files;

  const DEV = join(ROOT, 'tools', 'dev');
  return files.concat(readdirSync(DEV).filter((name) => TYPES[extname(name)]).map((name) => read(DEV, name)));
}

async function main() {
  const scriptId = JSON.parse(readFileSync(join(ROOT, '.clasp.json'), 'utf8')).scriptId;
  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const dev = process.argv.includes('--dev');
  const files = collectFiles({ dev });
  if (dev) console.log('DEV BUILD - includes the probe, do not cut a version from this\n');

  const push = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/content`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ files }),
  });
  if (!push.ok) throw new Error(`Push failed: ${await push.text()}`);

  console.log(`Pushed ${files.length} files to ${scriptId}`);
  for (const file of files) console.log(`  ${file.name} (${file.type})`);

  if (!process.argv.includes('--version')) return;

  const cut = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/versions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description: `Pushed ${new Date().toISOString()}` }),
  });
  if (!cut.ok) throw new Error(`Version failed: ${await cut.text()}`);

  const version = (await cut.json()).versionNumber;
  console.log(`Created immutable version ${version}`);
  writeFileSync(join(ROOT, '.last-version'), String(version));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
