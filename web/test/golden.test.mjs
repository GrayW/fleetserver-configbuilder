// Parity with the original Elixir implementation (see test/golden/generate.exs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from '../src/builder.mjs';

const read = name => JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../data/schema.json', import.meta.url), 'utf8'));
const cases = read('cases.json');

test('golden fixtures cover every section', () => {
  assert.ok(cases.length >= 3 * schema.length);
});

for (const c of cases) {
  test(`golden: ${c.name}`, () => {
    const { omitted, ...out } = build(schema, c.values, c.extra_yaml);
    assert.deepEqual(out, c.expected);
    assert.deepEqual(omitted, []);
  });
}
