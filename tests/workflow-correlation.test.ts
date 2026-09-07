import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileWorkflowCorrelationStore } from '../src/workflow-correlation.ts';

test('file correlation store persists only correlation and reference data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-workflow-correlation-'));
  const path = join(dir, 'correlations.json');
  try {
    const store = new FileWorkflowCorrelationStore(path);
    const correlation = store.put({
      workflow_id: 'wf-correlation-001',
      operational_refs: [
        { system: 'provider_system', object_type: 'job', id: 'job-001' }
      ],
      protocol_refs: [
        { protocol: 'AIP', object_type: 'session', id: 'session-001' }
      ]
    });

    assert.deepEqual(store.getByWorkflowId(correlation.workflow_id), correlation);
    assert.deepEqual(store.findByProtocolRef('AIP', 'session', 'session-001'), correlation);
    const serialized = readFileSync(path, 'utf8');
    assert.equal(serialized.includes('quote_status'), false);
    assert.equal(serialized.includes('job_status'), false);
    assert.equal(serialized.includes('full_name'), false);
    assert.equal(serialized.includes('phone'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file correlation store rejects conflicting reuse of a workflow ID', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-workflow-correlation-conflict-'));
  const store = new FileWorkflowCorrelationStore(join(dir, 'correlations.json'));
  try {
    store.put({
      workflow_id: 'wf-correlation-001',
      operational_refs: [{ system: 'provider_system', object_type: 'job', id: 'job-001' }],
      protocol_refs: []
    });
    assert.throws(() => store.put({
      workflow_id: 'wf-correlation-001',
      operational_refs: [{ system: 'provider_system', object_type: 'job', id: 'job-002' }],
      protocol_refs: []
    }), /already mapped to different references/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('correlation store rejects assigning one protocol object to two workflow IDs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-workflow-correlation-protocol-conflict-'));
  const store = new FileWorkflowCorrelationStore(join(dir, 'correlations.json'));
  try {
    store.put({
      workflow_id: 'wf-correlation-001',
      operational_refs: [{ system: 'provider_system', object_type: 'job', id: 'job-001' }],
      protocol_refs: [{ protocol: 'AIP', object_type: 'session', id: 'session-001' }]
    });
    assert.throws(() => store.put({
      workflow_id: 'wf-correlation-002',
      operational_refs: [{ system: 'provider_system', object_type: 'job', id: 'job-002' }],
      protocol_refs: [{ protocol: 'AIP', object_type: 'session', id: 'session-001' }]
    }), /already correlated/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
