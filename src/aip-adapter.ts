import { randomUUID } from 'node:crypto';
import type { FsmSession } from './types.ts';
import { FileFsmStore } from './fsm-store.ts';
import type { WorkflowCorrelation, WorkflowCorrelationStore } from './workflow-correlation.ts';
import { MemoryAipReplayStore, type AipReplayStore, type AipSubmitReplayPlan } from './aip-replay-store.ts';
import { bindReplayFingerprint, intakeReplayFingerprint } from './idempotency.ts';
import {
  assertNoPiiAtIntake,
  assertNoPiiInIntakeRequest,
  validateBindRequest,
  validateIntakeRequest,
  ValidationError
} from './validation.ts';

export const AIP_VERSION = '0.1.0';
export const AIP_SNAPSHOT = '2026-02-27';

export type AdapterOptions = {
  store: FileFsmStore;
  correlations?: WorkflowCorrelationStore;
  replays?: AipReplayStore;
  now?: () => Date;
  idFactory?: () => string;
  workflowIdFactory?: () => string;
};

export class PlumbingAipAdapter {
  private readonly options: AdapterOptions;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly workflowIdFactory: () => string;
  private readonly replays: AipReplayStore;

  constructor(options: AdapterOptions) {
    if (options.correlations && !options.replays) {
      throw new Error('A durable/explicit AIP replay store is required when workflow correlation is enabled');
    }
    this.options = options;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.workflowIdFactory = options.workflowIdFactory ?? randomUUID;
    this.replays = options.replays ?? new MemoryAipReplayStore();
  }

  manifest(baseUrl: string) {
    return {
      aip_version: AIP_VERSION,
      provider: {
        name: 'Demo Plumbing Co.',
        url: 'https://demo-plumbing.example',
        description: 'Synthetic direct-provider fixture for residential plumbing interoperability research.'
      },
      intakes: [
        {
          id: 'residential-plumbing-quote',
          name: 'Residential Plumbing Quote',
          description: 'Request a privacy-minimized estimate for a residential leak diagnosis.',
          endpoint: `${baseUrl}/api/aip/residential-plumbing-quote`,
          method: 'POST',
          category: 'service/quote',
          input_schema: {
            type: 'object',
            required: ['postal_code', 'service_need', 'urgency', 'availability_window'],
            properties: {
              postal_code: { type: 'string', pattern: '^\\d{5}$', description: 'Postal code only; do not send a street address at intake.' },
              service_need: { type: 'string', enum: ['leak_diagnosis'] },
              urgency: { type: 'string', enum: ['emergency', 'within_24h', 'this_week', 'flexible'] },
              availability_window: { type: 'string', enum: ['weekday_morning', 'weekday_afternoon', 'weekday_after_15_00', 'weekend', 'flexible'] }
            },
            additionalProperties: false
          },
          offer_type: 'quote',
          binding_available: true,
          requires_auth: false,
          privacy: {
            data_retention: 'session',
            pii_required: false,
            redacted_acceptable: true
          }
        }
      ]
    } as const;
  }

  submit(body: unknown, baseUrl: string) {
    const request = validateIntakeRequest(body);
    assertNoPiiAtIntake(request.intake_data);
    assertNoPiiInIntakeRequest(request);

    const fingerprint = intakeReplayFingerprint(request);
    const existingSession = this.options.store.getBySession(request.session_id);

    if (existingSession) {
      // Validate legacy/current persisted state before creating a replay claim,
      // so a changed request cannot poison migration state.
      this.options.store.upsertOffer({
        request,
        offerId: existingSession.quote.offer_id,
        requirementId: existingSession.requirement.requirement_id,
        quoteId: existingSession.quote.quote_id,
        jobId: existingSession.job.job_id,
        validUntil: existingSession.quote.valid_until
      });
    }

    const existingCorrelation = this.options.correlations?.findByProtocolRef('AIP', 'session', request.session_id);
    if (existingSession && existingCorrelation) {
      this.assertCorrelationMatchesPlan(existingCorrelation, {
        session_id: request.session_id,
        request_fingerprint: fingerprint,
        workflow_id: existingCorrelation.workflow_id,
        offer_id: existingSession.quote.offer_id,
        requirement_id: existingSession.requirement.requirement_id,
        quote_id: existingSession.quote.quote_id,
        job_id: existingSession.job.job_id,
        valid_until: existingSession.quote.valid_until
      });
    }

    const plan = this.replays.claim(request.session_id, fingerprint, () =>
      this.createReplayPlan(request.session_id, fingerprint, existingSession, existingCorrelation)
    );

    if (existingSession) this.assertReplayPlanMatchesSession(plan, existingSession);
    this.ensureCorrelation(plan);

    const session = this.options.store.upsertOffer({
      request,
      offerId: plan.offer_id,
      requirementId: plan.requirement_id,
      quoteId: plan.quote_id,
      jobId: plan.job_id,
      validUntil: plan.valid_until
    });

    return this.toOfferResponse(session, baseUrl);
  }

