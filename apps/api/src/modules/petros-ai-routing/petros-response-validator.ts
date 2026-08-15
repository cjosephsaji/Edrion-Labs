/** Small JSON-schema subset validator for dynamic Petros function schemas. Never accepts by guess. */
export function validatePetrosResponse(value: unknown, schema: Record<string, unknown>): string[] {
  const errors: string[] = [];
  validate(value, schema, '$', errors);
  return errors;
}

export function parseStructuredResponse(content: unknown): unknown {
  if (typeof content !== 'string') return content;
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(trimmed) as unknown;
}

function validate(value: unknown, schema: Record<string, unknown>, path: string, errors: string[]) {
  if ('const' in schema && schema.const !== value) {
    errors.push(`${path} must equal the required constant`);
    return;
  }
  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const alternatives = schema[keyword];
    if (Array.isArray(alternatives)) {
      const attempts = alternatives
        .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate) && typeof candidate === 'object')
        .map((candidate) => {
          const candidateErrors: string[] = [];
          validate(value, candidate, path, candidateErrors);
          return candidateErrors;
        });
      if (attempts.some((attempt) => attempt.length === 0)) return;
      errors.push(`${path} does not match any supported response variant`);
      const shortest = attempts.sort((a, b) => a.length - b.length)[0];
      if (shortest) errors.push(...shortest.slice(0, 3));
      return;
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const candidate of schema.allOf) {
      if (candidate && typeof candidate === 'object') validate(value, candidate as Record<string, unknown>, path, errors);
    }
  }
  const type = schema.type;
  if (typeof type === 'string' && !matchesType(value, type)) {
    errors.push(`${path} must be ${type}`);
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => candidate === value)) {
    errors.push(`${path} is not an allowed value`);
  }
  if (type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
    for (const key of required) if (!(key in object)) errors.push(`${path}.${key} is required`);
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties as Record<string, unknown> : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in object && childSchema && typeof childSchema === 'object') validate(object[key], childSchema as Record<string, unknown>, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const key of Object.keys(object)) {
        if (!(key in properties)) validate(object[key], schema.additionalProperties as Record<string, unknown>, `${path}.${key}`, errors);
      }
    }
  }
  if (type === 'array' && Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path} must contain at least ${schema.minItems} items`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path} must contain at most ${schema.maxItems} items`);
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, index) => validate(item, schema.items as Record<string, unknown>, `${path}[${index}]`, errors));
    }
  }
  if (type === 'string' && typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${path} is too short`);
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${path} is too long`);
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) errors.push(`${path} has an invalid format`);
    if (schema.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) errors.push(`${path} must be a UUID`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${path} must be an ISO date-time`);
  }
  if ((type === 'number' || type === 'integer') && typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path} is below the minimum`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path} is above the maximum`);
  }
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}
