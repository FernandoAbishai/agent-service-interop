import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Address } from '../src/types.ts';
import { FileFsmStore } from '../src/fsm-store.ts';
import { PlumbingAipAdapter } from '../src/aip-adapter.ts';
import { createAipServer } from '../src/server.ts';
import { assertCanonicalWorkflow, toCanonicalWorkflow } from '../src/canonical.ts';
import { MemoryWorkflowCorrelationStore } from '../src/workflow-correlation.ts';

const SESSION = '37a606b6-86f3-4b6c-8e12-a4db917802ba';
const SECOND_SESSION = '71d6c362-5a87-4de5-a4e0-696cfcf14ed6';

function intake(sessionId = SESSION) {
  return {
    aip_version: '0.1.0',
    agent: {
      id: 'fixture-agent-001',
      platform: 'custom',
      name: 'Fixture Buyer Agent',
      consent_scope: ['intake', 'offer']
    },
    intake_data: {
      postal_code: '92101',
      service_need: 'leak_diagnosis',
      urgency: 'this_week',
      availability_window: 'weekday_after_15_00'
    },
    session_id: sessionId,
    metadata: {
      locale: 'en-US',
      timezone: 'America/Tijuana'
    }
  };
}

const ADDRESS: Address = {
  street: '100 Test Avenue',
  city: 'San Diego',
  state: 'CA',
  postal_code: '92101',
  country: 'US'
};

async function withServer(run: (ctx: { baseUrl: string; store: FileFsmStore; setNow: (date: Date) => void }) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-'));
  let current = new Date('2026-08-14T22:30:00.000Z');
  let idCounter = 0;
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777',
    '88888888-8888-4888-8888-888888888888'
  ];

  const store = new FileFsmStore(join(dir, 'fsm.json'));
  const adapter = new PlumbingAipAdapter({
    store,
    now: () => new Date(current),
    idFactory: () => ids[idCounter++] ?? `overflow-${idCounter}`
  });
  const server = createAipServer(adapter);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({
      baseUrl,
      store,
      setNow: (date) => { current = date; }
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
}

async function post(baseUrl: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('serves a direct-provider AIP manifest with privacy-minimized intake', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/.well-known/agent-intake.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');

    const manifest = await response.json() as any;
    assert.equal(manifest.aip_version, '0.1.0');
    assert.equal(manifest.intakes.length, 1);
    assert.equal(manifest.intakes[0].id, 'residential-plumbing-quote');
    assert.equal(manifest.intakes[0].binding_available, true);
    assert.equal(manifest.intakes[0].privacy.pii_required, false);
    assert.equal(manifest.intakes[0].privacy.data_retention, 'session');
    assert.equal(manifest.intakes[0].input_schema.additionalProperties, false);
    assert.deepEqual(manifest.intakes[0].input_schema.required, ['postal_code', 'service_need', 'urgency', 'availability_window']);
  });
});

test('intake creates a non-binding offer while keeping PII out of the FSM state', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const response = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    assert.equal(response.status, 200);
    const offer = await response.json() as any;

    assert.equal(offer.status, 'offer');
    assert.equal(offer.session_id, SESSION);
    assert.deepEqual(offer.offer.bind_requires, ['full_name', 'phone', 'address']);
    assert.equal(offer.offer.details.total, 234);
    assert.equal(offer.offer.details.currency, 'USD');

    const state = store.getBySession(SESSION);
    assert.ok(state);
    assert.equal(state.quote.status, 'offered');
    assert.equal(state.job.status, 'pending');
    assert.equal(state.binding, null);

    const serialized = JSON.stringify(state).toLowerCase();
    assert.equal(serialized.includes('test avenue'), false);
    assert.equal(serialized.includes('full_name'), false);
    assert.equal(serialized.includes('phone'), false);
  });
});

test('intake rejects PII-shaped extra fields instead of silently accepting them', async () => {
  await withServer(async ({ baseUrl }) => {
    const request: any = intake();
    request.intake_data.address = '100 Test Avenue';
    const response = await post(baseUrl, '/api/aip/residential-plumbing-quote', request);
    assert.equal(response.status, 400);
    const error = await response.json() as any;
    assert.equal(error.status, 'error');
    assert.equal(error.error.code, 'SCHEMA_MISMATCH');
  });
});

