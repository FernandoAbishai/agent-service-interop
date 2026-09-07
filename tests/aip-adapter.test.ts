import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Address } from '../src/types.ts';
import { FileFsmStore } from '../src/fsm-store.ts';
import { PlumbingAipAdapter } from '../src/aip-adapter.ts';
import { createAipServer } from '../src/server.ts';
import { assertCanonicalWorkflow, toCanonicalWorkflow } from '../src/canonical.ts';
import { MemoryWorkflowCorrelationStore } from '../src/workflow-correlation.ts';
import { FileWorkflowCorrelationStore } from '../src/workflow-correlation.ts';
import { FileAipReplayStore, MemoryAipReplayStore } from '../src/aip-replay-store.ts';
import { intakeReplayFingerprint } from '../src/idempotency.ts';

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

test('same session with changed semantic intake returns idempotency conflict without mutation', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const first = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    assert.equal(first.status, 200);
    const before = structuredClone(store.getBySession(SESSION));

    const changed: any = intake();
    changed.intake_data.urgency = 'emergency';
    const response = await post(baseUrl, '/api/aip/residential-plumbing-quote', changed);
    assert.equal(response.status, 409);
    const body = await response.json() as any;
    assert.equal(body.error.code, 'IDEMPOTENCY_CONFLICT');
    assert.deepEqual(store.getBySession(SESSION), before);
  });
});

test('intake replay ignores validated non-state metadata and preserves the original offer', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const firstRequest: any = intake();
    firstRequest.metadata.timestamp = '2026-08-14T22:29:00.000Z';
    const first = await post(baseUrl, '/api/aip/residential-plumbing-quote', firstRequest);
    const firstBody = await first.json() as any;

    const replay: any = intake();
    replay.metadata.timestamp = '2026-08-14T22:30:00.000Z';
    replay.metadata.experiment = 'retry';
    const second = await post(baseUrl, '/api/aip/residential-plumbing-quote', replay);
    const secondBody = await second.json() as any;

    assert.equal(second.status, 200);
    assert.equal(secondBody.offer.id, firstBody.offer.id);
    assert.equal(store.getBySession(SESSION)?.quote.offer_id, firstBody.offer.id);
  });
});

test('exact Bind replay returns the first result even after offer expiry', async () => {
  await withServer(async ({ baseUrl, store, setNow }) => {
    const offerResponse = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    const offer = (await offerResponse.json() as any).offer;
    const request = {
      offer_id: offer.id,
      session_id: SESSION,
      bind_data: { full_name: 'Jane Fixture', phone: '+1-555-0100', address: ADDRESS },
      agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer', 'bind'] },
      metadata: { user_confirmed_at: '2026-08-14T22:31:00.000Z' }
    };

    const first = await post(baseUrl, '/api/aip/bind', request);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    const firstState = structuredClone(store.getBySession(SESSION));

    setNow(new Date('2026-08-30T00:00:00.000Z'));
    const replay = structuredClone(request) as any;
    replay.metadata.user_confirmed_at = '2026-08-30T00:00:00.000Z';
    const second = await post(baseUrl, '/api/aip/bind', replay);
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), firstBody);
    assert.deepEqual(store.getBySession(SESSION), firstState);
  });
});

test('changed Bind replay returns idempotency conflict without rescheduling', async () => {
  await withServer(async ({ baseUrl, store }) => {
    const offerResponse = await post(baseUrl, '/api/aip/residential-plumbing-quote', intake());
    const offer = (await offerResponse.json() as any).offer;
    const original = {
      offer_id: offer.id,
      session_id: SESSION,
      bind_data: { full_name: 'Jane Fixture', phone: '+1-555-0100', address: ADDRESS },
      agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer', 'bind'] }
    };
    assert.equal((await post(baseUrl, '/api/aip/bind', original)).status, 200);
    const before = structuredClone(store.getBySession(SESSION));

    const changed = structuredClone(original) as any;
    changed.bind_data.phone = '+1-555-0199';
    const response = await post(baseUrl, '/api/aip/bind', changed);
    assert.equal(response.status, 409);
    const body = await response.json() as any;
    assert.equal(body.error.code, 'IDEMPOTENCY_CONFLICT');
    assert.deepEqual(store.getBySession(SESSION), before);
  });
});

