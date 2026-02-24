/**
 * Schema Validate — Lightweight runtime type/struct validator.
 * No dependencies, supports nested objects, arrays, optional fields, custom validators.
 *
 * Schema DSL:
 *   'string' | 'number' | 'boolean' | 'function' | 'object' | 'array'
 *   { type: 'string', optional: true, min: 1, max: 100 }
 *   { type: 'number', min: 0, max: 100, integer: true }
 *   { type: 'array', items: 'string', minLength: 1 }
 *   { type: 'object', shape: { name: 'string', age: 'number' } }
 *   (value) => true | 'error message'  (custom validator function)
 */
function validate(value, schema, path = '') {
  const errors = [];

  if (typeof schema === 'function') {
    const result = schema(value);
    if (result !== true) {
      errors.push({ path: path || '$', message: result || 'Custom validation failed' });
    }
    return errors;
  }

  if (typeof schema === 'string') {
    schema = { type: schema };
  }

  if (schema.optional && (value === undefined || value === null)) {
    return errors;
  }

  if (value === undefined || value === null) {
    if (!schema.optional) {
      errors.push({ path: path || '$', message: `Required value is ${value}` });
    }
    return errors;
  }

  // Type checking
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ path: path || '$', message: `Expected array, got ${typeof value}` });
      return errors;
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: path || '$', message: `Array too short: ${value.length} < ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path: path || '$', message: `Array too long: ${value.length} > ${schema.maxLength}` });
    }
    if (schema.items) {
      value.forEach((item, i) => {
        errors.push(...validate(item, schema.items, `${path}[${i}]`));
      });
    }
  } else if (schema.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      errors.push({ path: path || '$', message: `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}` });
      return errors;
    }
    if (schema.shape) {
      for (const [key, fieldSchema] of Object.entries(schema.shape)) {
        errors.push(...validate(value[key], fieldSchema, path ? `${path}.${key}` : key));
      }
    }
  } else if (schema.type) {
    if (typeof value !== schema.type) {
      errors.push({ path: path || '$', message: `Expected ${schema.type}, got ${typeof value}` });
      return errors;
    }
  }

  // Numeric constraints
  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.integer && !Number.isInteger(value)) {
      errors.push({ path: path || '$', message: `Expected integer, got ${value}` });
    }
    if (schema.min !== undefined && value < schema.min) {
      errors.push({ path: path || '$', message: `Value ${value} < min ${schema.min}` });
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push({ path: path || '$', message: `Value ${value} > max ${schema.max}` });
    }
  }

  // String constraints
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.min !== undefined && value.length < schema.min) {
      errors.push({ path: path || '$', message: `String too short: ${value.length} < ${schema.min}` });
    }
    if (schema.max !== undefined && value.length > schema.max) {
      errors.push({ path: path || '$', message: `String too long: ${value.length} > ${schema.max}` });
    }
    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push({ path: path || '$', message: `String does not match pattern ${schema.pattern}` });
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({ path: path || '$', message: `Value "${value}" not in enum [${schema.enum.join(', ')}]` });
    }
  }

  return errors;
}

function isValid(value, schema) {
  return validate(value, schema).length === 0;
}

function assert(value, schema, label) {
  const errors = validate(value, schema);
  if (errors.length > 0) {
    const msg = errors.map(e => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`${label ? label + ': ' : ''}Validation failed: ${msg}`);
  }
  return value;
}

module.exports = { validate, isValid, assert };
