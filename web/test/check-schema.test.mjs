import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compare, failures, parseSections, parseStructs, DriftError } from '../scripts/check-schema.mjs';

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const schema = JSON.parse(read('../data/schema.json'));
const ignore = JSON.parse(read('../data/schema-ignore.json'));

const SAMPLE = `
package config

// MysqlConfig defines configs related to MySQL
type MysqlConfig struct {
	Protocol     string \`yaml:"protocol"\`
	MaxOpenConns int    \`yaml:"max_open_conns"\` // trailing comment
	Hidden       string \`yaml:"-"\`
	Address      string
	TLS          bool
	WithOptions  string \`json:"x" yaml:"with_options,omitempty"\`
	// StatusLogFile is deprecated.
	Embedded
}

type FleetConfig struct {
	Mysql            MysqlConfig
	MysqlReadReplica MysqlConfig \`yaml:"mysql_read_replica"\`
	KafkaREST        KafkaRESTConfig
}
`;

test('parseStructs: yaml tags win, untagged names are lower-cased, "-" and embedded are skipped', () => {
  const m = parseStructs(SAMPLE).get('MysqlConfig');
  assert.deepEqual(m.map(f => f.key), ['protocol', 'max_open_conns', 'address', 'tls', 'with_options']);
});

test('parseSections: maps yaml section keys to struct names', () => {
  const s = parseSections(parseStructs(SAMPLE));
  assert.equal(s.get('mysql'), 'MysqlConfig');
  assert.equal(s.get('mysql_read_replica'), 'MysqlConfig');
  assert.equal(s.get('kafkarest'), 'KafkaRESTConfig');
});

test('parseSections: fails when FleetConfig is missing', () => {
  assert.throws(() => parseSections(parseStructs('type X struct {\n}\n')), DriftError);
});

const mini = [{ yaml_key: 'mysql', fields: [{ yaml_key: 'protocol' }, { yaml_key: 'gone' }] }, { yaml_key: 'nope', fields: [] }];

test('compare: reports removed fields, removed sections and new fields', () => {
  const r = compare(mini, parseStructs(SAMPLE));
  assert.deepEqual(r.removedFields, ['mysql.gone']);
  assert.deepEqual(r.removedSections, ['nope']);
  assert.deepEqual(r.newFields, ['mysql.max_open_conns', 'mysql.address', 'mysql.tls', 'mysql.with_options']);
  assert.ok(r.uncoveredSections.includes('mysql_read_replica'));
  assert.equal(failures(r).length, 6);
});

test('compare: ignored fields are not reported as new', () => {
  const r = compare(mini, parseStructs(SAMPLE), { mysql: ['max_open_conns', 'address', 'tls', 'with_options'] });
  assert.deepEqual(r.newFields, []);
});

// resources/config.go is a copy of Fleet's file kept for reference. The schema must agree with it
// (the weekly workflow checks the same thing against the latest release).
test('schema.json agrees with resources/config.go', () => {
  const r = compare(schema, parseStructs(read('../../resources/config.go')), ignore);
  assert.deepEqual(failures(r), []);
});

test('every schema field is unique per section', () => {
  for (const s of schema) {
    const keys = s.fields.map(f => f.yaml_key);
    assert.equal(new Set(keys).size, keys.length, s.key);
  }
});