test('correlation persistence failure cannot leave newly created FSM state behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-correlation-failure-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  const correlations = {
    getByWorkflowId: () => undefined,
    findByProtocolRef: () => undefined,
    put: () => { throw new Error('injected correlation write failure'); }
  };
  const adapter = new PlumbingAipAdapter({ store, correlations, replays: new MemoryAipReplayStore() });

  try {
    assert.throws(
      () => adapter.submit(intake(), 'https://adapter.example'),
      /injected correlation write failure/
    );
    assert.equal(store.getBySession(SESSION), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replay journal preserves original intake semantics across correlation-first recovery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-replay-recovery-'));
  const fsmPath = join(dir, 'fsm.json');
  const correlationPath = join(dir, 'correlations.json');
  const replayPath = join(dir, 'replays.json');

  class FailOnceFsmStore extends FileFsmStore {
    private fail = true;

    override upsertOffer(input: Parameters<FileFsmStore['upsertOffer']>[0]) {
      if (this.fail) {
        this.fail = false;
        throw new Error('injected FSM write failure');
      }
      return super.upsertOffer(input);
    }
  }

  try {
    const firstStore = new FailOnceFsmStore(fsmPath);
    const correlations = new FileWorkflowCorrelationStore(correlationPath);
    const replays = new FileAipReplayStore(replayPath);
    const firstAdapter = new PlumbingAipAdapter({
      store: firstStore,
      correlations,
      replays,
      now: () => new Date('2026-08-14T22:30:00.000Z'),
      idFactory: randomUUID,
      workflowIdFactory: () => 'recovery-workflow'
    });

    assert.throws(
      () => firstAdapter.submit(intake(), 'https://adapter.example'),
      /injected FSM write failure/
    );
    assert.equal(firstStore.getBySession(SESSION), undefined);
    const reservedCorrelation = correlations.findByProtocolRef('AIP', 'session', SESSION);
    assert.ok(reservedCorrelation, 'correlation may exist while operational write is incomplete');

    const restartedStore = new FileFsmStore(fsmPath);
    const restartedAdapter = new PlumbingAipAdapter({
      store: restartedStore,
      correlations: new FileWorkflowCorrelationStore(correlationPath),
      replays: new FileAipReplayStore(replayPath),
      now: () => new Date('2026-08-14T22:31:00.000Z')
    });

    const changed: any = intake();
    changed.intake_data.urgency = 'emergency';
    assert.throws(
      () => restartedAdapter.submit(changed, 'https://adapter.example'),
      (error: any) => error?.code === 'IDEMPOTENCY_CONFLICT' && error?.httpStatus === 409
    );
    assert.equal(restartedStore.getBySession(SESSION), undefined, 'changed recovery must not claim the reserved correlation');

    const recovered = restartedAdapter.submit(intake(), 'https://adapter.example');
    const recoveredSession = restartedStore.getBySession(SESSION);
    assert.ok(recoveredSession);
    assert.equal(recovered.offer.id, recoveredSession.quote.offer_id);
    assert.equal(recoveredSession.requirement.urgency, 'this_week');
    assert.equal(
      correlations.findByProtocolRef('AIP', 'session', SESSION)?.workflow_id,
      reservedCorrelation.workflow_id
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('correlation-only recovery fails closed when the replay reservation was not durable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-correlation-only-recovery-'));
  const fsmPath = join(dir, 'fsm.json');
  const correlationPath = join(dir, 'correlations.json');

  class FailOnceFsmStore extends FileFsmStore {
    private fail = true;

    override upsertOffer(input: Parameters<FileFsmStore['upsertOffer']>[0]) {
      if (this.fail) {
        this.fail = false;
        throw new Error('injected FSM write failure');
      }
      return super.upsertOffer(input);
    }
  }

  try {
    const correlations = new FileWorkflowCorrelationStore(correlationPath);
    const firstAdapter = new PlumbingAipAdapter({
      store: new FailOnceFsmStore(fsmPath),
      correlations,
      replays: new MemoryAipReplayStore(),
      now: () => new Date('2026-08-14T22:30:00.000Z'),
      workflowIdFactory: () => 'memory-replay-recovery'
    });

    assert.throws(
      () => firstAdapter.submit(intake(), 'https://adapter.example'),
      /injected FSM write failure/
    );
    assert.ok(correlations.findByProtocolRef('AIP', 'session', SESSION));
    assert.equal(new FileFsmStore(fsmPath).getBySession(SESSION), undefined);

    const restartedAdapter = new PlumbingAipAdapter({
      store: new FileFsmStore(fsmPath),
      correlations: new FileWorkflowCorrelationStore(correlationPath),
      replays: new MemoryAipReplayStore(),
      now: () => new Date('2026-08-14T22:31:00.000Z')
    });

    assert.throws(
      () => restartedAdapter.submit(intake(), 'https://adapter.example'),
      (error: any) => error?.code === 'IDEMPOTENCY_CONFLICT' && error?.httpStatus === 409
    );
    assert.equal(new FileFsmStore(fsmPath).getBySession(SESSION), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy fingerprint-less Bind replay fails closed instead of guessing historical extensions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-legacy-bind-replay-'));
  const statePath = join(dir, 'fsm.json');
  const store = new FileFsmStore(statePath);
  const adapter = new PlumbingAipAdapter({ store, now: () => new Date('2026-08-14T22:30:00.000Z') });

  try {
    const offer = adapter.submit(intake(), 'https://adapter.example').offer;
    const originalBind = {
      offer_id: offer.id,
      session_id: SESSION,
      bind_data: {
        full_name: 'Jane Fixture',
        phone: '+1-555-0100',
        address: ADDRESS,
        provider_extension: { ticket: 'historical-ext-001' }
      },
      agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer', 'bind'] }
    };
    adapter.bind(originalBind);
    const before = structuredClone(store.getBySession(SESSION));
    assert.ok(before?.binding?.request_fingerprint);

    const raw = JSON.parse(readFileSync(statePath, 'utf8')) as any;
    delete raw.sessions[SESSION].binding.request_fingerprint;
    writeFileSync(statePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

    const restarted = new PlumbingAipAdapter({ store: new FileFsmStore(statePath) });
    const replay = structuredClone(originalBind) as any;
    delete replay.bind_data.provider_extension;
    assert.throws(
      () => restarted.bind(replay),
      (error: any) => error?.code === 'IDEMPOTENCY_CONFLICT' && error?.httpStatus === 409
    );
    const after = new FileFsmStore(statePath).getBySession(SESSION);
    assert.equal(after?.job.scheduled_for, before?.job.scheduled_for);
    assert.equal(after?.binding?.phone, before?.binding?.phone);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persisted replay plan cannot overwrite or recorrelate mismatched FSM identifiers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-replay-fsm-mismatch-'));
  const fsmPath = join(dir, 'fsm.json');
  const replayPath = join(dir, 'replays.json');
  const store = new FileFsmStore(fsmPath);
  const replays = new FileAipReplayStore(replayPath);

  try {
    const request = intake();
    store.upsertOffer({
      request,
      offerId: 'offer-fsm',
      requirementId: 'req-fsm',
      quoteId: 'quote-fsm',
      jobId: 'job-fsm',
      validUntil: '2026-08-21T22:30:00.000Z'
    });
    replays.claim(SESSION, intakeReplayFingerprint(request), () => ({
      session_id: SESSION,
      request_fingerprint: intakeReplayFingerprint(request),
      workflow_id: 'wf-replay-other',
      offer_id: 'offer-other',
      requirement_id: 'req-other',
      quote_id: 'quote-other',
      job_id: 'job-other',
      valid_until: '2026-08-22T22:30:00.000Z'
    }));

    const adapter = new PlumbingAipAdapter({ store, replays });
    assert.throws(
      () => adapter.submit(request, 'https://adapter.example'),
      (error: any) => error?.code === 'IDEMPOTENCY_CONFLICT' && error?.httpStatus === 409
    );
    assert.equal(store.getBySession(SESSION)?.quote.offer_id, 'offer-fsm');
    assert.equal(store.getBySession(SESSION)?.job.job_id, 'job-fsm');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('late same-semantic FSM winner with different reserved identifiers fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-late-fsm-winner-'));
  const fsmPath = join(dir, 'fsm.json');
  const replayPath = join(dir, 'replays.json');
  const store = new FileFsmStore(fsmPath);
  const replays = new FileAipReplayStore(replayPath);
  const request = intake();
  let injected = false;

  class InjectingCorrelationStore extends MemoryWorkflowCorrelationStore {
    override put(correlation: Parameters<MemoryWorkflowCorrelationStore['put']>[0]) {
      if (!injected) {
        injected = true;
        store.upsertOffer({
          request,
          offerId: 'offer-competitor',
          requirementId: 'req-competitor',
          quoteId: 'quote-competitor',
          jobId: 'job-competitor',
          validUntil: '2026-08-21T22:30:00.000Z'
        });
      }
      return super.put(correlation);
    }
  }

  const correlations = new InjectingCorrelationStore();
  const reservedIds = ['reserved-offer', 'reserved-requirement', 'reserved-quote', 'reserved-job'];
  let idIndex = 0;
  const adapter = new PlumbingAipAdapter({
    store,
    correlations,
    replays,
    now: () => new Date('2026-08-14T22:30:00.000Z'),
    idFactory: () => reservedIds[idIndex++] ?? `overflow-${idIndex}`,
    workflowIdFactory: () => 'reserved-workflow'
  });

  try {
    assert.throws(
      () => adapter.submit(request, 'https://adapter.example'),
      (error: any) => error?.code === 'IDEMPOTENCY_CONFLICT' && error?.httpStatus === 409
    );

    const winner = store.getBySession(SESSION);
    assert.equal(winner?.quote.offer_id, 'offer-competitor');
    assert.equal(winner?.requirement.requirement_id, 'req-competitor');
    assert.equal(winner?.quote.quote_id, 'quote-competitor');
    assert.equal(winner?.job.job_id, 'job-competitor');

    const fingerprint = intakeReplayFingerprint(request);
    const plan = replays.claim(SESSION, fingerprint, () => { throw new Error('existing replay plan expected'); });
    assert.equal(plan.offer_id, 'reserved-offer');
    assert.equal(plan.requirement_id, 'req-reserved-requirement');
    assert.equal(plan.quote_id, 'quote-reserved-quote');
    assert.equal(plan.job_id, 'job-reserved-job');

    const correlation = correlations.findByProtocolRef('AIP', 'session', SESSION);
    assert.ok(correlation);
    assert.equal(
      correlation.protocol_refs.find((ref) => ref.object_type === 'offer')?.id,
      'reserved-offer'
    );
    assert.equal(
      correlation.operational_refs.find((ref) => ref.object_type === 'job')?.id,
      'job-reserved-job'
    );

    assert.throws(
      () => adapter.submit(request, 'https://adapter.example'),
      (error: any) => error?.code === 'IDEMPOTENCY_CONFLICT' && error?.httpStatus === 409
    );
    assert.equal(store.getBySession(SESSION)?.quote.offer_id, 'offer-competitor');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy mismatched FSM and AIP correlation fails closed before creating replay state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-legacy-mismatch-'));
  const fsmPath = join(dir, 'fsm.json');
  const replayPath = join(dir, 'replays.json');
  const store = new FileFsmStore(fsmPath);
  const correlations = new MemoryWorkflowCorrelationStore();

  try {
    const request = intake();
    store.upsertOffer({
      request,
      offerId: 'offer-fsm',
      requirementId: 'req-fsm',
      quoteId: 'quote-fsm',
      jobId: 'job-fsm',
      validUntil: '2026-08-21T22:30:00.000Z'
    });
    correlations.put({
      workflow_id: 'wf-legacy-split',
      operational_refs: [
        { system: 'file_backed_fsm', object_type: 'requirement', id: 'req-other' },
        { system: 'file_backed_fsm', object_type: 'quote', id: 'quote-other' },
        { system: 'file_backed_fsm', object_type: 'job', id: 'job-other' }
      ],
      protocol_refs: [
        { protocol: 'AIP', object_type: 'session', id: SESSION },
        { protocol: 'AIP', object_type: 'offer', id: 'offer-other' }
      ]
    });

    const adapter = new PlumbingAipAdapter({
      store,
      correlations,
      replays: new FileAipReplayStore(replayPath),
      now: () => new Date('2026-08-14T22:30:00.000Z')
    });

    assert.throws(
      () => adapter.submit(request, 'https://adapter.example'),
      (error: any) => error?.code === 'IDEMPOTENCY_CONFLICT' && error?.httpStatus === 409
    );
    assert.equal(existsSync(replayPath), false, 'mismatched legacy state must fail before creating replay state');
    assert.equal(store.getBySession(SESSION)?.quote.offer_id, 'offer-fsm');
    assert.equal(
      correlations.findByProtocolRef('AIP', 'session', SESSION)?.protocol_refs.find((ref) => ref.object_type === 'offer')?.id,
      'offer-other'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AIP-backed workflow correlation is independent from session identity and stable across intake retry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-correlation-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  const correlations = new MemoryWorkflowCorrelationStore();
  let workflowCounter = 0;
  const adapter = new PlumbingAipAdapter({
    store,
    correlations,
    replays: new MemoryAipReplayStore(),
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

test('workflow correlation cannot be enabled without an explicit replay store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-replay-required-'));
  try {
    const store = new FileFsmStore(join(dir, 'fsm.json'));
    const correlations = new MemoryWorkflowCorrelationStore();
    assert.throws(
      () => new PlumbingAipAdapter({ store, correlations }),
      /replay store is required when workflow correlation is enabled/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
