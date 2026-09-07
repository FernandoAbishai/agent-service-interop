import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { FileFsmStore } from '../src/fsm-store.ts';
import { PlumbingAipAdapter } from '../src/aip-adapter.ts';
import { toCanonicalWorkflow } from '../src/canonical.ts';

const schema = JSON.parse(
  readFileSync(new URL('../schemas/service-workflow.schema.json', import.meta.url), 'utf8')
);

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

test('committed plumbing workflow fixture validates against the experimental canonical schema', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('../fixtures/plumbing/workflow.example.json', import.meta.url), 'utf8')
  );
  const validate = validator();
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
});

test('runtime canonical projection validates against the experimental canonical schema', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-canonical-schema-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  let idIndex = 0;
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  ];

  try {
    const adapter = new PlumbingAipAdapter({
      store,
      now: () => new Date('2026-08-14T22:30:00.000Z'),
      idFactory: () => ids[idIndex++]
    });
    const offer = adapter.submit({
      aip_version: '0.1.0',
      agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer'] },
      intake_data: {
        postal_code: '92101',
        service_need: 'leak_diagnosis',
        urgency: 'this_week',
        availability_window: 'weekday_after_15_00'
      },
      session_id: '37a606b6-86f3-4b6c-8e12-a4db917802ba'
    }, 'https://adapter.example');

    adapter.bind({
      offer_id: offer.offer.id,
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
      agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer', 'bind'] }
    });

    const session = store.getBySession('37a606b6-86f3-4b6c-8e12-a4db917802ba');
    assert.ok(session);
    const canonical = toCanonicalWorkflow(session);
    const validate = validator();
    assert.equal(validate(canonical), true, JSON.stringify(validate.errors));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
