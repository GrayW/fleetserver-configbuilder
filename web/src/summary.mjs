// "What you chose": the valid, non-blank fields, flagged when they just repeat Fleet's default.
export const summarize = (schema, values = {}) =>
  schema.flatMap(section =>
    section.fields.flatMap(field => {
      const raw = String(values[section.key]?.[field.key] ?? '').trim();
      if (raw === '') return [];
      return [{
        section: section.key,
        sectionTitle: section.title,
        field: field.key,
        label: field.label,
        value: raw,
        secret: field.type === 'password',
        isDefault: String(field.default) === raw,
      }];
    }));
