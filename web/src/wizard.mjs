// The guided path: which fields appear on the "Essentials" step. Everything else lives under
// "More options". Password-type fields are never listed here; they go on the Secrets step.
export const ESSENTIALS = {
  mysql: ['address', 'database', 'username'],
  redis: ['address', 'use_tls'],
  server: ['address', 'tls', 'cert', 'key'],
};

export const secretFields = schema =>
  schema.flatMap(section => section.fields.filter(f => f.type === 'password').map(field => ({ section, field })));

export const essentialFields = (schema, sectionKey) => {
  const section = schema.find(s => s.key === sectionKey);
  return (ESSENTIALS[sectionKey] ?? []).map(k => section.fields.find(f => f.key === k));
};
