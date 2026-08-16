import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  jobberVisitToOccurrence,
  observeJobberVisit,
  type JobberVisitGraphqlNode
} from '../src/jobber-occurrence.ts';
import {
  DEFAULT_JOBBER_GRAPHQL_VERSION,
  JOBBER_GRAPHQL_ENDPOINT,
  jobberGraphql
} from '../src/jobber-graphql.ts';

type Fixture = {
  data: {
    job: {
      id: string;
      jobStatus: string;
      visits: {
        nodes: JobberVisitGraphqlNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        totalCount: number;
      };
    };
  };
  extensions: {
    versioning: { version: string };
  };
};

function fixture(): Fixture {
  return JSON.parse(
    readFileSync(resolve('fixtures/jobber/occurrence-response.example.json'), 'utf8')
  ) as Fixture;
}

const observedAt = '2026-08-15T23:00:00.000Z';

test('maps Jobber Visit identity, parent, schedule and source status into OccurrenceObservation', () => {
  const source = fixture();
  const visit = observeJobberVisit(source.data.job.visits.nodes[0], observedAt);
  const occurrence = jobberVisitToOccurrence(visit);

  assert.equal(occurrence.source_system, 'jobber');
  assert.equal(occurrence.source_object_type, 'visit');
  assert.equal(occurrence.source_id, source.data.job.visits.nodes[0].id);
  assert.equal(occurrence.source_status, 'UPCOMING');
  assert.deepEqual(occurrence.parent_ref, {
    source_object_type: 'job',
    source_id: source.data.job.id
  });
  assert.deepEqual(occurrence.scheduled_window, {
    start: '2026-08-20T16:00:00Z',
    end: '2026-08-20T17:30:00Z',
    arrival_window_start: '2026-08-20T15:30:00Z',
    arrival_window_end: '2026-08-20T16:30:00Z'
  });
});

test('preserves an unscheduled Jobber Visit as a null schedule instead of inventing timing', () => {
  const visit = fixture().data.job.visits.nodes.find((candidate) => candidate.visitStatus === 'UNSCHEDULED');
  assert.ok(visit);

  const observation = observeJobberVisit(visit, observedAt);
  const occurrence = jobberVisitToOccurrence(observation);

  assert.equal(observation.start_at, null);
  assert.equal(observation.end_at, null);
  assert.equal(occurrence.source_status, 'UNSCHEDULED');
  assert.deepEqual(occurrence.scheduled_window, {
    start: null,
    end: null,
    arrival_window_start: null,
    arrival_window_end: null
  });
});

test('keeps completion and client confirmation source-native rather than promoting them into occurrence semantics', () => {
  const source = fixture();
  const visit = source.data.job.visits.nodes.find((candidate) => candidate.visitStatus === 'COMPLETED');
  assert.ok(visit);

  const observation = observeJobberVisit(visit, observedAt);
  const occurrence = jobberVisitToOccurrence(observation);

  assert.equal(observation.is_complete, true);
  assert.equal(observation.completed_at, '2026-08-10T18:52:00Z');
  assert.equal(observation.completed_by, 'Synthetic Technician');
  assert.equal(observation.client_confirmed, true);
  assert.equal(observation.job.source_status, 'ACTIVE');
  assert.equal(occurrence.source_status, 'COMPLETED');

  assert.equal('is_complete' in occurrence, false);
  assert.equal('completed_at' in occurrence, false);
  assert.equal('client_confirmed' in occurrence, false);
});

test('preserves multiple Visit identities beneath one Job without conflating them', () => {
  const source = fixture();
  const occurrences = source.data.job.visits.nodes.map((node) =>
    jobberVisitToOccurrence(observeJobberVisit(node, observedAt))
  );

  assert.equal(occurrences.length, 3);
  assert.equal(new Set(occurrences.map((occurrence) => occurrence.source_id)).size, 3);
  assert.ok(occurrences.every((occurrence) => occurrence.parent_ref.source_id === source.data.job.id));
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.source_status),
    ['UPCOMING', 'UNSCHEDULED', 'COMPLETED']
  );
});

test('fixture pins the active Jobber API version used by the experiment', () => {
  assert.equal(fixture().extensions.versioning.version, DEFAULT_JOBBER_GRAPHQL_VERSION);
});

test('Jobber GraphQL helper sends only the required read-request headers and version pin', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const fakeFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({ data: { account: { id: 'account-1', name: 'Synthetic' } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const result = await jobberGraphql<{ account: { id: string; name: string } }>({
    accessToken: 'test-token-never-sent',
    query: 'query AccountIdentity { account { id name } }',
    fetchImpl: fakeFetch
  });

  assert.equal(capturedUrl, JOBBER_GRAPHQL_ENDPOINT);
  assert.equal(capturedInit?.method, 'POST');

  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer test-token-never-sent');
  assert.equal(headers['X-JOBBER-GRAPHQL-VERSION'], DEFAULT_JOBBER_GRAPHQL_VERSION);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(result.data?.account.id, 'account-1');
});
