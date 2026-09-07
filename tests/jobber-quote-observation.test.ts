import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOBBER_QUOTE_EVIDENCE_QUERY,
  JOBBER_QUOTE_MONEY_SCHEMA_QUERY,
  assessJobberQuoteRequestAssociation,
  observeJobberQuote,
  observeJobberQuoteMoneySchema
} from '../src/jobber-quote-observation.ts';

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function quotePage(options: {
  jobs: string[];
  hasNextPage: boolean;
  endCursor: string | null;
  totalCount: number;
  requestId?: string | null;
  status?: string;
  jobsNull?: boolean;
}) {
  return {
    data: {
      quote: {
        id: 'jobber-quote-1',
        quoteStatus: options.status ?? 'SOURCE_NATIVE_STATUS',
        createdAt: '2026-09-07T15:00:00Z',
        updatedAt: '2026-09-07T15:30:00Z',
        transitionedAt: '2026-09-07T15:20:00Z',
        sentAt: '2026-09-07T15:10:00Z',
        request: options.requestId === null ? null : { id: options.requestId ?? 'jobber-request-1' },
        jobs: options.jobsNull
          ? null
          : {
              nodes: options.jobs.map((id) => ({ id })),
              pageInfo: {
                hasNextPage: options.hasNextPage,
                endCursor: options.endCursor
              },
              totalCount: options.totalCount
            }
      }
    },
    extensions: { versioning: { version: '2025-04-16' } }
  };
}

test('reads a Jobber Quote read-only, paginates converted Jobs, and preserves source-native facts', async () => {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    const parsed = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    calls.push(parsed);
    return response(
      calls.length === 1
        ? quotePage({ jobs: ['job-1'], hasNextPage: true, endCursor: 'cursor-1', totalCount: 2 })
        : quotePage({ jobs: ['job-2'], hasNextPage: false, endCursor: null, totalCount: 2 })
    );
  };

  const observation = await observeJobberQuote({
    accessToken: 'local-test-token',
    quoteId: 'jobber-quote-1',
    observedAt: '2026-09-07T16:00:00Z',
    pageSize: 1,
    fetchImpl: fakeFetch
  });

  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.query === JOBBER_QUOTE_EVIDENCE_QUERY));
  assert.equal(/\bmutation\b/i.test(JOBBER_QUOTE_EVIDENCE_QUERY), false);
  for (const forbidden of ['client', 'property', 'message', 'notes', 'amounts', 'lineItems', 'taxDetails', 'deposit', 'currency', 'cost']) {
    assert.equal(JOBBER_QUOTE_EVIDENCE_QUERY.includes(forbidden), false, `${forbidden} must stay out of the minimal authority query`);
  }
  assert.equal(calls[0].variables.after, null);
  assert.equal(calls[1].variables.after, 'cursor-1');

  assert.equal(observation.source_id, 'jobber-quote-1');
  assert.equal(observation.source_status, 'SOURCE_NATIVE_STATUS');
  assert.equal(observation.request_ref?.source_id, 'jobber-request-1');
  assert.deepEqual(observation.job_refs.map((ref) => ref.source_id), ['job-1', 'job-2']);
  assert.equal(observation.api_version, '2025-04-16');
  assert.equal('client' in observation, false);
  assert.equal('property' in observation, false);
  assert.equal('message' in observation, false);
});

test('Jobber Request association is preserved without promoting it to a responds-to relation', async () => {
  const withRequest = await observeJobberQuote({
    accessToken: 'local-test-token',
    quoteId: 'jobber-quote-1',
    observedAt: '2026-09-07T16:00:00Z',
    fetchImpl: async () => response(quotePage({ jobs: [], hasNextPage: false, endCursor: null, totalCount: 0 }))
  });
  const withoutRequest = await observeJobberQuote({
    accessToken: 'local-test-token',
    quoteId: 'jobber-quote-1',
    observedAt: '2026-09-07T16:00:00Z',
    fetchImpl: async () =>
      response(quotePage({ jobs: ['job-1'], hasNextPage: false, endCursor: null, totalCount: 1, requestId: null }))
  });

  const mapped = assessJobberQuoteRequestAssociation(withRequest);
  const blocked = assessJobberQuoteRequestAssociation(withoutRequest);

  assert.equal(mapped.blocking_reasons.length, 0);
  assert.equal(mapped.source_request_association?.source_system, 'jobber');
  assert.equal(mapped.source_request_association?.source_object_type, 'quote');
  assert.equal(mapped.source_request_association?.relation, 'associated_request');
  assert.equal(mapped.source_request_association?.request_ref.source_object_type, 'request');
  assert.equal(mapped.source_request_association?.request_ref.source_id, 'jobber-request-1');
  assert.ok(mapped.source_request_association?.unmapped_source_fields.includes('quote_status'));
  assert.equal('request_source' in (mapped.source_request_association ?? {}), false);
  assert.equal('responds_to' in (mapped.source_request_association ?? {}), false);

  assert.equal(blocked.source_request_association, null);
  assert.deepEqual(blocked.blocking_reasons, ['jobber_quote_has_no_source_request_association']);
  assert.equal(withoutRequest.job_refs[0].source_id, 'job-1', 'Job relation must not substitute for Request relation');
});

