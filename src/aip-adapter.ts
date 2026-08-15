import { randomUUID } from 'node:crypto';
import type { FsmSession } from './types.ts';
import { FileFsmStore } from './fsm-store.ts';
import { assertNoPiiAtIntake, validateBindRequest, validateIntakeRequest, ValidationError } from './validation.ts';

export const AIP_VERSION = '0.1.0';
export const AIP_SNAPSHOT = '2026-02-27';

export type AdapterOptions = {
  store: FileFsmStore;
  now?: () => Date;
  idFactory?: () => string;
};

export class PlumbingAipAdapter {
  private readonly options: AdapterOptions;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: AdapterOptions) {
    this.options = options;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
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

    const existing = this.options.store.getBySession(request.session_id);
    const session = existing ?? this.options.store.upsertOffer({
      request,
      offerId: this.idFactory(),
      requirementId: `req-${this.idFactory()}`,
      quoteId: `quote-${this.idFactory()}`,
      jobId: `job-${this.idFactory()}`,
      validUntil: new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });

    if (existing && existing.agent_id !== request.agent.id) {
      throw new ValidationError('INVALID_INPUT', 'session_id is already associated with a different agent');
    }

    return this.toOfferResponse(session, baseUrl);
  }

  bind(body: unknown) {
    const request = validateBindRequest(body);
    const boundAt = this.now();
    const scheduledFor = new Date(boundAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const session = this.options.store.bind({ request, boundAt: boundAt.toISOString(), scheduledFor });

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