  bind(body: unknown) {
    const request = validateBindRequest(body);
    const boundAt = this.now();
    const scheduledFor = new Date(boundAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const session = this.options.store.bind({
      request,
      boundAt: boundAt.toISOString(),
      scheduledFor,
      requestFingerprint: bindReplayFingerprint(request)
    });

    // AIP 0.1.0 specifies the bind request, but not a normative bind-response schema.
    // This result is deliberately adapter-local and must not be represented as an AIP standard object.
    return {
      status: 'bound',
      adapter_result: {
        aip_snapshot: AIP_SNAPSHOT,
        relationship_ref: session.job.job_id,
        requirement_ref: session.requirement.requirement_id,
        quote_ref: session.quote.quote_id,
        quote_status: session.quote.status,
        job_status: session.job.status,
        scheduled_for: session.job.scheduled_for
      }
    };
  }

  private idsFromCorrelation(correlation: WorkflowCorrelation) {
    const ref = (objectType: string) => correlation.operational_refs.find((candidate) =>
      candidate.system === 'file_backed_fsm' && candidate.object_type === objectType
    )?.id;
    const offerId = correlation.protocol_refs.find((candidate) =>
      candidate.protocol === 'AIP' && candidate.object_type === 'offer'
    )?.id;
    const requirementId = ref('requirement');
    const quoteId = ref('quote');
    const jobId = ref('job');
    if (!offerId || !requirementId || !quoteId || !jobId) {
      throw new Error(`AIP correlation ${correlation.workflow_id} is missing required references`);
    }
    return { offerId, requirementId, quoteId, jobId };
  }

  private createReplayPlan(
    sessionId: string,
    requestFingerprint: string,
    existingSession?: FsmSession,
    existingCorrelation?: WorkflowCorrelation
  ): AipSubmitReplayPlan {
    if (existingSession) {
      return {
        session_id: sessionId,
        request_fingerprint: requestFingerprint,
        workflow_id: existingCorrelation?.workflow_id ?? `wf-${this.workflowIdFactory()}`,
        offer_id: existingSession.quote.offer_id,
        requirement_id: existingSession.requirement.requirement_id,
        quote_id: existingSession.quote.quote_id,
        job_id: existingSession.job.job_id,
        valid_until: existingSession.quote.valid_until
      };
    }

    if (existingCorrelation) {
      const ids = this.idsFromCorrelation(existingCorrelation);
      return {
        session_id: sessionId,
        request_fingerprint: requestFingerprint,
        workflow_id: existingCorrelation.workflow_id,
        offer_id: ids.offerId,
        requirement_id: ids.requirementId,
        quote_id: ids.quoteId,
        job_id: ids.jobId,
        valid_until: new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    return {
      session_id: sessionId,
      request_fingerprint: requestFingerprint,
      workflow_id: `wf-${this.workflowIdFactory()}`,
      offer_id: this.idFactory(),
      requirement_id: `req-${this.idFactory()}`,
      quote_id: `quote-${this.idFactory()}`,
      job_id: `job-${this.idFactory()}`,
      valid_until: new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
  }


  private assertReplayPlanMatchesSession(plan: AipSubmitReplayPlan, session: FsmSession): void {
    const matches =
      plan.session_id === session.session_id &&
      plan.offer_id === session.quote.offer_id &&
      plan.requirement_id === session.requirement.requirement_id &&
      plan.quote_id === session.quote.quote_id &&
      plan.job_id === session.job.job_id &&
      plan.valid_until === session.quote.valid_until;
    if (matches) return;
    throw new ValidationError(
      'IDEMPOTENCY_CONFLICT',
      'Persisted AIP replay references do not match operational state',
      409
    );
  }

  private correlationMatchesPlan(correlation: WorkflowCorrelation, plan: AipSubmitReplayPlan): boolean {
    if (correlation.workflow_id !== plan.workflow_id) return false;

    const operational = (objectType: string) => correlation.operational_refs.filter((candidate) =>
      candidate.system === 'file_backed_fsm' && candidate.object_type === objectType
    );
    const protocol = (objectType: string) => correlation.protocol_refs.filter((candidate) =>
      candidate.protocol === 'AIP' && candidate.object_type === objectType
    );

    const requirement = operational('requirement');
    const quote = operational('quote');
    const job = operational('job');
    const session = protocol('session');
    const offer = protocol('offer');

    return requirement.length === 1 && requirement[0].id === plan.requirement_id &&
      quote.length === 1 && quote[0].id === plan.quote_id &&
      job.length === 1 && job[0].id === plan.job_id &&
      session.length === 1 && session[0].id === plan.session_id &&
      offer.length === 1 && offer[0].id === plan.offer_id;
  }

  private assertCorrelationMatchesPlan(correlation: WorkflowCorrelation, plan: AipSubmitReplayPlan): void {
    if (this.correlationMatchesPlan(correlation, plan)) return;
    throw new ValidationError(
      'IDEMPOTENCY_CONFLICT',
      'Persisted AIP correlation references do not match replay/operational state',
      409
    );
  }

  private ensureCorrelation(plan: AipSubmitReplayPlan): void {
    if (!this.options.correlations) return;
    const existing = this.options.correlations.findByProtocolRef('AIP', 'session', plan.session_id);
    if (existing) {
      this.assertCorrelationMatchesPlan(existing, plan);
      return;
    }

    try {
      this.options.correlations.put({
        workflow_id: plan.workflow_id,
        operational_refs: [
          { system: 'file_backed_fsm', object_type: 'requirement', id: plan.requirement_id },
          { system: 'file_backed_fsm', object_type: 'quote', id: plan.quote_id },
          { system: 'file_backed_fsm', object_type: 'job', id: plan.job_id }
        ],
        protocol_refs: [
          { protocol: 'AIP', object_type: 'session', id: plan.session_id },
          { protocol: 'AIP', object_type: 'offer', id: plan.offer_id }
        ]
      });
    } catch (error) {
      const winner = this.options.correlations.findByProtocolRef('AIP', 'session', plan.session_id);
      if (winner) {
        this.assertCorrelationMatchesPlan(winner, plan);
        return;
      }
      throw error;
    }
  }

  private toOfferResponse(session: FsmSession, baseUrl: string) {
    return {
      aip_version: AIP_VERSION,
      session_id: session.session_id,
      status: 'offer',
      offer: {
        id: session.quote.offer_id,
        summary: `Demo Plumbing Co. can provide a leak diagnosis. Current estimate: $${session.quote.total} ${session.quote.currency}.`,
        details: {
          provider_id: 'provider_demo_plumbing',
          requirement_ref: session.requirement.requirement_id,
          quote_ref: session.quote.quote_id,
          service_need: session.requirement.service_need,
          line_items: session.quote.line_items,
          total: session.quote.total,
          currency: session.quote.currency
        },
        expires: session.quote.valid_until,
        bind_endpoint: `${baseUrl}/api/aip/bind`,
        bind_requires: ['full_name', 'phone', 'address']
      },
      metadata: {
        provider_ref: session.quote.quote_id
      }
    } as const;
  }
}
