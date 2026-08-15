import type { FsmSession } from './types.ts';

/**
 * Project authoritative operational-system state into the experiment's
 * normalized interoperability representation.
 *
 * This function does not make the canonical object authoritative. The FSM
 * transition has already happened before this projection is produced.
 */
export function toCanonicalWorkflow(session: FsmSession) {
  return {
    schema_version: '0.1.0-experimental',
    workflow_id: `wf-${session.session_id}`,
    provider: {
      provider_id: 'provider_demo_plumbing',
      name: 'Demo Plumbing Co.',
      operational_system: 'file_backed_fsm',
      external_refs: {
        fsm_session_id: session.session_id
      }
    },
    requirement: {
      requirement_id: session.requirement.requirement_id,
      service_category: 'residential_plumbing.leak_diagnosis',
      description: 'Residential leak diagnosis requested through an AIP privacy-minimized intake.',
      location: {
        postal_code: session.requirement.postal_code,
        country: 'US'
      },
      constraints: [
        `urgency:${session.requirement.urgency}`,
        `availability:${session.requirement.availability_window}`
      ],
      attachments: []
    },
    quote: {
      quote_id: session.quote.quote_id,
      status: session.quote.status,
      currency: session.quote.currency,
      line_items: session.quote.line_items,
      total: session.quote.total,
      valid_until: session.quote.valid_until,
      source_system_ref: session.quote.quote_id,
      representation_refs: {
        aip_offer: session.quote.offer_id
      }
    },
    job: {
      job_id: session.job.job_id,
      status: session.job.status,
      source_system_ref: session.job.job_id,
      ...(session.job.scheduled_for ? { scheduled_for: session.job.scheduled_for } : {})
    },
    completion: {
      provider_claim: {
        status: 'not_claimed'
      },
      evidence: []
    },
    customer_decision: {
      status: 'pending',
      decision_mode: 'human_reviewed',
      evidence_refs: []
    },
    provenance: {
      canonical_created_at: session.binding?.bound_at ?? new Date(0).toISOString(),
      adapter: 'aip-file-fsm-adapter@0.1.0',
      source_revision: `${session.job.job_id}:${session.job.status}`,
      protocol_views: [
        {
          protocol: 'AIP',
          version_or_date: '0.1.0 / 2026-02-27',
          status: session.binding ? 'round_tripped' : 'generated',
          artifact_ref: session.quote.offer_id
        }
      ]
    }
  } as const;
}

export function assertCanonicalWorkflow(value: ReturnType<typeof toCanonicalWorkflow>): void {
  if (value.schema_version !== '0.1.0-experimental') throw new Error('canonical schema_version mismatch');
  if (!value.workflow_id) throw new Error('canonical workflow_id is required');
  if (!value.provider.provider_id || !value.provider.operational_system) throw new Error('canonical provider is incomplete');
  if (!value.requirement.requirement_id || !value.requirement.location.postal_code) throw new Error('canonical requirement is incomplete');
  if (!['offered', 'accepted'].includes(value.quote.status)) throw new Error('canonical quote status is invalid');
  if (!/^[A-Z]{3}$/.test(value.quote.currency)) throw new Error('canonical quote currency is invalid');
  if (value.quote.line_items.length === 0 || value.quote.total < 0) throw new Error('canonical quote is incomplete');
  if (Number.isNaN(Date.parse(value.quote.valid_until))) throw new Error('canonical quote valid_until is invalid');
  if (!['pending', 'scheduled'].includes(value.job.status)) throw new Error('canonical job status is invalid for Tier 1');
  if (value.job.status === 'scheduled' && !('scheduled_for' in value.job)) throw new Error('scheduled canonical job requires scheduled_for');
  if (value.provenance.protocol_views[0].protocol !== 'AIP') throw new Error('canonical provenance must retain the AIP view');
}
