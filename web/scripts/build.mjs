#!/usr/bin/env node
// Bakes web/data/schema.json and the web/src modules into web/index.html and writes
// web/dist/index.html. The page itself never fetches anything: everything is in the file.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_MARKER = '/*__SCHEMA__*/null';
const SRC_MARKER = '/*__SRC__*/';
export const MODULES = ['yaml', 'builder', 'summary', 'wizard', 'share', 'importer', 'usage'];

const once = (html, marker) => {
  if (html.split(marker).length !== 2) throw new Error(`index.html must contain ${marker} exactly once`);
};

const stripModuleSyntax = source =>
  source
    .split('\n')
    .filter(l => !/^import\s/.test(l))
    .map(l => l.replace(/^export\s+/, ''))
    .join('\n');

// Turns an ES module into plain script text: drops imports and the `export` keyword. Only the
// simple forms the modules use are supported; anything else fails the build.
export const inline = (name, source) => {
  const text = stripModuleSyntax(source);
  if (/^export\s+(default|\{|\*)/m.test(source) || /^\s*(import|export)\b/m.test(text)) throw new Error(`${name}.mjs uses an import/export form the build can't inline`);
  if (text.includes('</script')) throw new Error(`${name}.mjs contains </script`);
  return `/* ---- ${name} ---- */\n${text.trim()}\n`;
};

// All modules share one script scope, so a repeated top-level name would silently clobber another.
export const assertNoClashes = sources => {
  const seen = new Map();
  for (const [name, source] of sources) {
    for (const m of stripModuleSyntax(source).matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(m[1])) throw new Error(`"${m[1]}" is declared in both ${seen.get(m[1])}.mjs and ${name}.mjs`);
      seen.set(m[1], name);
    }
  }
  return seen;
};

export const bake = (html, schema, sources) => {
  once(html, SCHEMA_MARKER);
  once(html, SRC_MARKER);
  assertNoClashes(sources);
  // Keep the JSON from ever closing the script tag or breaking the JS string rules.
  const json = JSON.stringify(schema).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const code = sources.map(([name, text]) => inline(name, text)).join('\n');
  return html.replace(SRC_MARKER, () => code).replace(SCHEMA_MARKER, () => json);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const schema = JSON.parse(await readFile(path.join(root, 'data', 'schema.json'), 'utf8'));
  const sources = await Promise.all(MODULES.map(async n => [n, await readFile(path.join(root, 'src', `${n}.mjs`), 'utf8')]));
  const out = bake(html, schema, sources);
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist', 'index.html'), out);
  console.log(`Built web/dist/index.html (${(out.length / 1024).toFixed(0)} KB).`);
}