test('nullable Jobber Quote jobs relation remains an empty reference set', async () => {
  const observation = await observeJobberQuote({
    accessToken: 'local-test-token',
    quoteId: 'jobber-quote-1',
    observedAt: '2026-09-07T16:00:00Z',
    fetchImpl: async () =>
      response(quotePage({ jobs: [], hasNextPage: false, endCursor: null, totalCount: 0, jobsNull: true }))
  });

  assert.deepEqual(observation.job_refs, []);
  assert.equal(observation.request_ref?.source_id, 'jobber-request-1');
});

test('current Jobber money schema is introspected instead of guessed and Float fields remain non-exact', async () => {
  const typeRef = (name: string) => ({ kind: 'SCALAR', name, ofType: null });
  const objectRef = (name: string) => ({ kind: 'NON_NULL', name: null, ofType: { kind: 'OBJECT', name, ofType: null } });
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string };
    assert.equal(body.query, JOBBER_QUOTE_MONEY_SCHEMA_QUERY);
    return response({
      data: {
        quoteType: {
          name: 'Quote',
          fields: [
            { name: 'amounts', type: objectRef('QuoteAmounts') },
            { name: 'cost', type: typeRef('Float') }
          ]
        },
        quoteAmountsType: {
          name: 'QuoteAmounts',
          fields: [
            { name: 'total', type: typeRef('Float') },
            { name: 'subtotal', type: typeRef('Float') }
          ]
        },
        quoteLineItemType: {
          name: 'QuoteLineItem',
          fields: [
            { name: 'quantity', type: typeRef('Float') },
            { name: 'name', type: typeRef('String') }
          ]
        }
      },
      extensions: { versioning: { version: '2025-04-16' } }
    });
  };

  const observation = await observeJobberQuoteMoneySchema({
    accessToken: 'local-test-token',
    observedAt: '2026-09-07T16:00:00Z',
    fetchImpl: fakeFetch
  });

  assert.equal(observation.api_version, '2025-04-16');
  assert.equal(observation.exact_money_assessment.normalized_exact_value, null);
  assert.deepEqual(observation.exact_money_assessment.quote_related_float_fields, [
    { type_name: 'Quote', field_name: 'cost' },
    { type_name: 'QuoteAmounts', field_name: 'total' },
    { type_name: 'QuoteAmounts', field_name: 'subtotal' },
    { type_name: 'QuoteLineItem', field_name: 'quantity' }
  ]);
  assert.ok(
    observation.exact_money_assessment.blocking_reasons.includes(
      'graphql_float_fields_require_field_specific_semantic_review_before_exact_money_use'
    )
  );
});

test('pagination fails closed if mutable Quote authority changes mid-read', async () => {
  let call = 0;
  const fakeFetch: typeof fetch = async () => {
    call += 1;
    return response(
      call === 1
        ? quotePage({ jobs: ['job-1'], hasNextPage: true, endCursor: 'cursor-1', totalCount: 2, status: 'STATUS_A' })
        : quotePage({ jobs: ['job-2'], hasNextPage: false, endCursor: null, totalCount: 2, status: 'STATUS_B' })
    );
  };

  await assert.rejects(
    observeJobberQuote({ accessToken: 'local-test-token', quoteId: 'jobber-quote-1', pageSize: 1, fetchImpl: fakeFetch }),
    /changed while converted Job references were being paginated/
  );
});

test('duplicate converted Job references fail closed instead of being silently deduplicated', async () => {
  const fakeFetch: typeof fetch = async () =>
    response(quotePage({ jobs: ['job-1', 'job-1'], hasNextPage: false, endCursor: null, totalCount: 2 }));

  await assert.rejects(
    observeJobberQuote({ accessToken: 'local-test-token', quoteId: 'jobber-quote-1', fetchImpl: fakeFetch }),
    /duplicate converted Job references/
  );
});

test('Job connection metadata cannot change silently across Quote pagination', async () => {
  let call = 0;
  const fakeFetch: typeof fetch = async () => {
    call += 1;
    return response(
      call === 1
        ? quotePage({ jobs: ['job-1'], hasNextPage: true, endCursor: 'cursor-1', totalCount: 3 })
        : quotePage({ jobs: ['job-2'], hasNextPage: false, endCursor: null, totalCount: 2 })
    );
  };

  await assert.rejects(
    observeJobberQuote({ accessToken: 'local-test-token', quoteId: 'jobber-quote-1', pageSize: 1, fetchImpl: fakeFetch }),
    /totalCount changed while being paginated/
  );
});
