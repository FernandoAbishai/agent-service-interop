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

function seedAcceptedAipWorkflow(store: FileFsmStore) {
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  ];
  let idCounter = 0;
  const adapter = new PlumbingAipAdapter({
    store,
    now: () => new Date('2026-08-15T07:00:00.000Z'),
    idFactory: () => ids[idCounter++] ?? randomUUID()
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
  return { session, offerResponse };
}

async function withA2AServer(store: FileFsmStore, run: (baseUrl: string) => Promise<void>) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const app = createA2AApp(baseUrl, store);
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
  try {
    await withA2AServer(store, async (baseUrl) => {
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

test('AIP and A2A expose the same workflow references without conflating Task and Job state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-a2a-shared-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  try {
    const { session, offerResponse } = seedAcceptedAipWorkflow(store);
    const canonical = toCanonicalWorkflow(session);
    assert.equal(canonical.quote.status, 'accepted');
    assert.equal(canonical.job.status, 'scheduled');

    await withA2AServer(store, async (baseUrl) => {
      const client = await a2aClient(baseUrl);
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
      const payload = JSON.parse(part.content.value) as any;

      assert.equal(payload.references.canonical_workflow_id, canonical.workflow_id);
      assert.equal(payload.references.requirement_id, canonical.requirement.requirement_id);
      assert.equal(payload.references.quote_id, canonical.quote.quote_id);
      assert.equal(payload.references.aip_offer_id, offerResponse.offer.id);
      assert.equal(payload.references.operational_job_id, canonical.job.job_id);
      assert.equal(payload.observed_state.quote_status, 'accepted');
      assert.equal(payload.observed_state.job_status, 'scheduled');
      assert.equal(payload.observed_state.completion_status, 'not_claimed');
      assert.equal(payload.observed_state.customer_decision_status, 'pending');
      assert.match(payload.semantics.a2a_task_state_meaning, /not physical service execution state/i);

      const after = store.getBySession(SESSION);
      assert.ok(after);
      assert.equal(after.job.status, 'scheduled');
      assert.equal(after.quote.status, 'accepted');
      assert.equal(after.binding?.full_name, 'Jane Fixture');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown canonical workflow fails the A2A interaction without creating operational state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-a2a-missing-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  try {
    await withA2AServer(store, async (baseUrl) => {
      const client = await a2aClient(baseUrl);
      const result = await client.sendMessage(workflowRequest('wf-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
      assert.ok('status' in result);
      assert.equal((result as Task).status.state, TaskState.TASK_STATE_FAILED);
      assert.deepEqual(store.read().sessions, {});
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