test('runtime intake rejects shapes rejected by the pinned upstream schema', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const invalidRequests: Array<{ mutate: (request: any) => void; label: string }> = [
      { label: 'non-string optional agent platform', mutate: (request) => { request.agent.platform = 123; } },
      { label: 'unknown top-level field', mutate: (request) => { request.unexpected = true; } },
      { label: 'unknown agent field', mutate: (request) => { request.agent.unexpected = true; } },
      { label: 'non-object metadata', mutate: (request) => { request.metadata = 'not-an-object'; } },
      { label: 'invalid metadata locale', mutate: (request) => { request.metadata.locale = 'EN_us'; } },
      { label: 'invalid metadata timestamp', mutate: (request) => { request.metadata.timestamp = 'yesterday'; } }
    ];

    for (const candidate of invalidRequests) {
      const request: any = intake();
      candidate.mutate(request);
      const response = await post(baseUrl, '/api/aip/residential-plumbing-quote', request);
      assert.equal(response.status, 400, candidate.label);
      const error = await response.json() as any;
      assert.equal(error.error.code, 'SCHEMA_MISMATCH', candidate.label);
    }

    assert.deepEqual(store.read().sessions, {}, 'schema-invalid intake must not create operational state');
  });
});

test('runtime intake preserves allowed metadata extensions but rejects PII-shaped metadata keys', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const allowed: any = intake();
    allowed.metadata.experiment = { cohort: 'runtime-conformance' };
    const accepted = await post(baseUrl, '/api/aip/residential-plumbing-quote', allowed);
    assert.equal(accepted.status, 200);

    const piiRequest: any = intake(SECOND_SESSION);
    piiRequest.metadata.extension = { customer_phone: '+1-555-0100' };
    const rejected = await post(baseUrl, '/api/aip/residential-plumbing-quote', piiRequest);
    assert.equal(rejected.status, 400);
    const error = await rejected.json() as any;
    assert.equal(error.error.code, 'SCHEMA_MISMATCH');
    assert.equal(store.getBySession(SECOND_SESSION), undefined);
  });
});

test('bind handoff accepts the quote and schedules the FSM job in the synthetic adapter', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const offerResponse = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    const offer = (await offerResponse.json() as any).offer;

    const bindResponse = await post(baseUrl, '/api/aip/bind', {
      offer_id: offer.id,
      session_id: SESSION,
      bind_data: {
        full_name: 'Jane Fixture',
        phone: '+1-555-0100',
        address: ADDRESS
      },
      agent: {
        id: 'fixture-agent-001',
        consent_scope: ['intake', 'offer', 'bind']
      },
      metadata: {
        user_confirmed_at: '2026-08-14T22:31:00.000Z'
      }
    });

    assert.equal(bindResponse.status, 200);
    const result = await bindResponse.json() as any;
    assert.equal(result.status, 'bound');
    assert.equal(result.adapter_result.aip_snapshot, '2026-02-27');
    assert.equal(result.adapter_result.quote_status, 'accepted');
    assert.equal(result.adapter_result.job_status, 'scheduled');

    const state = store.getBySession(SESSION);
    assert.ok(state);
    assert.equal(state.quote.status, 'accepted');
    assert.equal(state.job.status, 'scheduled');
    assert.equal(state.binding?.full_name, 'Jane Fixture');
    assert.deepEqual(state.binding?.address, ADDRESS);

    const canonical = toCanonicalWorkflow(state, 'wf-bind-projection-test');
    assertCanonicalWorkflow(canonical);
    assert.equal(canonical.quote.status, 'accepted');
    assert.equal(canonical.job.status, 'scheduled');
    assert.equal(canonical.provenance.protocol_views[0].status, 'round_tripped');
    assert.equal(canonical.quote.representation_refs.aip_offer, offer.id);
  });
});

test('bind enforces session, agent, consent and offer expiry', async () => {
  await withServer(async ({ baseUrl, setNow }) => {
    const firstOfferResponse = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    const firstOffer = (await firstOfferResponse.json() as any).offer;

    const wrongAgent = await post(baseUrl, '/api/aip/bind', {
      offer_id: firstOffer.id,
      session_id: SESSION,
      bind_data: { full_name: 'Jane Fixture', phone: '+1-555-0100', address: ADDRESS },
      agent: { id: 'different-agent', consent_scope: ['bind'] }
    });
    assert.equal(wrongAgent.status, 400);

    const noBindConsent = await post(baseUrl, '/api/aip/bind', {
      offer_id: firstOffer.id,
      session_id: SESSION,
      bind_data: { full_name: 'Jane Fixture', phone: '+1-555-0100', address: ADDRESS },
      agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer'] }
    });
    assert.equal(noBindConsent.status, 400);

    const secondOfferResponse = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake(SECOND_SESSION));
    const secondOffer = (await secondOfferResponse.json() as any).offer;
    setNow(new Date('2026-08-22T22:30:01.000Z'));

    const expired = await post(baseUrl, '/api/aip/bind', {
      offer_id: secondOffer.id,
      session_id: SECOND_SESSION,
      bind_data: { full_name: 'Jane Fixture', phone: '+1-555-0100', address: ADDRESS },
      agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer', 'bind'] }
    });
    assert.equal(expired.status, 410);
    const error = await expired.json() as any;
    assert.equal(error.error.code, 'OFFER_EXPIRED');
  });
});

