import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { FileFsmStore } from '../src/fsm-store.ts';
import { PlumbingAipAdapter } from '../src/aip-adapter.ts';
import { toCanonicalWorkflow } from '../src/canonical.ts';
import { createCircleGatewayPaymentGate, createPaidInspectionApp, DEFAULT_X402_INSPECTION_PRICE } from '../src/x402-server.ts';

const LIVE = process.env.CIRCLE_GATEWAY_LIVE === '1';

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function seedPublicSyntheticWorkflow(store: FileFsmStore) {
  const sessionId = '97a606b6-86f3-4b6c-8e12-a4db917802ba';
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let index = 0;
  const adapter = new PlumbingAipAdapter({
    store,
    now: () => new Date('2026-08-18T23:00:00.000Z'),
    idFactory: () => ids[index++] ?? randomUUID()
  });

  const offer = adapter.submit({
    aip_version: '0.1.0',
    agent: {
      id: 'circle-live-gate-synthetic-agent',
      platform: 'custom',
      name: 'Circle Live Gate Synthetic Buyer',
      consent_scope: ['intake', 'offer']
    },
    intake_data: {
      postal_code: '92101',
      service_need: 'leak_diagnosis',
      urgency: 'this_week',
      availability_window: 'weekday_after_15_00'
    },
    session_id: sessionId
  }, 'http://aip.example');

  adapter.bind({
    offer_id: offer.offer.id,
    session_id: sessionId,
    bind_data: {
      full_name: 'Synthetic Customer',
      phone: '+1-555-0100',
      address: {
        street: '100 Synthetic Avenue',
        city: 'San Diego',
        state: 'CA',
        postal_code: '92101',
        country: 'US'
      }
    },
    agent: {
      id: 'circle-live-gate-synthetic-agent',
      consent_scope: ['intake', 'offer', 'bind']
    }
  });

  const session = store.getBySession(sessionId);
  assert.ok(session);
  return toCanonicalWorkflow(session);
}

test('Circle Gateway live: real 402 -> nanopayment -> public resource with zero FSM mutation', { skip: !LIVE }, async () => {
  const privateKey = process.env.CIRCLE_GATEWAY_BUYER_PRIVATE_KEY as `0x${string}` | undefined;
  const sellerAddress = process.env.CIRCLE_GATEWAY_SELLER_ADDRESS as `0x${string}` | undefined;
  const chain = process.env.CIRCLE_GATEWAY_CHAIN ?? 'baseSepolia';

  assert.ok(privateKey, 'CIRCLE_GATEWAY_BUYER_PRIVATE_KEY is required when CIRCLE_GATEWAY_LIVE=1');
  assert.ok(sellerAddress, 'CIRCLE_GATEWAY_SELLER_ADDRESS is required when CIRCLE_GATEWAY_LIVE=1');

  const client = new GatewayClient({ chain: chain as any, privateKey });
  assert.notEqual(client.address.toLowerCase(), sellerAddress.toLowerCase(), 'buyer and seller addresses must differ');

  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-circle-live-'));
  const store = new FileFsmStore(join(dir, 'fsm.json'));

  try {
    const workflow = seedPublicSyntheticWorkflow(store);
    const before = structuredClone(store.read());
    const balancesBefore = await client.getBalances();
    assert.ok(balancesBefore.gateway.available > 0n, 'buyer Gateway balance must be pre-funded; this test never deposits automatically');

    const port = await freePort();
    const app = createPaidInspectionApp(store, {
      publicWorkflowId: workflow.workflow_id,
      paymentGate: createCircleGatewayPaymentGate({
        sellerAddress,
        price: process.env.X402_INSPECTION_PRICE ?? DEFAULT_X402_INSPECTION_PRICE
      })
    });
    const server = app.listen(port, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    try {
      const url = `http://127.0.0.1:${port}/api/x402/public/workflow-inspection`;
      const support = await client.supports(url);
      assert.equal(support.supported, true, `Gateway support required: ${support.error ?? 'unsupported'}`);

      const { data, status } = await client.pay(url);
      assert.equal(status, 200);
      const body = data as any;
      assert.equal(body.references.canonical_workflow_id, workflow.workflow_id);
      assert.equal(body.references.operational_job_id, workflow.job.job_id);
      assert.equal(body.observed_state.job_status, 'scheduled');
      assert.ok(!('payer' in body));
      assert.ok(!('payment' in body));
      assert.ok(!('customer_id' in body));
      assert.deepEqual(store.read(), before, 'real Gateway payment must not mutate authoritative workflow state');

      const balancesAfter = await client.getBalances();
      assert.ok(balancesAfter.gateway.available < balancesBefore.gateway.available, 'buyer Gateway available balance should decrease after payment');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
