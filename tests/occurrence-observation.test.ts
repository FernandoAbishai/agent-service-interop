import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ServiceTitanFixtureObserver,
  type ServiceTitanFixture
} from '../src/servicetitan-observation.ts';
import { serviceTitanAppointmentToOccurrence } from '../src/occurrence-observation.ts';

function observer() {
  const fixture = JSON.parse(
    readFileSync(resolve('fixtures/servicetitan/second-system.example.json'), 'utf8')
  ) as ServiceTitanFixture;
  return new ServiceTitanFixtureObserver(fixture);
}

test('projects multiple ServiceTitan appointments as distinct occurrences without scalarizing schedule', () => {
  const appointments = observer().observeAppointments('st-job-1001');
  const occurrences = appointments.map(serviceTitanAppointmentToOccurrence);

  assert.equal(occurrences.length, 2);
  assert.notEqual(occurrences[0].source_id, occurrences[1].source_id);
  assert.notEqual(occurrences[0].scheduled_window.start, occurrences[1].scheduled_window.start);
  assert.ok(occurrences.every((occurrence) => occurrence.parent_ref.source_id === 'st-job-1001'));
  assert.ok(occurrences.every((occurrence) => occurrence.parent_ref.source_object_type === 'job'));
});

test('preserves source object type and source-native status rather than inventing an occurrence state', () => {
  const [appointment] = observer().observeAppointments('st-job-1002');
  const occurrence = serviceTitanAppointmentToOccurrence(appointment);

  assert.equal(occurrence.source_system, 'servicetitan');
  assert.equal(occurrence.source_object_type, 'appointment');
  assert.equal(occurrence.source_status, 'Done');
  assert.equal(occurrence.observed_at, '2026-08-15T17:45:00.000Z');
});

test('occurrence projection does not imply provider completion or customer acceptance', () => {
  const [appointment] = observer().observeAppointments('st-job-1002');
  const occurrence = serviceTitanAppointmentToOccurrence(appointment);

  assert.equal('provider_completion_claim' in occurrence, false);
  assert.equal('customer_decision' in occurrence, false);
  assert.equal('occurrence_state' in occurrence, false);
});
