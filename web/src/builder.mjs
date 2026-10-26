// Turns form state (raw strings keyed by section and field) into the three representations
// Fleet accepts: a YAML config file, environment variables and CLI flags. Blank fields are
// omitted, so the output only reflects what the user actually set.
import { encode } from './yaml.mjs';

export const envVarName = (section, field) => 'FLEET_' + `${section.flag_prefix}_${field.yaml_key}`.toUpperCase();
export const flagName = (section, field) => `${section.flag_prefix}_${field.yaml_key}`;

const DURATION = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/;
const BYTESIZE = /^\d+(\.\d+)?\s?(b|kb|kib|k|mb|mib|m|gb|gib|g|tb|tib|t)?$/i;
const validDuration = raw => raw === '0' || DURATION.test(raw);

// Returns {omit: true}, {ok: value} or {error: message}.
const castField = (field, raw) => {
  if (raw === '') return { omit: true };
  const { type, label } = field;
  switch (type) {
    case 'integer':
      return /^[+-]?\d+$/.test(raw) ? { ok: BigInt(raw) } : { error: `${label} must be a whole number` };
    case 'boolean':
      return raw === 'true' || raw === 'false' ? { ok: raw === 'true' } : { error: `${label} must be true or false` };
    case 'select':
      return field.options.includes(raw) ? { ok: raw } : { error: `${label} must be one of: ${field.options.join(', ')}` };
    case 'duration':
      return validDuration(raw)
        ? { ok: raw }
        : { error: `${label} doesn't look like a valid duration (e.g. 5m, 1h30m, 500ms, or 0)` };
    case 'bytesize':
      return BYTESIZE.test(raw)
        ? { ok: raw }
        : { error: `${label} doesn't look like a valid size (e.g. 10GiB, 500KB, or a plain number of bytes)` };
    default:
      return { ok: raw };
  }
};

const plain = value => (typeof value === 'string' ? value : String(value));

const processFields = (section, sectionValues, includeSecrets) => {
  const included = [];
  const errors = [];
  const omitted = [];
  for (const field of section.fields) {
    const raw = String(sectionValues?.[field.key] ?? '').trim();
    const r = castField(field, raw);
    if (r.error) errors.push({ section: section.key, field: field.key, label: field.label, message: r.error });
    else if (r.omit) continue;
    else if (field.type === 'password' && !includeSecrets) omitted.push({ section: section.key, field: field.key, label: field.label, env: envVarName(section, field) });
    else included.push([field, r.ok]);
  }
  return { included, errors, omitted };
};

const render = (used, nameFun) =>
  used
    .flatMap(({ section, included }) => included.map(([field, value]) => `${nameFun(section, field)}=${plain(value)}`))
    .join('\n');

const appendExtra = (yaml, extraYaml) => {
  const trimmed = String(extraYaml ?? '').trim();
  if (trimmed === '') return yaml;
  const header = '# ----- Advanced: appended as-is, not validated or merged with the above -----\n';
  return yaml === '' ? `${header}${trimmed}\n` : `${yaml}\n${header}${trimmed}\n`;
};

// opts.secrets: 'include' (default) writes password-type fields into every output; 'omit'
// leaves them out and lists them in `omitted` so the caller can point at the env var instead.
export const build = (schema, values = {}, extraYaml = '', { secrets = 'include' } = {}) => {
  const includeSecrets = secrets === 'include';
  const processed = schema.map(section => ({ section, ...processFields(section, values[section.key], includeSecrets) }));
  const used = processed.filter(r => r.included.length > 0);
  const yaml = encode(used.map(r => [r.section.yaml_key, r.included.map(([f, v]) => [f.yaml_key, v])]));
  return {
    yaml: appendExtra(yaml, extraYaml),
    env: render(used, envVarName),
    flags: render(used, (s, f) => '--' + flagName(s, f)),
    errors: processed.flatMap(r => r.errors),
    omitted: processed.flatMap(r => r.omitted),
  };
};
