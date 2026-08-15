export type SourceObservationRef = {
  source_system: string;
  source_object_type: string;
  source_id: string;
  source_status?: string;
  observed_at: string;
  source_modified_at?: string;
};

export type ObservationParentRef = {
  source_system: string;
  source_object_type: string;
  source_id: string;
};

/**
 * Cross-system candidate for one scheduled or schedulable real-world work
 * occurrence. This is an observation-layer type, not a canonical schema
 * migration and not an operational authority.
 *
 * Scheduling fields are nullable because some systems expose unscheduled work
 * occurrences. Source-native status remains verbatim; no universal lifecycle
 * enum is asserted here.
 */
export type OccurrenceObservation = SourceObservationRef & {
  observation_kind: 'occurrence';
  parent_ref: ObservationParentRef;
  schedule: {
    start: string | null;
    end: string | null;
    arrival_window_start: string | null;
    arrival_window_end: string | null;
  };
};
