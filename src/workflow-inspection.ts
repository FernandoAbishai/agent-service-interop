import type { FsmSession } from './types.ts';
import { FileFsmStore } from './fsm-store.ts';
import type {
  WorkflowCorrelation,
  WorkflowCorrelationReader,
  WorkflowCorrelationStore
} from './workflow-correlation.ts';

export type WorkflowInspectionFacets = {
  quote?: {
    status: string;
  };
  job?: {
    status: string;
    scheduled_for?: string | null;
  };
};

export type WorkflowInspection = {
  semantics: {
    interaction_state_meaning: string;
  };
  references: WorkflowCorrelation;
  facets: WorkflowInspectionFacets;
};

export type WorkflowFacetObserver = {
  observe(correlation: WorkflowCorrelation): WorkflowInspectionFacets | undefined;
};

export type WorkflowInspectionSource = {
  getByWorkflowId(workflowId: string): WorkflowInspection | undefined;
};

export class CorrelatedWorkflowInspectionSource implements WorkflowInspectionSource {
  private readonly correlations: WorkflowCorrelationReader;
  private readonly observer: WorkflowFacetObserver;

  constructor(correlations: WorkflowCorrelationReader, observer: WorkflowFacetObserver) {
    this.correlations = correlations;
    this.observer = observer;
  }

  getByWorkflowId(workflowId: string): WorkflowInspection | undefined {
    const correlation = this.correlations.getByWorkflowId(workflowId);
    if (!correlation) return undefined;
    const facets = this.observer.observe(correlation);
    if (!facets) return undefined;
    return {
      semantics: {
        interaction_state_meaning: 'inspection interaction state, not physical service execution state'
      },
      references: correlation,
      facets
    };
  }
}

function sessionForCorrelation(store: FileFsmStore, correlation: WorkflowCorrelation): FsmSession | undefined {
  const state = store.read();
  const jobRef = correlation.operational_refs.find((ref) =>
    ref.system === 'file_backed_fsm' && ref.object_type === 'job'
  );
  if (jobRef) {
    return Object.values(state.sessions).find((session) => session.job.job_id === jobRef.id);
  }

  const quoteRef = correlation.operational_refs.find((ref) =>
    ref.system === 'file_backed_fsm' && ref.object_type === 'quote'
  );
  if (quoteRef) {
    return Object.values(state.sessions).find((session) => session.quote.quote_id === quoteRef.id);
  }

  const requirementRef = correlation.operational_refs.find((ref) =>
    ref.system === 'file_backed_fsm' && ref.object_type === 'requirement'
  );
  if (requirementRef) {
    return Object.values(state.sessions).find((session) => session.requirement.requirement_id === requirementRef.id);
  }
  return undefined;
}

export class FileFsmWorkflowFacetObserver implements WorkflowFacetObserver {
  private readonly store: FileFsmStore;

  constructor(store: FileFsmStore) {
    this.store = store;
  }

  observe(correlation: WorkflowCorrelation): WorkflowInspectionFacets | undefined {
    const session = sessionForCorrelation(this.store, correlation);
    if (!session) return undefined;
    return {
      quote: {
        status: session.quote.status
      },
      job: {
        status: session.job.status,
        ...(session.job.scheduled_for ? { scheduled_for: session.job.scheduled_for } : {})
      }
    };
  }
}

/**
 * Compatibility reader for state created before protocol-neutral correlation
 * was introduced. It never writes the legacy mapping and is not used to create
 * new workflow IDs.
 */
class LegacyAwareFileFsmCorrelationReader implements WorkflowCorrelationReader {
  private readonly store: FileFsmStore;
  private readonly correlations: WorkflowCorrelationStore;

  constructor(store: FileFsmStore, correlations: WorkflowCorrelationStore) {
    this.store = store;
    this.correlations = correlations;
  }

  getByWorkflowId(workflowId: string): WorkflowCorrelation | undefined {
    const current = this.correlations.getByWorkflowId(workflowId);
    if (current) return current;
    if (!workflowId.startsWith('wf-')) return undefined;
    const sessionId = workflowId.slice(3);
    if (!sessionId) return undefined;
    if (this.correlations.findByProtocolRef('AIP', 'session', sessionId)) {
      return undefined;
    }
    const session = this.store.getBySession(sessionId);
    if (!session) return undefined;
    return {
      workflow_id: workflowId,
      operational_refs: [
        { system: 'file_backed_fsm', object_type: 'requirement', id: session.requirement.requirement_id },
        { system: 'file_backed_fsm', object_type: 'quote', id: session.quote.quote_id },
        { system: 'file_backed_fsm', object_type: 'job', id: session.job.job_id }
      ],
      protocol_refs: [
        { protocol: 'AIP', object_type: 'session', id: session.session_id },
        { protocol: 'AIP', object_type: 'offer', id: session.quote.offer_id }
      ]
    };
  }
}

export class FileFsmWorkflowInspectionSource extends CorrelatedWorkflowInspectionSource {
  constructor(store: FileFsmStore, correlations: WorkflowCorrelationStore) {
    super(
      new LegacyAwareFileFsmCorrelationReader(store, correlations),
      new FileFsmWorkflowFacetObserver(store)
    );
  }
}

export function projectWorkflowInspection(
  source: WorkflowInspectionSource,
  workflowId: string
): WorkflowInspection | undefined {
  return source.getByWorkflowId(workflowId);
}
