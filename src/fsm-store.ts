import { readFileSync } from 'node:fs';
import type { AipBindRequest, AipIntakeRequest, FsmSession, FsmState } from './types.ts';
import { atomicWriteJson, withFileLock } from './file-state.ts';
import { ValidationError } from './validation.ts';

const EMPTY_STATE: FsmState = { version: 1, sessions: {} };

export class FileFsmStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  read(): FsmState {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as FsmState;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') return structuredClone(EMPTY_STATE);
      throw error;
    }
  }

  private write(state: FsmState): void {
    atomicWriteJson(this.filePath, state);
  }

  getBySession(sessionId: string): FsmSession | undefined {
    return this.read().sessions[sessionId];
  }

  upsertOffer(input: {
    request: AipIntakeRequest;
    offerId: string;
    requirementId: string;
    quoteId: string;
    jobId: string;
    validUntil: string;
  }): FsmSession {
    return withFileLock(this.filePath, () => {
      const state = this.read();
      const existing = state.sessions[input.request.session_id];
      if (existing) {
        const data = input.request.intake_data;
        const sameSemanticIntake =
          existing.agent_id === input.request.agent.id &&
          existing.requirement.postal_code === data.postal_code &&
          existing.requirement.service_need === data.service_need &&
          existing.requirement.urgency === data.urgency &&
          existing.requirement.availability_window === data.availability_window;
        if (!sameSemanticIntake) {
          throw new ValidationError(
            'IDEMPOTENCY_CONFLICT',
            'session_id is already associated with a different semantic intake request',
            409
          );
        }
        return existing;
      }

      const session: FsmSession = {
      session_id: input.request.session_id,
      agent_id: input.request.agent.id,
      requirement: {
        requirement_id: input.requirementId,
        postal_code: input.request.intake_data.postal_code,
        service_need: input.request.intake_data.service_need,
        urgency: input.request.intake_data.urgency,
        availability_window: input.request.intake_data.availability_window
      },
      quote: {
        quote_id: input.quoteId,
        offer_id: input.offerId,
        status: 'offered',
        currency: 'USD',
        line_items: [
          { description: 'Diagnostic visit', amount: 89 },
          { description: 'Replace sink P-trap assembly if confirmed during diagnosis', amount: 145 }
        ],
        total: 234,
        valid_until: input.validUntil
      },
      job: {
        job_id: input.jobId,
        status: 'pending'
      },
      binding: null
      };

      state.sessions[input.request.session_id] = session;
      this.write(state);
      return session;
    });
  }

  bind(input: { request: AipBindRequest; boundAt: string; scheduledFor: string; requestFingerprint: string }): FsmSession {
    return withFileLock(this.filePath, () => {
      const state = this.read();
      const session = state.sessions[input.request.session_id];
      if (!session) {
        throw new ValidationError('OFFER_NOT_FOUND', 'Offer not found for this session', 404);
      }

      if (session.binding) {
        if (session.binding.request_fingerprint === input.requestFingerprint) return session;

        if (!session.binding.request_fingerprint) {
          throw new ValidationError(
            'IDEMPOTENCY_CONFLICT',
            'Legacy binding has no replay fingerprint, so exact Bind replay cannot be proven',
            409
          );
        }

        throw new ValidationError(
          'IDEMPOTENCY_CONFLICT',
          'session_id is already bound with different bind data',
          409
        );
      }

      if (session.quote.offer_id !== input.request.offer_id) {
        throw new ValidationError('OFFER_NOT_FOUND', 'Offer not found for this session', 404);
      }
      if (session.agent_id !== input.request.agent.id) {
        throw new ValidationError('INVALID_INPUT', 'Binding agent must match the intake agent');
      }
      if (new Date(session.quote.valid_until).getTime() <= new Date(input.boundAt).getTime()) {
        throw new ValidationError('OFFER_EXPIRED', 'Offer has expired', 410);
      }
      if (input.request.bind_data.address.postal_code !== session.requirement.postal_code) {
        throw new ValidationError('INVALID_INPUT', 'Bind address postal_code must match the intake postal_code');
      }

      session.quote.status = 'accepted';
      session.job.status = 'scheduled';
      session.job.scheduled_for = input.scheduledFor;
      session.binding = {
        full_name: input.request.bind_data.full_name,
        phone: input.request.bind_data.phone,
        address: input.request.bind_data.address,
        email: input.request.bind_data.email,
        bound_at: input.boundAt,
        request_fingerprint: input.requestFingerprint
      };
      this.write(state);
      return session;
    });
  }
}
