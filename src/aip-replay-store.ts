import { readFileSync } from 'node:fs';
import { atomicWriteJson, withFileLock } from './file-state.ts';
import { ValidationError } from './validation.ts';

export type AipSubmitReplayPlan = {
  session_id: string;
  request_fingerprint: string;
  workflow_id: string;
  offer_id: string;
  requirement_id: string;
  quote_id: string;
  job_id: string;
  valid_until: string;
};

export type AipReplayStore = {
  claim(
    sessionId: string,
    requestFingerprint: string,
    create: () => AipSubmitReplayPlan
  ): AipSubmitReplayPlan;
};

type ReplayState = {
  version: 1;
  submits: Record<string, AipSubmitReplayPlan>;
};

const EMPTY_STATE: ReplayState = { version: 1, submits: {} };

function assertReplay(existing: AipSubmitReplayPlan, requestFingerprint: string): AipSubmitReplayPlan {
  if (existing.request_fingerprint !== requestFingerprint) {
    throw new ValidationError(
      'IDEMPOTENCY_CONFLICT',
      'session_id is already associated with a different semantic intake request',
      409
    );
  }
  return existing;
}

export class FileAipReplayStore implements AipReplayStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private read(): ReplayState {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as ReplayState;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'ENOENT') return structuredClone(EMPTY_STATE);
      throw error;
    }
  }

  claim(
    sessionId: string,
    requestFingerprint: string,
    create: () => AipSubmitReplayPlan
  ): AipSubmitReplayPlan {
    return withFileLock(this.filePath, () => {
      const state = this.read();
      const existing = state.submits[sessionId];
      if (existing) return assertReplay(existing, requestFingerprint);

      const plan = create();
      if (plan.session_id !== sessionId || plan.request_fingerprint !== requestFingerprint) {
        throw new Error('AIP replay plan does not match the requested session/fingerprint');
      }
      state.submits[sessionId] = plan;
      atomicWriteJson(this.filePath, state);
      return plan;
    });
  }
}

export class MemoryAipReplayStore implements AipReplayStore {
  private readonly submits = new Map<string, AipSubmitReplayPlan>();

  claim(
    sessionId: string,
    requestFingerprint: string,
    create: () => AipSubmitReplayPlan
  ): AipSubmitReplayPlan {
    const existing = this.submits.get(sessionId);
    if (existing) return assertReplay(existing, requestFingerprint);
    const plan = create();
    this.submits.set(sessionId, structuredClone(plan));
    return plan;
  }
}
