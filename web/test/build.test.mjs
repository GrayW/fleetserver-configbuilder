import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { assertNoClashes, bake, inline, MODULES } from '../scripts/build.mjs';

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../index.html');
const schema = JSON.parse(read('../data/schema.json'));
const sources = MODULES.map(n => [n, read(`../src/${n}.mjs`)]);

test('inline: drops imports and export keywords', () => {
  const out = inline('x', "import { a } from './a.mjs';\nexport const b = 1;\nexport function c() {}\n");
  assert.ok(!/import|export/.test(out));
  assert.match(out, /const b = 1;/);
});

test('inline: refuses forms it cannot handle', () => {
  assert.throws(() => inline('x', 'export default 1;'), /can't inline/);
  assert.throws(() => inline('x', "const s = '</script>';"), /<\/script/);
});

test('assertNoClashes: a name declared in two modules fails the build', () => {
  assert.throws(() => assertNoClashes([['a', 'export const x = 1;'], ['b', 'const x = 2;']]), /"x" is declared in both a.mjs and b.mjs/);
  assert.ok(assertNoClashes(sources).has('build'));
});

test('built page: contains the data and code, no markers, parses as a script', () => {
  const out = bake(html, schema, sources);
  assert.ok(!out.includes('/*__SCHEMA__*/') && !out.includes('/*__SRC__*/'));
  assert.ok(out.includes('"yaml_key":"mysql"'));
  const script = /<script>([\s\S]*)<\/script>/.exec(out)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});

test('built page: the schema never closes the script tag', () => {
  const evil = [{ ...schema[0], description: '</script><script>alert(1)</script> ' }];
  const out = bake(html, evil, sources);
  assert.equal(out.split('</script>').length, 2);
});

test('page keeps a strict CSP: no network of any kind', () => {
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const d of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"]) assert.ok(csp.includes(d), d);
  assert.ok(!/<(script|link|img|iframe)[^>]+(src|href)="https?:/i.test(html.replace(/<a\s[^>]*>/gi, '')), 'no external resources');
});
