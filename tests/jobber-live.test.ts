import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_JOBBER_GRAPHQL_VERSION } from '../src/jobber-graphql.ts';
import { observeJobberJobVisits } from '../src/jobber-observation.ts';
import { jobberVisitToOccurrence } from '../src/jobber-occurrence.ts';

const enabled = process.env.JOBBER_LIVE === '1';

test(
  'live Jobber Job/Visit observations map to OccurrenceObservation without mutation',
  { skip: !enabled },
  async () => {
    const accessToken = process.env.JOBBER_ACCESS_TOKEN;
    const jobId = process.env.JOBBER_JOB_ID;
    assert.ok(accessToken, 'JOBBER_ACCESS_TOKEN is required when JOBBER_LIVE=1');
    assert.ok(jobId, 'JOBBER_JOB_ID is required when JOBBER_LIVE=1');

    const requestedVersion = process.env.JOBBER_GRAPHQL_VERSION ?? DEFAULT_JOBBER_GRAPHQL_VERSION;
    const observation = await observeJobberJobVisits({
      accessToken,
      jobId,
      version: requestedVersion
    });

    assert.equal(observation.api_version, requestedVersion);
    assert.ok(observation.visits.length >= 1, 'Seed the Jobber test Job with at least one Visit');

    const occurrences = observation.visits.map(jobberVisitToOccurrence);
    assert.equal(occurrences.length, observation.visits.length);

    for (let index = 0; index < occurrences.length; index += 1) {
      const visit = observation.visits[index];
      const occurrence = occurrences[index];
      assert.equal(occurrence.source_system, 'jobber');
      assert.equal(occurrence.source_object_type, 'visit');
      assert.equal(occurrence.source_id, visit.source_id);
      assert.equal(occurrence.source_status, visit.source_status);
      assert.equal(occurrence.parent_ref.source_object_type, 'job');
      assert.equal(occurrence.parent_ref.source_id, observation.job.source_id);
    }

    const unscheduled = observation.visits.find(
      (visit) => visit.start_at === null && visit.end_at === null
    );
    assert.ok(
      unscheduled,
      'Seed at least one unscheduled Visit to exercise the nullable-schedule falsification case'
    );

    const unscheduledOccurrence = jobberVisitToOccurrence(unscheduled);
    assert.equal(unscheduledOccurrence.scheduled_window.start, null);
    assert.equal(unscheduledOccurrence.scheduled_window.end, null);

    const completed = observation.visits.find((visit) => visit.is_complete);
    const incomplete = observation.visits.find((visit) => !visit.is_complete);
    assert.ok(completed, 'Seed at least one completed Visit');
    assert.ok(incomplete, 'Seed at least one incomplete Visit');

    assert.equal('is_complete' in jobberVisitToOccurrence(completed), false);
    assert.equal('client_confirmed' in jobberVisitToOccurrence(completed), false);
  }
);
