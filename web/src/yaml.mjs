// Minimal YAML encoder for the flat, two-level (section -> field) shape of a Fleet config
// file. Not a general YAML library: string, integer and boolean scalars under top-level keys.

const INDICATOR_CHARS = ['-', '?', ':', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', "'", '"', '%', '@', '`'];
const YAML_KEYWORDS = ['true', 'false', 'yes', 'no', 'on', 'off', 'null', '~'];

const numericLooking = value => /^-?\d+(\.\d+)?$/.test(value);

const needsQuoting = value => {
  if (value === '') return true;
  return (
    value.trim() !== value ||
    YAML_KEYWORDS.includes(value.toLowerCase()) ||
    numericLooking(value) ||
    value.includes('\n') ||
    value.includes(' #') ||
    value.includes(': ') ||
    value.endsWith(':') ||
    INDICATOR_CHARS.some(c => value.startsWith(c))
  );
};

const quoteString = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export const scalar = value => {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  return needsQuoting(value) ? quoteString(value) : value;
};

// sections: ordered [[sectionKey, [[fieldKey, value], ...]], ...]. Sections without fields
// must already be filtered out by the caller.
export const encode = sections =>
  sections
    .map(([sectionKey, fields]) =>
      [`${scalar(sectionKey)}:`, ...fields.map(([k, v]) => `  ${scalar(k)}: ${scalar(v)}`)].join('\n') + '\n')
    .join('\n');
