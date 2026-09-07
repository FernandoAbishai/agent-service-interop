import { readFileSync } from 'node:fs';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SNAPSHOT_DIR = new URL('../third_party/aip/2026-02-27/', import.meta.url);

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, SNAPSHOT_DIR), 'utf8'));
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = {
  intake: ajv.compile(readJson('intake-request.schema.json')),
  bind: ajv.compile(readJson('bind-request.schema.json'))
} satisfies Record<string, ValidateFunction>;

export type AipRuntimeSchema = keyof typeof validators;

export function validateAgainstPinnedAipSchema(
  schema: AipRuntimeSchema,
  value: unknown
): { ok: true } | { ok: false; errors: ErrorObject[] } {
  const validate = validators[schema];
  if (validate(value)) return { ok: true };
  return { ok: false, errors: validate.errors ? [...validate.errors] : [] };
}
