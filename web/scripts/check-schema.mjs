#!/usr/bin/env node
// Compares web/data/schema.json with Fleet's server/config/config.go and fails if they drifted:
// a field in the schema that Fleet no longer has, or a new field in a section we cover that is
// neither in the schema nor listed in web/data/schema-ignore.json.
//
// Design rule: fail loudly. If the check fails, the workflow stops before deploying and the
// previously published site stays up. Labels and help text are hand-written, so this reports
// drift rather than rewriting the schema.
//
// Needs Node 20+ (built-in fetch) and no npm packages.
// Usage: node web/scripts/check-schema.mjs [--file path/to/config.go]   (default: latest release)

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com/repos/fleetdm/fleet/releases/latest';
const RAW = tag => `https://raw.githubusercontent.com/fleetdm/fleet/${tag}/server/config/config.go`;

export class DriftError extends Error {}

/* ---------- Parsers (pure, unit-tested) ---------- */

const stripComment = line => line.replace(/\/\/.*$/, '').trimEnd();

// -> Map<structName, [{goName, key}]> where key is the yaml tag, or the lower-cased Go name when
// the field has none (how Fleet's viper-based loader matches it).
export const parseStructs = source => {
  const structs = new Map();
  let current = null;
  for (const raw of source.split('\n')) {
    const line = stripComment(raw);
    const open = /^type\s+(\w+)\s+struct\s*\{\s*$/.exec(line);
    if (open) { current = []; structs.set(open[1], current); continue; }
    if (current === null) continue;
    if (/^\}/.test(line)) { current = null; continue; }
    const field = /^\s+(\w+)\s+([\w.*\[\]]+)(?:\s+`([^`]*)`)?\s*$/.exec(line);
    if (!field) continue; // blank lines and embedded types
    const tag = /yaml:"([^"]*)"/.exec(field[3] ?? '');
    const name = tag ? tag[1].split(',')[0] : field[1].toLowerCase();
    if (name === '-') continue;
    current.push({ goName: field[1], type: field[2], key: name });
  }
  return structs;
};

// -> Map<sectionYamlKey, structName> from the FleetConfig struct.
export const parseSections = structs => {
  const top = structs.get('FleetConfig');
  if (!top) throw new DriftError('FleetConfig struct not found in config.go');
  return new Map(top.map(f => [f.key, f.type]));
};

/* ---------- Comparison ---------- */

// schema: the array from schema.json. ignore: {section: [yaml_key, ...]} of acknowledged gaps.
export const compare = (schema, structs, ignore = {}) => {
  const sections = parseSections(structs);
  const removedSections = [];
  const removedFields = [];
  const newFields = [];
  for (const s of schema) {
    const structName = sections.get(s.yaml_key);
    const fields = structName && structs.get(structName);
    if (!fields) { removedSections.push(s.yaml_key); continue; }
    const goKeys = new Set(fields.map(f => f.key));
    const known = new Set([...s.fields.map(f => f.yaml_key), ...(ignore[s.yaml_key] ?? [])]);
    for (const f of s.fields) if (!goKeys.has(f.yaml_key)) removedFields.push(`${s.yaml_key}.${f.yaml_key}`);
    for (const k of goKeys) if (!known.has(k)) newFields.push(`${s.yaml_key}.${k}`);
  }
  const covered = new Set(schema.map(s => s.yaml_key));
  const uncoveredSections = [...sections.keys()].filter(k => !covered.has(k));
  return { removedSections, removedFields, newFields, uncoveredSections };
};

export const failures = r => [
  ...r.removedSections.map(s => `section "${s}" no longer exists in Fleet's config`),
  ...r.removedFields.map(f => `${f} is in the schema but not in Fleet's config`),
  ...r.newFields.map(f => `${f} is new in Fleet's config: add it to the schema or to schema-ignore.json`),
];

/* ---------- Main ---------- */

const getText = async url => {
  const res = await fetch(url, { headers: { 'user-agent': 'fleet-config-helper-schema-check' } });
  if (!res.ok) throw new DriftError(`GET ${url} failed: ${res.status}`);
  return res;
};

const main = async () => {
  const schema = JSON.parse(await readFile(path.join(root, 'data', 'schema.json'), 'utf8'));
  const ignore = JSON.parse(await readFile(path.join(root, 'data', 'schema-ignore.json'), 'utf8'));
  const fileArg = process.argv.indexOf('--file');
  let source;
  let label;
  if (fileArg > -1) {
    label = process.argv[fileArg + 1];
    source = await readFile(label, 'utf8');
  } else {
    const { tag_name: tag } = await (await getText(API)).json();
    if (!tag) throw new DriftError('latest release has no tag_name');
    label = `release ${tag}`;
    source = await (await getText(RAW(tag))).text();
  }
  const structs = parseStructs(source);
  const result = compare(schema, structs, ignore);
  const bad = failures(result);
  console.log(`Compared schema.json with ${label}.`);
  console.log(`Fleet sections the helper doesn't cover (informational): ${result.uncoveredSections.join(', ') || 'none'}.`);
  if (bad.length) {
    console.error(`\nSchema drift (${bad.length}):`);
    for (const b of bad) console.error(`  - ${b}`);
    process.exit(1);
  }
  console.log('No drift.');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
