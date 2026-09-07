import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { FileFsmStore } from '../src/fsm-store.ts';
import { FileWorkflowCorrelationStore } from '../src/workflow-correlation.ts';
import { FileAipReplayStore } from '../src/aip-replay-store.ts';
import { intakeReplayFingerprint } from '../src/idempotency.ts';


async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for test condition');
}

function runNode(script: string, env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`child exited ${code}: ${stderr}`));
    });
  });
}

test('concurrent FSM writers preserve every distinct session and readers never see partial JSON', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-fsm-concurrency-'));
  const statePath = join(dir, 'fsm.json');
  const store = new FileFsmStore(statePath);
  const sessions = Array.from({ length: 10 }, () => randomUUID());
  const script = `
    import { FileFsmStore } from './src/fsm-store.ts';
    const store = new FileFsmStore(process.env.STATE_PATH);
    const sessionId = process.env.SESSION_ID;
    store.upsertOffer({
      request: {
        aip_version: '0.1.0',
        agent: { id: 'concurrency-agent-' + sessionId, consent_scope: ['intake'] },
        intake_data: {
          postal_code: '92101',
          service_need: 'leak_diagnosis',
          urgency: 'this_week',
          availability_window: 'flexible'
        },
        session_id: sessionId
      },
      offerId: 'offer-' + sessionId,
      requirementId: 'req-' + sessionId,
      quoteId: 'quote-' + sessionId,
      jobId: 'job-' + sessionId,
      validUntil: '2026-09-14T00:00:00.000Z'
    });
  `;

  try {
    const writes = sessions.map((sessionId) => runNode(script, { STATE_PATH: statePath, SESSION_ID: sessionId }));
    const readErrors: Error[] = [];
    const timer = setInterval(() => {
      try {
        store.read();
      } catch (error) {
        readErrors.push(error as Error);
      }
    }, 1);

    try {
      await Promise.all(writes);
    } finally {
      clearInterval(timer);
    }

    assert.deepEqual(readErrors, [], 'atomic replace must prevent readers from observing partial JSON');
    const state = store.read();
    assert.equal(Object.keys(state.sessions).length, sessions.length);
    for (const sessionId of sessions) assert.ok(state.sessions[sessionId]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent correlation writers preserve every distinct workflow', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-correlation-concurrency-'));
  const correlationPath = join(dir, 'correlations.json');
  const store = new FileWorkflowCorrelationStore(correlationPath);
  const ids = Array.from({ length: 10 }, (_, index) => String(index + 1));
  const script = `
    import { FileWorkflowCorrelationStore } from './src/workflow-correlation.ts';
    const store = new FileWorkflowCorrelationStore(process.env.CORRELATION_PATH);
    const id = process.env.ITEM_ID;
    store.put({
      workflow_id: 'wf-concurrent-' + id,
      operational_refs: [{ system: 'provider', object_type: 'job', id: 'job-' + id }],
      protocol_refs: [{ protocol: 'AIP', object_type: 'session', id: 'session-' + id }]
    });
  `;

  try {
    await Promise.all(ids.map((id) => runNode(script, { CORRELATION_PATH: correlationPath, ITEM_ID: id })));
    for (const id of ids) {
      assert.ok(store.getByWorkflowId(`wf-concurrent-${id}`));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an abandoned stale lock is recovered without manual repository cleanup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-stale-lock-'));
  const statePath = join(dir, 'fsm.json');
  const lockPath = `${statePath}.lock`;

  try {
    mkdirSync(lockPath);
    const old = new Date(Date.now() - 60_000);
    utimesSync(lockPath, old, old);

    const store = new FileFsmStore(statePath);
    const sessionId = randomUUID();
    const session = store.upsertOffer({
      request: {
        aip_version: '0.1.0',
        agent: { id: 'post-crash-agent', consent_scope: ['intake'] },
        intake_data: {
          postal_code: '92101',
          service_need: 'leak_diagnosis',
          urgency: 'this_week',
          availability_window: 'flexible'
        },
        session_id: sessionId
      },
      offerId: `offer-${sessionId}`,
      requirementId: `req-${sessionId}`,
      quoteId: `quote-${sessionId}`,
      jobId: `job-${sessionId}`,
      validUntil: '2026-09-14T00:00:00.000Z'
    });

    assert.equal(session.session_id, sessionId);
    assert.equal(existsSync(lockPath), false, 'stale lock should be replaced and released after the successful write');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a live owner keeps exclusivity while its synchronous critical section exceeds the stale lease', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-live-lock-'));
  const statePath = join(dir, 'state.json');
  const firstEntered = join(dir, 'first-entered');
  const firstDone = join(dir, 'first-done');
  const secondEntered = join(dir, 'second-entered');
  const lockEnv = {
    STATE_PATH: statePath,
    THI_FILE_LOCK_STALE_MS: '5000',
    THI_FILE_LOCK_UPDATE_MS: '1000'
  };
  const firstScript = `
    import { writeFileSync } from 'node:fs';
    import { withFileLock } from './src/file-state.ts';
    const waiter = new Int32Array(new SharedArrayBuffer(4));
    withFileLock(process.env.STATE_PATH, () => {
      writeFileSync(process.env.FIRST_ENTERED, String(Date.now()));
      Atomics.wait(waiter, 0, 0, 6500);
      writeFileSync(process.env.FIRST_DONE, String(Date.now()));
    });
  `;
  const secondScript = `
    import { writeFileSync } from 'node:fs';
    import { withFileLock } from './src/file-state.ts';
    withFileLock(process.env.STATE_PATH, () => {
      writeFileSync(process.env.SECOND_ENTERED, String(Date.now()));
    });
  `;

  try {
    const first = runNode(firstScript, {
      ...lockEnv,
      FIRST_ENTERED: firstEntered,
      FIRST_DONE: firstDone
    });
    await waitUntil(() => existsSync(firstEntered));
    const second = runNode(secondScript, {
      ...lockEnv,
      SECOND_ENTERED: secondEntered
    });

    await Promise.all([first, second]);
    const firstDoneAt = Number(readFileSync(firstDone, 'utf8'));
    const secondEnteredAt = Number(readFileSync(secondEntered, 'utf8'));
    assert.ok(secondEnteredAt >= firstDoneAt, 'second writer must not stale-steal a lock from a live blocked owner');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent exact AIP submits converge on one replay plan, correlation and FSM session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-submit-concurrency-'));
  const statePath = join(dir, 'fsm.json');
  const correlationPath = join(dir, 'correlations.json');
  const replayPath = join(dir, 'replays.json');
  const sessionId = randomUUID();
  const script = `
    import { PlumbingAipAdapter } from './src/aip-adapter.ts';
    import { FileFsmStore } from './src/fsm-store.ts';
    import { FileWorkflowCorrelationStore } from './src/workflow-correlation.ts';
    import { FileAipReplayStore } from './src/aip-replay-store.ts';
    const adapter = new PlumbingAipAdapter({
      store: new FileFsmStore(process.env.STATE_PATH),
      correlations: new FileWorkflowCorrelationStore(process.env.CORRELATION_PATH),
      replays: new FileAipReplayStore(process.env.REPLAY_PATH),
      now: () => new Date('2026-09-07T05:30:00.000Z')
    });
    adapter.submit({
      aip_version: '0.1.0',
      agent: { id: 'concurrent-submit-agent', consent_scope: ['intake', 'offer'] },
      intake_data: {
        postal_code: '92101',
        service_need: 'leak_diagnosis',
        urgency: 'this_week',
        availability_window: 'flexible'
      },
      session_id: process.env.SESSION_ID
    }, 'https://adapter.example');
  `;

  try {
    const env = {
      STATE_PATH: statePath,
      CORRELATION_PATH: correlationPath,
      REPLAY_PATH: replayPath,
      SESSION_ID: sessionId
    };
    await Promise.all(Array.from({ length: 6 }, () => runNode(script, env)));

    const fsm = new FileFsmStore(statePath);
    const correlations = new FileWorkflowCorrelationStore(correlationPath);
    const replays = new FileAipReplayStore(replayPath);
    const session = fsm.getBySession(sessionId);
    const correlation = correlations.findByProtocolRef('AIP', 'session', sessionId);
    assert.ok(session);
    assert.ok(correlation);
    const plan = replays.claim(sessionId, intakeReplayFingerprint({
      aip_version: '0.1.0',
      agent: { id: 'concurrent-submit-agent', consent_scope: ['intake', 'offer'] },
      intake_data: {
        postal_code: '92101',
        service_need: 'leak_diagnosis',
        urgency: 'this_week',
        availability_window: 'flexible'
      },
      session_id: sessionId
    }), () => { throw new Error('existing replay plan expected'); });
    assert.equal(plan.offer_id, session.quote.offer_id);
    assert.equal(plan.workflow_id, correlation.workflow_id);
    assert.equal(Object.keys(fsm.read().sessions).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
