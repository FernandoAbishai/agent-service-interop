import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ServiceTitanFixtureObserver, type ServiceTitanFixture } from '../src/servicetitan-observation.ts';

function observer() {
  const fixture = JSON.parse(
    readFileSync(resolve('fixtures/servicetitan/second-system.example.json'), 'utf8')
  ) as ServiceTitanFixture;
  return new ServiceTitanFixtureObserver(fixture);
}

test('preserves one Job to many Appointment identities and schedules', () => {
  const source = observer();
  const job = source.observeJob('st-job-1001');
  const appointments = source.observeAppointments(job.source_id);

  assert.equal(job.source_status, 'Scheduled');
  assert.equal(job.appointment_count, 2);
  assert.deepEqual(job.appointment_refs, ['st-appt-2001', 'st-appt-2002']);
  assert.equal(appointments.length, 2);
  assert.notEqual(appointments[0].source_id, appointments[1].source_id);
  assert.notEqual(appointments[0].scheduled_window.start, appointments[1].scheduled_window.start);
  assert.ok(appointments.every((appointment) => appointment.job_ref === job.source_id));
});

test('does not require every sold Estimate to have a Job relationship', () => {
  const estimates = observer().observeEstimates();
  const linked = estimates.find((estimate) => estimate.source_id === 'st-est-3001');
  const unbooked = estimates.find((estimate) => estimate.source_id === 'st-est-3002');

  assert.ok(linked);
  assert.equal(linked.job_ref, 'st-job-1001');
  assert.equal(linked.source_status, 'Sold');

  assert.ok(unbooked);
  assert.equal(unbooked.source_status, 'Sold');
  assert.equal(unbooked.job_ref, null);
  assert.ok(unbooked.sold_on);
});

test('observes provider completion from native Job state without inferring payment', () => {
  const source = observer();
  const scheduled = source.observeCompletion('st-job-1001');
  const completed = source.observeCompletion('st-job-1002');

  assert.equal(scheduled.provider_completion_claim, 'not_completed');
  assert.equal(scheduled.basis.job_status, 'Scheduled');
  assert.equal(scheduled.basis.completed_on, null);

  assert.equal(completed.provider_completion_claim, 'completed');
  assert.equal(completed.basis.job_status, 'Completed');
  assert.equal(completed.basis.completed_on, '2026-08-14T22:15:00.000Z');
});

test('keeps source-native status and observation provenance instead of inventing a universal state machine', () => {
  const source = observer();
  const job = source.observeJob('st-job-1002');
  const [appointment] = source.observeAppointments(job.source_id);

  assert.equal(job.source_system, 'servicetitan');
  assert.equal(job.source_object_type, 'job');
  assert.equal(job.observed_at, '2026-08-15T17:45:00.000Z');
  assert.equal(job.source_status, 'Completed');

  assert.equal(appointment.source_system, 'servicetitan');
  assert.equal(appointment.source_object_type, 'appointment');
  assert.equal(appointment.source_status, 'Done');
  assert.notEqual(appointment.source_status, job.source_status);
});
