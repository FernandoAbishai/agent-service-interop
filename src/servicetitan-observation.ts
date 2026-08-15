export type SourceRef = {
  source_system: 'servicetitan';
  source_object_type: 'job' | 'appointment' | 'estimate';
  source_id: string;
  source_status?: string;
  observed_at: string;
};

export type ServiceTitanFixture = {
  observed_at: string;
  jobs: Array<{
    id: string;
    jobStatus: string;
    completedOn: string | null;
    appointmentCount: number;
    firstAppointmentId: string | null;
    lastAppointmentId: string | null;
  }>;
  appointments: Array<{
    id: string;
    jobId: string;
    status: string;
    start: string;
    end: string;
    arrivalWindowStart: string;
    arrivalWindowEnd: string;
  }>;
  estimates: Array<{
    id: string;
    jobId: string | null;
    status: string;
    soldOn: string | null;
  }>;
};

export type JobObservation = SourceRef & {
  source_object_type: 'job';
  completed_on: string | null;
  appointment_count: number;
  appointment_refs: string[];
};

export type AppointmentObservation = SourceRef & {
  source_object_type: 'appointment';
  job_ref: string;
  scheduled_window: {
    start: string;
    end: string;
    arrival_window_start: string;
    arrival_window_end: string;
  };
};

export type EstimateObservation = SourceRef & {
  source_object_type: 'estimate';
  job_ref: string | null;
  sold_on: string | null;
};

export type CompletionObservation = {
  source_system: 'servicetitan';
  job_ref: string;
  observed_at: string;
  provider_completion_claim: 'completed' | 'not_completed';
  basis: {
    job_status: string;
    completed_on: string | null;
  };
};

export class ServiceTitanFixtureObserver {
  private readonly fixture: ServiceTitanFixture;

  constructor(fixture: ServiceTitanFixture) {
    this.fixture = fixture;
  }

  observeJob(jobId: string): JobObservation {
    const job = this.fixture.jobs.find((candidate) => candidate.id === jobId);
    if (!job) throw new Error(`ServiceTitan fixture job not found: ${jobId}`);

    const appointmentRefs = this.fixture.appointments
      .filter((appointment) => appointment.jobId === job.id)
      .map((appointment) => appointment.id);

    if (appointmentRefs.length !== job.appointmentCount) {
      throw new Error(`ServiceTitan fixture appointmentCount mismatch for job ${job.id}`);
    }

    return {
      source_system: 'servicetitan',
      source_object_type: 'job',
      source_id: job.id,
      source_status: job.jobStatus,
      observed_at: this.fixture.observed_at,
      completed_on: job.completedOn,
      appointment_count: job.appointmentCount,
      appointment_refs: appointmentRefs
    };
  }

  observeAppointments(jobId: string): AppointmentObservation[] {
    return this.fixture.appointments
      .filter((appointment) => appointment.jobId === jobId)
      .map((appointment) => ({
        source_system: 'servicetitan' as const,
        source_object_type: 'appointment' as const,
        source_id: appointment.id,
        source_status: appointment.status,
        observed_at: this.fixture.observed_at,
        job_ref: appointment.jobId,
        scheduled_window: {
          start: appointment.start,
          end: appointment.end,
          arrival_window_start: appointment.arrivalWindowStart,
          arrival_window_end: appointment.arrivalWindowEnd
        }
      }));
  }

  observeEstimates(jobId?: string): EstimateObservation[] {
    return this.fixture.estimates
      .filter((estimate) => jobId === undefined || estimate.jobId === jobId)
      .map((estimate) => ({
        source_system: 'servicetitan' as const,
        source_object_type: 'estimate' as const,
        source_id: estimate.id,
        source_status: estimate.status,
        observed_at: this.fixture.observed_at,
        job_ref: estimate.jobId,
        sold_on: estimate.soldOn
      }));
  }

  observeCompletion(jobId: string): CompletionObservation {
    const job = this.observeJob(jobId);
    const completed = job.source_status.toLowerCase() === 'completed' && job.completed_on !== null;

    return {
      source_system: 'servicetitan',
      job_ref: job.source_id,
      observed_at: job.observed_at,
      provider_completion_claim: completed ? 'completed' : 'not_completed',
      basis: {
        job_status: job.source_status,
        completed_on: job.completed_on
      }
    };
  }
}
