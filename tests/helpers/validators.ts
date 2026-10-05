import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { loadJson } from './load-json';

// ajv-formats is CommonJS: depending on interop the callable is the module or its default export.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as unknown as (ajv: Ajv) => Ajv;

function createAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv;
}

function compile(schemaFile: string): ValidateFunction {
  return createAjv().compile(loadJson<object>('schemas', schemaFile));
}

export const validateHouse = compile('house.schema.json');
export const validateIssues = compile('issue.schema.json');
export const validateCatalog = compile('catalog.schema.json');

/** One readable line per error: "<json pointer> <message>" (the root is shown as "(root)"). */
export function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return '(no errors)';
  return errors
    .map((error) => {
      const extra = error.params && 'additionalProperty' in error.params
        ? ` "${String(error.params.additionalProperty)}"`
        : '';
      return `${error.instancePath || '(root)'} ${error.message}${extra}`;
    })
    .join('\n');
}

/** Validates and returns the formatted errors ('' when valid), so assertions print them on failure. */
export function errorsOf(validate: ValidateFunction, data: unknown): string {
  return validate(data) ? '' : formatErrors(validate.errors);
}
