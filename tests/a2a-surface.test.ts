import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Role, TaskState, type Task } from '@a2a-js/sdk';
import { ClientFactory, ClientFactoryOptions, RestTransportFactory } from '@a2a-js/sdk/client';
import { FileFsmStore } from '../src/fsm-store.ts';
import { PlumbingAipAdapter } from '../src/aip-adapter.ts';
import { toCanonicalWorkflow } from '../src/canonical.ts';
import { createA2AApp } from '../src/a2a-server.ts';
import { MemoryWorkflowCorrelationStore, type WorkflowCorrelation } from '../src/workflow-correlation.ts';
import {
  CorrelatedWorkflowInspectionSource,
  FileFsmWorkflowInspectionSource,
  type WorkflowFacetObserver,
  type WorkflowInspectionSource
} from '../src/workflow-inspection.ts';

const SESSION = '37a606b6-86f3-4b6c-8e12-a4db917802ba';

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function seedAcceptedAipWorkflow(store: FileFsmStore, correlations: MemoryWorkflowCorrelationStore) {
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  ];
  let idCounter = 0;
  const adapter = new PlumbingAipAdapter({
    store,
    correlations,
    now: () => new Date('2026-08-15T07:00:00.000Z'),
    idFactory: () => ids[idCounter++] ?? randomUUID(),
    workflowIdFactory: () => '99999999-9999-4999-8999-999999999999'
  });

  const intake = {
    aip_version: '0.1.0' as const,
    agent: {
      id: 'fixture-agent-001',
      platform: 'custom',
      name: 'Fixture Buyer Agent',
      consent_scope: ['intake', 'offer'] as const
    },
    intake_data: {
      postal_code: '92101',
      service_need: 'leak_diagnosis' as const,
      urgency: 'this_week' as const,
      availability_window: 'weekday_after_15_00' as const
    },
    session_id: SESSION
  };

  const offerResponse = adapter.submit(intake, 'http://aip.example');
  adapter.bind({
    offer_id: offerResponse.offer.id,
    session_id: SESSION,
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
    }
  });

  const session = store.getBySession(SESSION);
  assert.ok(session);
  const correlation = correlations.findByProtocolRef('AIP', 'session', SESSION);
  assert.ok(correlation);
  return { session, offerResponse, correlation };
}

async function withA2AServer(source: WorkflowInspectionSource, run: (baseUrl: string) => Promise<void>) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const app = createA2AApp(baseUrl, source);
  const server = app.listen(port, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function a2aClient(baseUrl: string) {
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new RestTransportFactory()],
      preferredTransports: ['HTTP+JSON']
    })
  );
  return factory.createFromUrl(baseUrl);
}

function workflowRequest(workflowId: string) {
  return {
    tenant: '',
    message: {
      messageId: randomUUID(),
      role: Role.ROLE_USER,
      parts: [{
        content: { $case: 'text' as const, value: workflowId },
        metadata: undefined,
        filename: '',
        mediaType: 'text/plain'
      }],
      taskId: '',
      contextId: '',
      extensions: [],
      metadata: {},
      referenceTaskIds: []
    },
    configuration: undefined,
    metadata: {}
  };
}

