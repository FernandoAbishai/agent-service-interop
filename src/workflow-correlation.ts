import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type OperationalReference = {
  system: string;
  object_type: string;
  id: string;
};

export type ProtocolReference = {
  protocol: string;
  object_type: string;
  id: string;
};

export type WorkflowCorrelation = {
  /** Repository-local interoperability correlation ID; never operational authority. */
  workflow_id: string;
  operational_refs: OperationalReference[];
  protocol_refs: ProtocolReference[];
};

export type WorkflowCorrelationReader = {
  getByWorkflowId(workflowId: string): WorkflowCorrelation | undefined;
};

export type WorkflowCorrelationStore = WorkflowCorrelationReader & {
  findByProtocolRef(protocol: string, objectType: string, id: string): WorkflowCorrelation | undefined;
  put(correlation: WorkflowCorrelation): WorkflowCorrelation;
};

type CorrelationState = {
  version: 1;
  workflows: Record<string, WorkflowCorrelation>;
};

const EMPTY_STATE: CorrelationState = { version: 1, workflows: {} };

function assertCorrelationShape(correlation: WorkflowCorrelation): void {
  if (!correlation.workflow_id.startsWith('wf-') || correlation.workflow_id.length <= 3) {
    throw new Error('workflow_id must be an explicit interoperability correlation ID beginning with wf-');
  }
}

function assertProtocolRefsUnclaimed(
  existing: Iterable<WorkflowCorrelation>,
  correlation: WorkflowCorrelation
): void {
  for (const candidate of existing) {
    if (candidate.workflow_id === correlation.workflow_id) continue;
    for (const ref of correlation.protocol_refs) {
      if (candidate.protocol_refs.some((existingRef) =>
        existingRef.protocol === ref.protocol &&
        existingRef.object_type === ref.object_type &&
        existingRef.id === ref.id
      )) {
        throw new Error(
          `${ref.protocol} ${ref.object_type} ${ref.id} is already correlated to ${candidate.workflow_id}`
        );
      }
    }
  }
}

export class FileWorkflowCorrelationStore implements WorkflowCorrelationStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private read(): CorrelationState {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as CorrelationState;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') return structuredClone(EMPTY_STATE);
      throw error;
    }
  }

  private write(state: CorrelationState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  getByWorkflowId(workflowId: string): WorkflowCorrelation | undefined {
    return this.read().workflows[workflowId];
  }

  findByProtocolRef(protocol: string, objectType: string, id: string): WorkflowCorrelation | undefined {
    return Object.values(this.read().workflows).find((correlation) =>
      correlation.protocol_refs.some((ref) =>
        ref.protocol === protocol && ref.object_type === objectType && ref.id === id
      )
    );
  }

  put(correlation: WorkflowCorrelation): WorkflowCorrelation {
    assertCorrelationShape(correlation);
    const state = this.read();
    const existing = state.workflows[correlation.workflow_id];
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(correlation)) {
        throw new Error(`workflow_id ${correlation.workflow_id} is already mapped to different references`);
      }
      return existing;
    }
    assertProtocolRefsUnclaimed(Object.values(state.workflows), correlation);
    state.workflows[correlation.workflow_id] = correlation;
    this.write(state);
    return correlation;
  }
}

export class MemoryWorkflowCorrelationStore implements WorkflowCorrelationStore {
  private readonly workflows = new Map<string, WorkflowCorrelation>();

  getByWorkflowId(workflowId: string): WorkflowCorrelation | undefined {
    return this.workflows.get(workflowId);
  }

  findByProtocolRef(protocol: string, objectType: string, id: string): WorkflowCorrelation | undefined {
    return [...this.workflows.values()].find((correlation) =>
      correlation.protocol_refs.some((ref) =>
        ref.protocol === protocol && ref.object_type === objectType && ref.id === id
      )
    );
  }

  put(correlation: WorkflowCorrelation): WorkflowCorrelation {
    assertCorrelationShape(correlation);
    const existing = this.workflows.get(correlation.workflow_id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(correlation)) {
        throw new Error(`workflow_id ${correlation.workflow_id} is already mapped to different references`);
      }
      return existing;
    }
    assertProtocolRefsUnclaimed(this.workflows.values(), correlation);
    this.workflows.set(correlation.workflow_id, structuredClone(correlation));
    return correlation;
  }
}
