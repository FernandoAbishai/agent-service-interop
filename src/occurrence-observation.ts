import type { AppointmentObservation } from './servicetitan-observation.ts';

export type OccurrenceParentRef = {
  source_object_type: string;
  source_id: string;
};

export type OccurrenceObservation = {
  source_system: string;
  source_object_type: string;
  source_id: string;
  source_status?: string;
  observed_at: string;
  parent_ref: OccurrenceParentRef;
  scheduled_window: {
    start: string | null;
    end: string | null;
    arrival_window_start: string | null;
    arrival_window_end: string | null;
  };
};

/**
 * Projects an independently identified ServiceTitan Appointment into the
 * smallest cross-system occurrence observation currently justified by the
 * experiment.
 *
 * This projection deliberately preserves the source object type and native
 * status. It does not claim that Appointment, Visit, or any future source
 * object are operationally equivalent, nor does it introduce a normalized
 * occurrence lifecycle.
 */
export function serviceTitanAppointmentToOccurrence(
  appointment: AppointmentObservation
): OccurrenceObservation {
  return {
    source_system: appointment.source_system,
    source_object_type: appointment.source_object_type,
    source_id: appointment.source_id,
    source_status: appointment.source_status,
    observed_at: appointment.observed_at,
    parent_ref: {
      source_object_type: 'job',
      source_id: appointment.job_ref
    },
    scheduled_window: {
      start: appointment.scheduled_window.start,
      end: appointment.scheduled_window.end,
      arrival_window_start: appointment.scheduled_window.arrival_window_start,
      arrival_window_end: appointment.scheduled_window.arrival_window_end
    }
  };
}
