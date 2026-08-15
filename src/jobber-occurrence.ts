import type { OccurrenceObservation } from './occurrence-observation.ts';

export type JobberArrivalWindow = {
  startAt: string;
  endAt: string;
} | null;

export type JobberVisitObservation = {
  source_system: 'jobber';
  source_object_type: 'visit';
  source_id: string;
  source_status: string;
  observed_at: string;
  start_at: string | null;
  end_at: string | null;
  arrival_window: JobberArrivalWindow;
  is_complete: boolean;
  completed_at: string | null;
  completed_by: string | null;
  client_confirmed: boolean;
  job: {
    source_id: string;
    source_status: string;
  };
};

export type JobberVisitGraphqlNode = {
  id: string;
  visitStatus: string;
  startAt: string | null;
  endAt: string | null;
  arrivalWindow: JobberArrivalWindow;
  isComplete: boolean;
  completedAt: string | null;
  completedBy: string | null;
  clientConfirmed: boolean;
  job: {
    id: string;
    jobStatus: string;
  };
};

/**
 * Captures Jobber's source-native Visit shape before any interoperability
 * projection. Completion and client confirmation remain Jobber observations;
 * they are deliberately not promoted to generic completion/customer-decision
 * semantics in this experiment.
 */
export function observeJobberVisit(
  visit: JobberVisitGraphqlNode,
  observedAt: string
): JobberVisitObservation {
  return {
    source_system: 'jobber',
    source_object_type: 'visit',
    source_id: visit.id,
    source_status: visit.visitStatus,
    observed_at: observedAt,
    start_at: visit.startAt,
    end_at: visit.endAt,
    arrival_window: visit.arrivalWindow,
    is_complete: visit.isComplete,
    completed_at: visit.completedAt,
    completed_by: visit.completedBy,
    client_confirmed: visit.clientConfirmed,
    job: {
      source_id: visit.job.id,
      source_status: visit.job.jobStatus
    }
  };
}

/**
 * Projects a Jobber Visit into the same read-only OccurrenceObservation
 * vocabulary already exercised by ServiceTitan Appointments.
 *
 * The mapping preserves Jobber identifiers/statuses verbatim. Null start/end
 * values remain null for unscheduled Visits. Source-native completion and
 * client-confirmation facts intentionally stay outside OccurrenceObservation.
 */
export function jobberVisitToOccurrence(
  visit: JobberVisitObservation
): OccurrenceObservation {
  return {
    source_system: visit.source_system,
    source_object_type: visit.source_object_type,
    source_id: visit.source_id,
    source_status: visit.source_status,
    observed_at: visit.observed_at,
    parent_ref: {
      source_object_type: 'job',
      source_id: visit.job.source_id
    },
    scheduled_window: {
      start: visit.start_at,
      end: visit.end_at,
      arrival_window_start: visit.arrival_window?.startAt ?? null,
      arrival_window_end: visit.arrival_window?.endAt ?? null
    }
  };
}
