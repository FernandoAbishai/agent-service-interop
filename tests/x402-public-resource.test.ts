import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { FileFsmStore } from '../src/fsm-store.ts';
import { PlumbingAipAdapter } from '../src/aip-adapter.ts';
import { toCanonicalWorkflow } from '../src/canonical.ts';
import { createPaidInspectionApp, X402_PUBLIC_INSPECTION_PATH } from '../src/x402-server.ts';

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function seedWorkflow(store: FileFsmStore, sessionId: string) {
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let index = 0;
  const adapter = new PlumbingAipAdapter({
    store,
    now: () => new Date('2026-08-18T20:00:00.000Z'),
    idFactory: () => ids[index++] ?? randomUUID()
  });
  const offer = adapter.submit({
    aip_version: '0.1.0',
    agent: { id: `agent-${sessionId}`, platform: 'custom', name: 'Synthetic Buyer Agent', consent_scope: ['intake', 'offer'] },
    intake_data: { postal_code: '92101', service_need: 'leak_diagnosis', urgency: 'this_week', availability_window: 'weekday_after_15_00' },
    session_id: sessionId
  }, 'http://aip.example');
  adapter.bind({
    offer_id: offer.offer.id,
    session_id: sessionId,
    bind_data: {
      full_name: 'Synthetic Customer',
      phone: '+1-555-0100',
      address: { street: '100 Synthetic Avenue', city: 'San Diego', state: 'CA', postal_code: '92101', country: 'US' }
    },
    agent: { id: `agent-${sessionId}`, consent_scope: ['intake', 'offer', 'bind'] }
  });
  const session = store.getBySession(sessionId);
  assert.ok(session);
  return toCanonicalWorkflow(session);
}

async function withServer(store: FileFsmStore, publicWorkflowId: string, paymentGate: RequestHandler, run: (baseUrl: string) => Promise<void>) {
  const port = await freePort();
  const app = createPaidInspectionApp(store, { publicWorkflowId, paymentGate });
  const server = app.listen(port, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const requireSyntheticPayment: RequestHandler = (req, res, next) => {
  if (req.header('x-th-interop-test-payment') !== 'paid') {
    res.status(402).json({ x402Version: 2, error: 'Payment Required', accepts: [{ scheme: 'test-only', network: 'eip155:84532', amount: '1000' }] });
    return;
  }
  next();
};

test('unpaid public synthetic resource returns 402 without mutating operational state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-x402-unpaid-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  try {
    const workflow = seedWorkflow(store, '37a606b6-86f3-4b6c-8e12-a4db917802ba');
    const before = structuredClone(store.read());
    await withServer(store, workflow.workflow_id, requireSyntheticPayment, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${X402_PUBLIC_INSPECTION_PATH}`);
      assert.equal(response.status, 402);
      const body = await response.json() as any;
      assert.equal(body.x402Version, 2);
      assert.equal(body.accepts[0].amount, '1000');
      assert.deepEqual(store.read(), before);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('synthetic paid request returns shared inspection without promoting payer/payment into workflow identity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-x402-paid-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  try {
    const workflow = seedWorkflow(store, '47a606b6-86f3-4b6c-8e12-a4db917802ba');
    const before = structuredClone(store.read());
    await withServer(store, workflow.workflow_id, requireSyntheticPayment, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${X402_PUBLIC_INSPECTION_PATH}`, { headers: { 'x-th-interop-test-payment': 'paid' } });
      assert.equal(response.status, 200);
      const body = await response.json() as any;
      assert.equal(body.references.canonical_workflow_id, workflow.workflow_id);
      assert.equal(body.references.operational_job_id, workflow.job.job_id);
      assert.equal(body.observed_state.job_status, 'scheduled');
      assert.equal(body.observed_state.completion_status, 'not_claimed');
      assert.equal(body.observed_state.customer_decision_status, 'pending');
      assert.ok(!('payer' in body));
      assert.ok(!('payment' in body));
      assert.ok(!('customer_id' in body));
      assert.deepEqual(store.read(), before);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('paid surface has no buyer-selectable workflow identifier', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-x402-private-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  try {
    const publicWorkflow = seedWorkflow(store, '57a606b6-86f3-4b6c-8e12-a4db917802ba');
    const privateWorkflow = seedWorkflow(store, '67a606b6-86f3-4b6c-8e12-a4db917802ba');
    let gateCalls = 0;
    const gate: RequestHandler = (_req, _res, next) => { gateCalls += 1; next(); };
    const before = structuredClone(store.read());
    await withServer(store, publicWorkflow.workflow_id, gate, async (baseUrl) => {
      const attemptedPrivatePath = `${baseUrl}/api/x402/workflows/${privateWorkflow.workflow_id}/inspection`;
      const response = await fetch(attemptedPrivatePath, { headers: { 'x-th-interop-test-payment': 'paid' } });
      assert.equal(response.status, 404);
      assert.equal(gateCalls, 0, 'payment middleware must not run on buyer-selected workflow paths');
      assert.deepEqual(store.read(), before);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing configured public workflow never becomes available merely because payment succeeds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-x402-missing-public-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));
  try {
    const missingPublic = 'wf-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await withServer(store, missingPublic, requireSyntheticPayment, async (baseUrl) => {
      const response = await fetch(`${baseUrl}${X402_PUBLIC_INSPECTION_PATH}`, { headers: { 'x-th-interop-test-payment': 'paid' } });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: { code: 'RESOURCE_NOT_AVAILABLE', message: 'Public inspection resource is not available' } });
      assert.deepEqual(store.read().sessions, {});
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