test('A2A agent card advertises only the narrow read-only HTTP+JSON surface', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-a2a-card-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  const correlations = new MemoryWorkflowCorrelationStore();
  try {
    await withA2AServer(new FileFsmWorkflowInspectionSource(store, correlations), async (baseUrl) => {
      const client = await a2aClient(baseUrl);
      const card = await client.getAgentCard();
      assert.equal(card.supportedInterfaces.length, 1);
      assert.equal(card.supportedInterfaces[0].protocolBinding, 'HTTP+JSON');
      assert.equal(card.supportedInterfaces[0].protocolVersion, '1.0');
      assert.equal(card.skills.length, 1);
      assert.equal(card.skills[0].id, 'inspect_service_workflow');
      assert.match(card.skills[0].description, /without mutating operational state/i);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AIP, A2A and HTTP expose one read-only workflow observation without conflating Task and Job state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-a2a-shared-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  const correlations = new MemoryWorkflowCorrelationStore();
  try {
    const { session, offerResponse, correlation } = seedAcceptedAipWorkflow(store, correlations);
    const canonical = toCanonicalWorkflow(session, correlation.workflow_id);
    assert.equal(canonical.quote.status, 'accepted');
    assert.equal(canonical.job.status, 'scheduled');
    assert.notEqual(correlation.workflow_id, `wf-${SESSION}`);
    const source = new FileFsmWorkflowInspectionSource(store, correlations);
    assert.equal(
      source.getByWorkflowId(`wf-${SESSION}`),
      undefined,
      'newly correlated workflows must not retain an AIP-derived legacy alias'
    );
    const before = structuredClone(store.read());

    await withA2AServer(source, async (baseUrl) => {
      const client = await a2aClient(baseUrl);
      const rawSessionLookup = await client.sendMessage(workflowRequest(SESSION));
      assert.ok('status' in rawSessionLookup);
      assert.equal(
        (rawSessionLookup as Task).status.state,
        TaskState.TASK_STATE_FAILED,
        'AIP session IDs must not remain alternate lookup identities for newly correlated workflows'
      );

      const result = await client.sendMessage(workflowRequest(canonical.workflow_id));
      assert.ok('status' in result, 'read-only inspection should return an A2A Task');
      const task = result as Task;

      assert.equal(task.status.state, TaskState.TASK_STATE_COMPLETED);
      assert.notEqual(task.id, canonical.job.job_id);
      assert.notEqual(task.id, canonical.workflow_id);
      assert.notEqual(task.contextId, canonical.workflow_id);
      assert.equal(task.artifacts.length, 1);

      const part = task.artifacts[0].parts[0];
      assert.equal(part.content?.$case, 'text');
      if (part.content?.$case !== 'text') throw new Error('expected JSON text artifact');
      const a2aPayload = JSON.parse(part.content.value) as any;

      assert.equal(a2aPayload.references.workflow_id, canonical.workflow_id);
      assert.ok(a2aPayload.references.protocol_refs.some((ref: any) =>
        ref.protocol === 'AIP' && ref.object_type === 'offer' && ref.id === offerResponse.offer.id
      ));
      assert.ok(a2aPayload.references.protocol_refs.some((ref: any) =>
        ref.protocol === 'AIP' && ref.object_type === 'session' && ref.id === SESSION
      ));
      assert.ok(a2aPayload.references.operational_refs.some((ref: any) =>
        ref.object_type === 'job' && ref.id === canonical.job.job_id
      ));
      assert.equal(a2aPayload.facets.quote.status, 'accepted');
      assert.equal(a2aPayload.facets.job.status, 'scheduled');
      assert.equal(a2aPayload.facets.job.scheduled_for, canonical.job.scheduled_for);
      assert.equal('completion' in a2aPayload.facets, false);
      assert.equal('customer_decision' in a2aPayload.facets, false);
      assert.match(a2aPayload.semantics.interaction_state_meaning, /not physical service execution state/i);

      const httpResponse = await fetch(`${baseUrl}/api/interop/workflows/${canonical.workflow_id}/inspection`);
      assert.equal(httpResponse.status, 200);
      const httpPayload = await httpResponse.json();
      assert.deepEqual(httpPayload, a2aPayload, 'A2A and HTTP must expose the same shared inspection projection');

      const after = store.read();
      assert.deepEqual(after, before, 'both read-only surfaces must leave authoritative FSM state unchanged');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown workflow fails through both surfaces without creating operational state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-a2a-missing-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  const correlations = new MemoryWorkflowCorrelationStore();
  try {
    await withA2AServer(new FileFsmWorkflowInspectionSource(store, correlations), async (baseUrl) => {
      const missingWorkflow = 'wf-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const client = await a2aClient(baseUrl);
      const result = await client.sendMessage(workflowRequest(missingWorkflow));
      assert.ok('status' in result);
      assert.equal((result as Task).status.state, TaskState.TASK_STATE_FAILED);

      const response = await fetch(`${baseUrl}/api/interop/workflows/${missingWorkflow}/inspection`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          code: 'WORKFLOW_NOT_FOUND',
          message: 'Workflow not found'
        }
      });
      assert.deepEqual(store.read().sessions, {});
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy pre-correlation workflow IDs remain readable without writing correlation into the FSM', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-a2a-legacy-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  const correlations = new MemoryWorkflowCorrelationStore();
  try {
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    let index = 0;
    const legacyAdapter = new PlumbingAipAdapter({
      store,
      now: () => new Date('2026-08-15T07:00:00.000Z'),
      idFactory: () => ids[index++] ?? randomUUID()
    });
    const offer = legacyAdapter.submit({
      aip_version: '0.1.0',
      agent: { id: 'legacy-agent', consent_scope: ['intake', 'offer'] },
      intake_data: {
        postal_code: '92101',
        service_need: 'leak_diagnosis',
        urgency: 'this_week',
        availability_window: 'weekday_after_15_00'
      },
      session_id: SESSION
    }, 'http://aip.example');
    assert.ok(offer.offer.id);
    assert.equal(correlations.findByProtocolRef('AIP', 'session', SESSION), undefined);

    const legacyWorkflowId = `wf-${SESSION}`;
    const source = new FileFsmWorkflowInspectionSource(store, correlations);
    const legacyInspection = source.getByWorkflowId(legacyWorkflowId);
    assert.ok(legacyInspection);
    assert.equal(legacyInspection.references.workflow_id, legacyWorkflowId);
    assert.ok(legacyInspection.references.protocol_refs.some((ref) =>
      ref.protocol === 'AIP' && ref.object_type === 'session' && ref.id === SESSION
    ));
    assert.equal('workflow_id' in store.getBySession(SESSION)!, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('non-AIP operational origin traverses the same correlation and inspection boundary without invented facets', async () => {
  type NativeJob = { id: string; status: string; scheduled_for?: string };
  const nativeJobs = new Map<string, NativeJob>([
    ['native-job-001', { id: 'native-job-001', status: 'scheduled', scheduled_for: '2026-09-10T17:00:00.000Z' }]
  ]);
  const correlations = new MemoryWorkflowCorrelationStore();
  const correlation: WorkflowCorrelation = correlations.put({
    workflow_id: 'wf-native-001',
    operational_refs: [
      { system: 'synthetic_native_provider', object_type: 'job', id: 'native-job-001' }
    ],
    protocol_refs: []
  });

  const observer: WorkflowFacetObserver = {
    observe: (candidate) => {
      const jobRef = candidate.operational_refs.find((ref) =>
        ref.system === 'synthetic_native_provider' && ref.object_type === 'job'
      );
      if (!jobRef) return undefined;
      const job = nativeJobs.get(jobRef.id);
      if (!job) return undefined;
      return {
        job: {
          status: job.status,
          ...(job.scheduled_for ? { scheduled_for: job.scheduled_for } : {})
        }
      };
    }
  };
  const source = new CorrelatedWorkflowInspectionSource(correlations, observer);

  await withA2AServer(source, async (baseUrl) => {
    const client = await a2aClient(baseUrl);
    const result = await client.sendMessage(workflowRequest(correlation.workflow_id));
    assert.ok('status' in result);
    const task = result as Task;
    assert.equal(task.status.state, TaskState.TASK_STATE_COMPLETED);

    const part = task.artifacts[0].parts[0];
    assert.equal(part.content?.$case, 'text');
    if (part.content?.$case !== 'text') throw new Error('expected JSON text artifact');
    const payload = JSON.parse(part.content.value) as any;
    assert.equal(payload.references.workflow_id, correlation.workflow_id);
    assert.deepEqual(payload.references.protocol_refs, []);
    assert.deepEqual(payload.references.operational_refs, correlation.operational_refs);
    assert.deepEqual(payload.facets, {
      job: { status: 'scheduled', scheduled_for: '2026-09-10T17:00:00.000Z' }
    });
    assert.equal('quote' in payload.facets, false);
    assert.equal('completion' in payload.facets, false);
    assert.equal('customer_decision' in payload.facets, false);

    const httpResponse = await fetch(`${baseUrl}/api/interop/workflows/${correlation.workflow_id}/inspection`);
    assert.equal(httpResponse.status, 200);
    assert.deepEqual(await httpResponse.json(), payload);
    assert.deepEqual(nativeJobs.get('native-job-001'), {
      id: 'native-job-001',
      status: 'scheduled',
      scheduled_for: '2026-09-10T17:00:00.000Z'
    });
  });
});

test('A2A artifact metadata does not choose a primary job from plural operational references', async () => {
  const correlations = new MemoryWorkflowCorrelationStore();
  const correlation = correlations.put({
    workflow_id: 'wf-multi-job-001',
    operational_refs: [
      { system: 'synthetic_native_provider', object_type: 'job', id: 'native-job-001' },
      { system: 'synthetic_native_provider', object_type: 'job', id: 'native-job-002' }
    ],
    protocol_refs: []
  });
  const observer: WorkflowFacetObserver = {
    observe: () => ({})
  };
  const source = new CorrelatedWorkflowInspectionSource(correlations, observer);

  await withA2AServer(source, async (baseUrl) => {
    const client = await a2aClient(baseUrl);
    const result = await client.sendMessage(workflowRequest(correlation.workflow_id));
    assert.ok('status' in result);
    const task = result as Task;
    assert.equal(task.status.state, TaskState.TASK_STATE_COMPLETED);
    assert.equal(task.artifacts.length, 1);
    assert.deepEqual(task.artifacts[0].metadata, { workflow_id: correlation.workflow_id });

    const part = task.artifacts[0].parts[0];
    assert.equal(part.content?.$case, 'text');
    if (part.content?.$case !== 'text') throw new Error('expected JSON text artifact');
    const payload = JSON.parse(part.content.value) as any;
    assert.deepEqual(payload.references.operational_refs, correlation.operational_refs);
    assert.deepEqual(payload.facets, {});
  });
});
