// Share links: non-secret field values in the URL fragment. The fragment is never sent to a
// server. Password fields and the raw "Advanced" YAML are never included.
const toB64 = str => {
  let bin = '';
  for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = b64 => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
};

export const encodeShare = (schema, values = {}) => {
  const out = {};
  for (const section of schema) {
    for (const field of section.fields) {
      const raw = String(values[section.key]?.[field.key] ?? '').trim();
      if (raw === '' || field.type === 'password') continue;
      (out[section.key] ??= {})[field.key] = raw;
    }
  }
  return Object.keys(out).length === 0 ? '' : `v1=${toB64(JSON.stringify(out))}`;
};

// Returns {values} containing only keys that exist in the schema, never password fields.
export const decodeShare = (schema, fragment) => {
  const m = /^#?v1=([A-Za-z0-9_-]+)$/.exec(fragment ?? '');
  if (!m) return { values: {} };
  let parsed;
  try { parsed = JSON.parse(fromB64(m[1])); } catch { return { values: {} }; }
  const values = {};
  for (const section of schema) {
    for (const field of section.fields) {
      const v = parsed?.[section.key]?.[field.key];
      if (typeof v === 'string' && v !== '' && field.type !== 'password') (values[section.key] ??= {})[field.key] = v;
    }
  }
  return { values };
};
