import { createHash } from 'node:crypto';
import type { AipBindRequest, AipIntakeRequest } from './types.ts';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)])
  );
}

export function bindReplayFingerprint(request: AipBindRequest): string {
  const replayIdentity = {
    offer_id: request.offer_id,
    session_id: request.session_id,
    agent_id: request.agent.id,
    bind_data: request.bind_data
  };
  const serialized = JSON.stringify(canonicalize(replayIdentity));
  return createHash('sha256').update(serialized).digest('hex');
}

export function intakeReplayFingerprint(request: AipIntakeRequest): string {
  const replayIdentity = {
    aip_version: request.aip_version,
    session_id: request.session_id,
    agent_id: request.agent.id,
    intake_data: request.intake_data
  };
  const serialized = JSON.stringify(canonicalize(replayIdentity));
  return createHash('sha256').update(serialized).digest('hex');
}
