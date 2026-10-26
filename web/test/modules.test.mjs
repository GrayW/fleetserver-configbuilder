import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, envVarName, flagName } from '../src/builder.mjs';
import { encode, scalar } from '../src/yaml.mjs';
import { summarize } from '../src/summary.mjs';
import { importYaml } from '../src/importer.mjs';
import { encodeShare, decodeShare } from '../src/share.mjs';
import { ESSENTIALS, essentialFields, secretFields } from '../src/wizard.mjs';
import { usageSteps } from '../src/usage.mjs';

const schema = JSON.parse(readFileSync(new URL('../data/schema.json', import.meta.url), 'utf8'));
const values = {
  mysql: { address: 'db:3306', password: 'hunter2' },
  redis: { address: 'cache:6379' },
  license: { key: 'LIC-123' },
};

test('yaml scalars: quoting rules', () => {
  assert.equal(scalar('plain'), 'plain');
  for (const v of ['', ' x', 'yes', 'NULL', '123', '-1.5', 'a: b', 'a #b', 'a:', '-x', '{x}', 'a\nb']) {
    assert.match(scalar(v), /^"/, JSON.stringify(v));
  }
  assert.equal(scalar('a "b"'), 'a "b"');
  assert.equal(scalar('"b"'), '"\\"b\\""');
  assert.equal(encode([]), '');
});

test('names: env var and flag derive from section prefix and yaml key', () => {
  const s = schema.find(x => x.key === 'mysql_read_replica');
  const f = s.fields.find(x => x.key === 'address');
  assert.equal(envVarName(s, f), 'FLEET_MYSQL_READ_REPLICA_ADDRESS');
  assert.equal(flagName(s, f), 'mysql_read_replica_address');
});

test('secrets: omit mode keeps passwords out of every output and lists them', () => {
  const r = build(schema, values, '', { secrets: 'omit' });
  for (const text of [r.yaml, r.env, r.flags]) {
    assert.ok(!text.includes('hunter2') && !text.includes('LIC-123'));
  }
  assert.deepEqual(r.omitted.map(o => o.env), ['FLEET_MYSQL_PASSWORD', 'FLEET_LICENSE_KEY']);
  assert.match(r.yaml, /address: "?db:3306"?/);
  assert.ok(!/^license:/m.test(r.yaml));
});

test('secrets: include mode (default) writes them', () => {
  const r = build(schema, values);
  assert.match(r.env, /FLEET_MYSQL_PASSWORD=hunter2/);
  assert.deepEqual(r.omitted, []);
});

test('summary: flags values that equal the default, marks secrets', () => {
  const rows = summarize(schema, { mysql: { address: 'localhost:3306', database: 'prod', password: 'x' } });
  assert.deepEqual(rows.map(r => [r.field, r.isDefault, r.secret]), [
    ['address', true, false], ['password', false, true], ['database', false, false],
  ]);
});

test('wizard: essentials reference real, non-secret fields; secrets are the password fields', () => {
  for (const key of Object.keys(ESSENTIALS)) {
    for (const f of essentialFields(schema, key)) {
      assert.ok(f, `${key} lists a field that is not in the schema`);
      assert.notEqual(f.type, 'password');
    }
  }
  assert.equal(secretFields(schema).length, 5);
});

test('share: round-trips, drops secrets and unknown keys', () => {
  const frag = encodeShare(schema, { ...values, server: { address: '0.0.0.0:8443' } });
  assert.ok(!frag.includes('hunter2'));
  const { values: back } = decodeShare(schema, '#' + frag);
  assert.deepEqual(back, { mysql: { address: 'db:3306' }, redis: { address: 'cache:6379' }, server: { address: '0.0.0.0:8443' } });
  assert.deepEqual(decodeShare(schema, '#v1=!!!').values, {});
  assert.deepEqual(decodeShare(schema, '#nonsense').values, {});
  assert.equal(encodeShare(schema, { mysql: { password: 'x' } }), '');
});

test('share: unicode survives', () => {
  const { values: back } = decodeShare(schema, encodeShare(schema, { mysql: { database: 'données ✓' } }));
  assert.equal(back.mysql.database, 'données ✓');
});

test('import: round-trips generated output', () => {
  const v = { mysql: { address: 'db:3306', max_open_conns: '10' }, server: { tls: 'false', address: '0.0.0.0:8080' }, redis: { database: '2' } };
  const out = build(schema, v);
  const r = importYaml(schema, out.yaml);
  assert.deepEqual(r.values, v);
  assert.equal(r.extra, '');
  assert.deepEqual(build(schema, r.values).yaml, out.yaml);
});

test('import: quotes, comments, null, CRLF', () => {
  const r = importYaml(schema, 'mysql:\r\n  address: "db:3306" # primary\r\n  username: \'it\'\'s\'\r\n  database: ~\r\n');
  assert.deepEqual(r.values.mysql, { address: 'db:3306', username: "it's", database: '' });
});

test('import: unknown sections and complex blocks are kept verbatim, not guessed at', () => {
  const text = 'mysql:\n  address: a:1\nfilesystem:\n  status_log_file: /x\nredis:\n  address: r:1\n  bogus: 1\nserver:\n  trusted_proxies:\n    - a\n';
  const r = importYaml(schema, text);
  assert.deepEqual(r.values, { mysql: { address: 'a:1' } });
  assert.deepEqual(r.kept, ['filesystem', 'redis', 'server']);
  assert.match(r.extra, /^filesystem:\n {2}status_log_file: \/x\n\nredis:\n {2}address: r:1\n {2}bogus: 1\n\nserver:\n {2}trusted_proxies:\n {4}- a$/);
});

test('import: leading comments, a repeated section, and empty input', () => {
  const r = importYaml(schema, '# my config\nmysql:\n  address: a:1\nmysql:\n  address: b:2\n');
  assert.deepEqual(r.values, { mysql: { address: 'a:1' } });
  assert.match(r.extra, /address: b:2/);
  assert.deepEqual(importYaml(schema, ''), { values: {}, extra: '', kept: [] });
});

test('usage: secrets step only when something was omitted; db prepared before serve', () => {
  const none = usageSteps('unix', {});
  assert.deepEqual(none.map(s => s.title), ['Prepare the database once', 'Start Fleet with the config file']);
  const some = usageSteps('windows', { omitted: [{ env: 'FLEET_MYSQL_PASSWORD' }] });
  assert.match(some[0].code, /\$env:FLEET_MYSQL_PASSWORD/);
  assert.match(usageSteps('unix', { omitted: [{ env: 'X' }] })[0].code, /read -rs X; export X/);
});