test('runtime Bind rejects optional shapes rejected by the pinned upstream schema before mutation', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const offerResponse = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    const offer = (await offerResponse.json() as any).offer;
    const before = structuredClone(store.getBySession(SESSION));

    for (const metadata of ['not-an-object', { user_confirmed_at: 'not-a-date' }]) {
      const response = await post(baseUrl, '/api/aip/bind', {
        offer_id: offer.id,
        session_id: SESSION,
        bind_data: { full_name: 'Jane Fixture', phone: '+1-555-0100', address: ADDRESS },
        agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer', 'bind'] },
        metadata
      });
      assert.equal(response.status, 400);
      const error = await response.json() as any;
      assert.equal(error.error.code, 'SCHEMA_MISMATCH');
      assert.deepEqual(store.getBySession(SESSION), before, 'schema-invalid Bind must not mutate operational state');
    }
  });
});

test('runtime Bind preserves upstream-extensible bind_data and metadata fields', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const offerResponse = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    const offer = (await offerResponse.json() as any).offer;

    const response = await post(baseUrl, '/api/aip/bind', {
      offer_id: offer.id,
      session_id: SESSION,
      bind_data: {
        full_name: 'Jane Fixture',
        phone: '+1-555-0100',
        address: ADDRESS,
        company: 'Fixture Services LLC',
        provider_extension: { ticket: 'ext-001' }
      },
      agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer', 'bind'] },
      metadata: { experiment: { cohort: 'runtime-conformance' } }
    });

    assert.equal(response.status, 200);
    const state = store.getBySession(SESSION);
    assert.equal(state?.quote.status, 'accepted');
    assert.equal(state?.job.status, 'scheduled');
  });
});

test('repeated intake with the same session is idempotent for offer identity', async () => {
  await withServer(async ({ baseUrl }) => {
    const first = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    const second = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    const firstBody = await first.json() as any;
    const secondBody = await second.json() as any;
    assert.equal(firstBody.offer.id, secondBody.offer.id);
    assert.equal(firstBody.offer.details.quote_ref, secondBody.offer.details.quote_ref);
  });
});

test('AIP-backed workflow correlation is independent from session identity and stable across intake retry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-correlation-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  const correlations = new MemoryWorkflowCorrelationStore();
  let workflowCounter = 0;
  const adapter = new PlumbingAipAdapter({
    store,
    correlations,
    now: () => new Date('2026-08-14T22:30:00.000Z'),
    idFactory: randomUUID,
    workflowIdFactory: () => `correlation-${++workflowCounter}`
  });

  try {
    const request = intake();
    const first = adapter.submit(request, 'https://adapter.example');
    const second = adapter.submit(request, 'https://adapter.example');
    assert.equal(first.offer.id, second.offer.id);

    const correlation = correlations.findByProtocolRef('AIP', 'session', SESSION);
    assert.ok(correlation);
    assert.equal(correlation.workflow_id, 'wf-correlation-1');
    assert.notEqual(correlation.workflow_id, `wf-${SESSION}`);
    assert.equal(workflowCounter, 1, 'retry must reuse the existing workflow correlation');
    assert.ok(correlation.protocol_refs.some((ref) =>
      ref.protocol === 'AIP' && ref.object_type === 'offer' && ref.id === first.offer.id
    ));
    assert.ok(correlation.operational_refs.some((ref) =>
      ref.system === 'file_backed_fsm' && ref.object_type === 'job'
    ));

    const persistedOperationalState = store.getBySession(SESSION);
    assert.ok(persistedOperationalState);
    assert.equal('workflow_id' in persistedOperationalState, false, 'interop correlation must not be persisted into the operational FSM session');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
