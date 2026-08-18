import { FileFsmStore } from './fsm-store.ts';
import { toCanonicalWorkflow } from './canonical.ts';

export type WorkflowInspection = {
  semantics: {
    interaction_state_meaning: string;
    operational_authority: string;
  };
  references: {
    canonical_workflow_id: string;
    requirement_id: string;
    quote_id: string;
    aip_offer_id: string;
    operational_job_id: string;
  };
  observed_state: {
    quote_status: string;
    job_status: string;
    scheduled_for: string | null;
    completion_status: string;
    customer_decision_status: string;
  };
};

export function sessionIdFromWorkflowId(workflowId: string): string | undefined {
  if (!workflowId.startsWith('wf-')) return undefined;
  const sessionId = workflowId.slice(3);
  return sessionId.length > 0 ? sessionId : undefined;
}

export function projectWorkflowInspection(store: FileFsmStore, workflowId: string): WorkflowInspection | undefined {
  const sessionId = sessionIdFromWorkflowId(workflowId);
  const session = sessionId ? store.getBySession(sessionId) : undefined;
  if (!session) return undefined;

  const canonical = toCanonicalWorkflow(session);
  return {
    semantics: {
      interaction_state_meaning: 'inspection interaction state, not physical service execution state',
      operational_authority: canonical.provider.operational_system
    },
    references: {
      canonical_workflow_id: canonical.workflow_id,
      requirement_id: canonical.requirement.requirement_id,
      quote_id: canonical.quote.quote_id,
      aip_offer_id: canonical.quote.representation_refs.aip_offer,
      operational_job_id: canonical.job.job_id
    },
    observed_state: {
      quote_status: canonical.quote.status,
      job_status: canonical.job.status,
      scheduled_for: 'scheduled_for' in canonical.job ? canonical.job.scheduled_for : null,
      completion_status: canonical.completion.provider_claim.status,
      customer_decision_status: canonical.customer_decision.status
    }
  };
}
