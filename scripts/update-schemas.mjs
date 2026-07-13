#!/usr/bin/env node
/* global fetch */
// Detects new upstream releases of the DraCor and TEI-All schemas, downloads
// the schema files into schemas/, and updates the default versions in
// src/config.ts and the sentence about defaults in README.md.
//
// Prints a Markdown-friendly summary of what changed to stdout. When nothing
// changed, prints the sentinel line `NO_UPDATES` and exits 0. The companion
// workflow uses that sentinel to decide whether to open a PR.
//
// Usage:
//   node scripts/update-schemas.mjs            # both
//   node scripts/update-schemas.mjs --only=dracor
//   node scripts/update-schemas.mjs --only=tei

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const configPath = join(repoRoot, 'src', 'config.ts');
const readmePath = join(repoRoot, 'README.md');
const schemasDir = join(repoRoot, 'schemas');

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const runDracor = !only || only === 'dracor';
const runTei = !only || only === 'tei';

const summary = [];

async function fetchOk(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${url} → HTTP ${res.status}`);
  }
  return res;
}

async function readConfig() {
  const src = await readFile(configPath, 'utf8');
  const tei = src.match(/TEI_VERSION\s*=\s*'([^']+)'/)?.[1];
  const dracor = src.match(/DRACOR_VERSION\s*=\s*'([^']+)'/)?.[1];
  if (!tei || !dracor) {
    throw new Error(`Could not parse versions from ${configPath}`);
  }
  return { src, tei, dracor };
}

async function writeConfig({ tei, dracor }) {
  const next =
    `export const TEI_VERSION = '${tei}';\n` +
    `export const DRACOR_VERSION = '${dracor}';\n`;
  await writeFile(configPath, next);
}

async function updateReadmeDefaults({ tei, dracor }) {
  const readme = await readFile(readmePath, 'utf8');
  const pattern =
    /The defaults are `"[^"]+"` for TEI-All\s+and `"[^"]+"` for the DraCor schema\./;
  if (!pattern.test(readme)) {
    throw new Error(
      'README defaults sentence not found — pattern needs updating'
    );
  }
  const next = readme.replace(
    pattern,
    `The defaults are \`"${tei}"\` for TEI-All\nand \`"${dracor}"\` for the DraCor schema.`
  );
  await writeFile(readmePath, next);
}

function assertXmlRoot(body, expectedRoot) {
  const head = body.slice(0, 4096);
  const rootMatch = head.match(/<([A-Za-z_][\w.-]*)\b/);
  if (!rootMatch || rootMatch[1] !== expectedRoot) {
    throw new Error(
      `Downloaded content does not look like <${expectedRoot}>; got <${rootMatch?.[1] ?? '?'}>`
    );
  }
}

async function updateDracor(current) {
  const rel = await fetchOk(
    'https://api.github.com/repos/dracor-org/dracor-schema/releases/latest',
    { headers: { Accept: 'application/vnd.github+json' } }
  ).then((r) => r.json());

  const version = rel.tag_name?.replace(/^v/, '');
  if (!version) throw new Error('DraCor release has no tag_name');
  if (version === current) return null;

  const base = `https://github.com/dracor-org/dracor-schema/releases/download/${rel.tag_name}`;
  const rng = await fetchOk(`${base}/dracor-schema-${version}.rng`).then((r) =>
    r.text()
  );
  assertXmlRoot(rng, 'grammar');
  const sch = await fetchOk(`${base}/dracor-schema-${version}.sch`).then((r) =>
    r.text()
  );
  assertXmlRoot(sch, 'schema');

  await writeFile(join(schemasDir, `dracor_${version}.rng`), rng);
  await writeFile(join(schemasDir, `dracor_${version}.sch`), sch);

  return {
    from: current,
    to: version,
    releaseUrl: rel.html_url,
  };
}

async function updateTei(current) {
  const body = await fetchOk(
    'https://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_all.rng'
  ).then((r) => r.text());
  assertXmlRoot(body, 'grammar');

  const version = body
    .slice(0, 4096)
    .match(/TEI Edition:\s*P5 Version\s+(\d+\.\d+\.\d+)/)?.[1];
  if (!version)
    throw new Error('Could not detect TEI version from tei_all.rng header');
  if (version === current) return null;

  await writeFile(join(schemasDir, `tei_all_${version}.rng`), body);

  return {
    from: current,
    to: version,
    releaseUrl: `https://github.com/TEIC/TEI/releases/tag/P5_Release_${version}`,
  };
}

const config = await readConfig();
const nextVersions = { tei: config.tei, dracor: config.dracor };

if (runDracor) {
  const result = await updateDracor(config.dracor);
  if (result) {
    nextVersions.dracor = result.to;
    summary.push(
      `- **DraCor Schema** ${result.from} → ${result.to} — ${result.releaseUrl}`
    );
  }
}

if (runTei) {
  const result = await updateTei(config.tei);
  if (result) {
    nextVersions.tei = result.to;
    summary.push(
      `- **TEI-All** ${result.from} → ${result.to} — ${result.releaseUrl}`
    );
  }
}

if (summary.length === 0) {
  console.log('NO_UPDATES');
  process.exit(0);
}

await writeConfig(nextVersions);
await updateReadmeDefaults(nextVersions);

console.log('Updated schemas:\n');
console.log(summary.join('\n'));
