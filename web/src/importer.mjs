// Reads an existing fleet.yml into form values. Only the flat shape this generator writes
// (top-level section, two-space-indented `key: scalar` lines) is understood. A section that is
// unknown, or has anything else in it, is kept verbatim in `extra` rather than guessed at.

const unquote = text => {
  const t = text.trim();
  if (t.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(t);
    return m ? m[1].replace(/\\(.)/g, '$1') : null;
  }
  if (t.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(t);
    return m ? m[1].replace(/''/g, "'") : null;
  }
  const plain = t.replace(/(^|\s)#.*$/, '').trim();
  if (/^[&*!|>\[{]/.test(plain)) return null; // anchors, tags, block scalars, flow collections
  return plain === 'null' || plain === '~' ? '' : plain;
};

// Split into blocks: a column-0 key line plus everything indented, blank or commented after it.
const toBlocks = text => {
  const blocks = [];
  let current = null;
  let leading = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^[^\s#][^:]*:/.test(line)) {
      current = { header: line, body: [], lead: leading };
      leading = [];
      blocks.push(current);
    } else if (current && (line.trim() === '' || /^\s/.test(line) || line.startsWith('#'))) {
      current.body.push(line);
    } else {
      leading.push(line);
    }
  }
  if (leading.length) blocks.push({ header: null, body: leading, lead: [] });
  return blocks;
};

const verbatim = block => [block.header, ...block.body].filter(l => l !== null).join('\n').replace(/\s+$/, '');

export const importYaml = (schema, text) => {
  const values = {};
  const kept = [];
  const extra = [];
  for (const block of toBlocks(String(text ?? ''))) {
    const m = block.header && /^([A-Za-z0-9_]+):\s*(?:#.*)?$/.exec(block.header);
    const section = m && schema.find(s => s.yaml_key === m[1]);
    const lines = block.body.filter(l => l.trim() !== '' && !l.trim().startsWith('#'));
    const parsed = section && lines.map(l => /^ {2}([A-Za-z0-9_]+):(?:\s+(.*))?$/.exec(l));
    const ok = section && !values[section.key] && lines.length > 0 && parsed.every((p, i) => {
      if (!p) return false;
      const field = section.fields.find(f => f.yaml_key === p[1]);
      return field && unquote(p[2] ?? '') !== null;
    });
    if (ok) {
      values[section.key] = {};
      for (const p of parsed) {
        const field = section.fields.find(f => f.yaml_key === p[1]);
        values[section.key][field.key] = unquote(p[2] ?? '');
      }
    } else {
      const v = verbatim(block);
      if (v.trim() !== '') {
        extra.push(v);
        if (block.header) kept.push(block.header.replace(/:.*$/, ''));
      }
    }
  }
  return { values, extra: extra.join('\n\n'), kept };
};
