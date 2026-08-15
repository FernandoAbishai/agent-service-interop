import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOBBER_JOB_VISITS_QUERY,
  observeJobberJobVisits
} from '../src/jobber-observation.ts';

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('reads every Jobber Visit page without mutating or normalizing source state', async () => {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const jobId = 'jobber-job-1';

  const fakeFetch: typeof fetch = async (_input, init) => {
    const parsed = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    calls.push(parsed);

    if (calls.length === 1) {
      return response({
        data: {
          job: {
            id: jobId,
            jobStatus: 'ACTIVE',
            visits: {
              nodes: [
                {
                  id: 'visit-1',
                  visitStatus: 'UPCOMING',
                  startAt: '2026-08-20T16:00:00Z',
                  endAt: '2026-08-20T17:00:00Z',
                  arrivalWindow: null,
                  isComplete: false,
                  completedAt: null,
                  completedBy: null,
                  clientConfirmed: false
                }
              ],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
              totalCount: 2
            }
          }
        },
        extensions: { versioning: { version: '2025-04-16' } }
      });
    }

    return response({
      data: {
        job: {
          id: jobId,
          jobStatus: 'ACTIVE',
          visits: {
            nodes: [
              {
                id: 'visit-2',
                visitStatus: 'UNSCHEDULED',
                startAt: null,
                endAt: null,
                arrivalWindow: null,
                isComplete: false,
                completedAt: null,
                completedBy: null,
                clientConfirmed: false
              }
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
            totalCount: 2
          }
        }
      },
      extensions: { versioning: { version: '2025-04-16' } }
    });
  };

  const observation = await observeJobberJobVisits({
    accessToken: 'local-test-token',
    jobId,
    observedAt: '2026-08-15T23:00:00.000Z',
    pageSize: 1,
    fetchImpl: fakeFetch
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].variables.after, null);
  assert.equal(calls[1].variables.after, 'cursor-1');
  assert.ok(calls.every((call) => call.query === JOBBER_JOB_VISITS_QUERY));
  assert.equal(/\bmutation\b/i.test(JOBBER_JOB_VISITS_QUERY), false);

  assert.deepEqual(observation.job, {
    source_system: 'jobber',
    source_object_type: 'job',
    source_id: jobId,
    source_status: 'ACTIVE',
    observed_at: '2026-08-15T23:00:00.000Z'
  });
  assert.equal(observation.api_version, '2025-04-16');
  assert.deepEqual(
    observation.visits.map((visit) => [visit.source_id, visit.source_status, visit.start_at, visit.end_at]),
    [
      ['visit-1', 'UPCOMING', '2026-08-20T16:00:00Z', '2026-08-20T17:00:00Z'],
      ['visit-2', 'UNSCHEDULED', null, null]
    ]
  );
});
