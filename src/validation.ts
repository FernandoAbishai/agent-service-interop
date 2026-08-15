import type { AipBindRequest, AipIntakeRequest, ConsentScope, PlumbingIntakeData } from './types.ts';

export class ValidationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSTAL_CODE = /^\d{5}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSENT_SCOPES = new Set<ConsentScope>(['intake', 'offer', 'bind', 'account_creation', 'payment']);
const INTAKE_KEYS = new Set(['postal_code', 'service_need', 'urgency', 'availability_window']);
const REQUEST_KEYS = new Set(['aip_version', 'agent', 'intake_data', 'session_id', 'metadata']);
const AGENT_KEYS = new Set(['id', 'platform', 'name', 'consent_scope']);
const BIND_KEYS = new Set(['offer_id', 'session_id', 'bind_data', 'agent', 'metadata']);
const BIND_AGENT_KEYS = new Set(['id', 'consent_scope']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError('SCHEMA_MISMATCH', `${label} contains unsupported field(s): ${unknown.join(', ')}`);
  }
}

function validateScopes(value: unknown, required: ConsentScope): ConsentScope[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((scope) => typeof scope === 'string' && CONSENT_SCOPES.has(scope as ConsentScope))) {
    throw new ValidationError('INVALID_INPUT', 'agent.consent_scope must contain only valid AIP scopes');
  }
  if (new Set(value).size !== value.length) {
    throw new ValidationError('INVALID_INPUT', 'agent.consent_scope must not contain duplicates');
  }
  if (!value.includes(required)) {
    throw new ValidationError('INVALID_INPUT', `agent.consent_scope must include "${required}"`);
  }
  return value as ConsentScope[];
}

export function isUuidV4(value: string): boolean {
  return UUID_V4.test(value);
}

export function validateIntakeRequest(body: unknown): AipIntakeRequest {
  if (!isRecord(body)) throw new ValidationError('INVALID_INPUT', 'Request body must be a JSON object');
  rejectUnknownKeys(body, REQUEST_KEYS, 'request');

  if (body.aip_version !== '0.1.0') {
    throw new ValidationError('INVALID_INPUT', 'This adapter is pinned to AIP 0.1.0');
  }
  if (typeof body.session_id !== 'string' || !isUuidV4(body.session_id)) {
    throw new ValidationError('INVALID_INPUT', 'session_id must be a UUID v4');
  }
  if (!isRecord(body.agent)) throw new ValidationError('INVALID_INPUT', 'agent is required');
  rejectUnknownKeys(body.agent, AGENT_KEYS, 'agent');
  if (typeof body.agent.id !== 'string' || body.agent.id.length === 0) {
    throw new ValidationError('INVALID_INPUT', 'agent.id is required');
  }
  validateScopes(body.agent.consent_scope, 'intake');

  if (!isRecord(body.intake_data)) throw new ValidationError('SCHEMA_MISMATCH', 'intake_data is required');
  rejectUnknownKeys(body.intake_data, INTAKE_KEYS, 'intake_data');
  const data = body.intake_data;

  if (typeof data.postal_code !== 'string' || !POSTAL_CODE.test(data.postal_code)) {
    throw new ValidationError('SCHEMA_MISMATCH', 'postal_code must be a five-digit US postal code');
  }
  if (data.service_need !== 'leak_diagnosis') {
    throw new ValidationError('SCHEMA_MISMATCH', 'service_need must be leak_diagnosis in the Tier 1 fixture');
  }
  if (!['emergency', 'within_24h', 'this_week', 'flexible'].includes(String(data.urgency))) {
    throw new ValidationError('SCHEMA_MISMATCH', 'urgency is not supported');
  }
  if (!['weekday_morning', 'weekday_afternoon', 'weekday_after_15_00', 'weekend', 'flexible'].includes(String(data.availability_window))) {
    throw new ValidationError('SCHEMA_MISMATCH', 'availability_window is not supported');
  }

  return body as AipIntakeRequest;
}

export function validateBindRequest(body: unknown): AipBindRequest {
  if (!isRecord(body)) throw new ValidationError('INVALID_INPUT', 'Bind body must be a JSON object');
  rejectUnknownKeys(body, BIND_KEYS, 'bind request');
  if (typeof body.offer_id !== 'string' || body.offer_id.length === 0) {
    throw new ValidationError('INVALID_INPUT', 'offer_id is required');
  }
  if (typeof body.session_id !== 'string' || !isUuidV4(body.session_id)) {
    throw new ValidationError('INVALID_INPUT', 'session_id must be a UUID v4');
  }
  if (!isRecord(body.agent)) throw new ValidationError('INVALID_INPUT', 'agent is required');
  rejectUnknownKeys(body.agent, BIND_AGENT_KEYS, 'bind agent');
  if (typeof body.agent.id !== 'string' || body.agent.id.length === 0) {
    throw new ValidationError('INVALID_INPUT', 'agent.id is required');
  }
  validateScopes(body.agent.consent_scope, 'bind');

  if (!isRecord(body.bind_data)) throw new ValidationError('BIND_INCOMPLETE', 'bind_data is required');
  const bind = body.bind_data;
  if (typeof bind.full_name !== 'string' || bind.full_name.trim().length === 0) {
    throw new ValidationError('BIND_INCOMPLETE', 'bind_data.full_name is required');
  }
  if (typeof bind.phone !== 'string' || bind.phone.trim().length === 0) {
    throw new ValidationError('BIND_INCOMPLETE', 'bind_data.phone is required');
  }
  if (bind.email !== undefined && (typeof bind.email !== 'string' || !EMAIL.test(bind.email))) {
    throw new ValidationError('BIND_INCOMPLETE', 'bind_data.email must be a valid email address when provided');
  }
  if (!isRecord(bind.address)) throw new ValidationError('BIND_INCOMPLETE', 'bind_data.address is required');
  for (const key of ['street', 'city', 'state', 'postal_code', 'country']) {
    if (typeof bind.address[key] !== 'string' || String(bind.address[key]).trim().length === 0) {
      throw new ValidationError('BIND_INCOMPLETE', `bind_data.address.${key} is required`);
    }
  }

  return body as AipBindRequest;
}

export function assertNoPiiAtIntake(data: PlumbingIntakeData): void {
  const serialized = JSON.stringify(data).toLowerCase();
  for (const marker of ['full_name', 'email', 'phone', 'street', 'address']) {
    if (serialized.includes(marker)) {
      throw new ValidationError('SCHEMA_MISMATCH', `PII marker "${marker}" is not allowed at intake`);
    }
  }
}
