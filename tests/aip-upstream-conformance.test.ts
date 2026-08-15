import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { FileFsmStore } from '../src/fsm-store.ts';
import { PlumbingAipAdapter } from '../src/aip-adapter.ts';

const SNAPSHOT_DIR = new URL('../third_party/aip/2026-02-27/', import.meta.url);

function readJson(url: URL): any {
  return JSON.parse(readFileSync(url, 'utf8'));
}

const schemas = {
  manifest: readJson(new URL('agent-intake.schema.json', SNAPSHOT_DIR)),
  intake: readJson(new URL('intake-request.schema.json', SNAPSHOT_DIR)),
  offer: readJson(new URL('offer-response.schema.json', SNAPSHOT_DIR)),
  bind: readJson(new URL('bind-request.schema.json', SNAPSHOT_DIR))
};

function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return {
    manifest: ajv.compile(schemas.manifest),
    intake: ajv.compile(schemas.intake),
    offer: ajv.compile(schemas.offer),
    bind: ajv.compile(schemas.bind)
  };
}

function assertValid(name: string, validate: ReturnType<ReturnType<typeof validators>[keyof ReturnType<typeof validators>]>, value: unknown): void {
  const ok = validate(value);
  assert.equal(ok, true, `${name} failed upstream schema validation: ${JSON.stringify(validate.errors)}`);
}

function fixtureIntake() {
  return readJson(new URL('../fixtures/aip/intake.request.json', import.meta.url));
}

test('vendored files are the intended AIP v0.1.0 / 2026-02-27 contracts', () => {
  assert.match(schemas.manifest.$id, /2026-02-27\/agent-intake\.schema\.json$/);
  assert.match(schemas.intake.$id, /2026-02-27\/intake-request\.schema\.json$/);
  assert.match(schemas.offer.$id, /2026-02-27\/offer-response\.schema\.json$/);
  assert.match(schemas.bind.$id, /2026-02-27\/bind-request\.schema\.json$/);
});

test('generated manifest validates against the pinned upstream manifest schema', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aip-schema-manifest-'));
  try {
    const adapter = new PlumbingAipAdapter({ store: new FileFsmStore(join(dir, 'fsm.json')) });
    const validate = validators().manifest;
    assertValid('manifest', validate as any, adapter.manifest('https://adapter.example'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('committed intake fixture validates against the pinned upstream intake schema', () => {
  const validate = validators().intake;
  assertValid('intake request', validate as any, fixtureIntake());
});

test('generated offer validates against the pinned upstream offer-response schema', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aip-schema-offer-'));
  let i = 0;
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  ];

  try {
    const adapter = new PlumbingAipAdapter({
      store: new FileFsmStore(join(dir, 'fsm.json')),
      now: () => new Date('2026-08-14T22:30:00.000Z'),
      idFactory: () => ids[i++]
    });
    const offer = adapter.submit(fixtureIntake(), 'https://adapter.example');
    const validate = validators().offer;
    assertValid('offer response', validate as any, offer);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bind request used by the experiment validates against the pinned upstream bind schema', () => {
  const bindRequest = {
    offer_id: '11111111-1111-4111-8111-111111111111',
    session_id: '37a606b6-86f3-4b6c-8e12-a4db917802ba',
    bind_data: {
      full_name: 'Jane Fixture',
      phone: '+1-555-0100',
      address: {
        street: '100 Test Avenue',
        city: 'San Diego',
        state: 'CA',
        postal_code: '92101',
        country: 'US'
      }
    },
    agent: {
      id: 'fixture-agent-001',
      consent_scope: ['intake', 'offer', 'bind']
    },
    metadata: {
      user_confirmed_at: '2026-08-14T22:31:00.000Z'
    }
  };

  const validate = validators().bind;
  assertValid('bind request', validate as any, bindRequest);
});

test('upstream validation is actually restrictive, not a smoke-only assertion', () => {
  const invalid = fixtureIntake();
  invalid.agent.consent_scope = [];
  invalid.unexpected_top_level = true;

  const validate = validators().intake;
  assert.equal(validate(invalid), false);
  assert.ok(validate.errors && validate.errors.length > 0);
});
