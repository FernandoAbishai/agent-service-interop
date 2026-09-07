import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_JOBBER_GRAPHQL_VERSION } from '../../src/jobber-graphql.ts';
import {
  assessJobberQuoteRequestAssociation,
  observeJobberQuote,
  observeJobberQuoteMoneySchema
} from '../../src/jobber-quote-observation.ts';

const enabled = process.env.JOBBER_QUOTE_LIVE === '1';

test(
  'live Jobber Quote preserves authoritative source facts and native Request association without mutation',
  { skip: !enabled },
  async () => {
    const accessToken = process.env.JOBBER_ACCESS_TOKEN;
    const quoteId = process.env.JOBBER_QUOTE_ID;
    assert.ok(accessToken, 'JOBBER_ACCESS_TOKEN is required when JOBBER_QUOTE_LIVE=1');
    assert.ok(quoteId, 'JOBBER_QUOTE_ID is required when JOBBER_QUOTE_LIVE=1');

    const requestedVersion = process.env.JOBBER_GRAPHQL_VERSION ?? DEFAULT_JOBBER_GRAPHQL_VERSION;
    const observation = await observeJobberQuote({
      accessToken,
      quoteId,
      version: requestedVersion
    });

    assert.equal(observation.api_version, requestedVersion);
    assert.equal(observation.source_system, 'jobber');
    assert.equal(observation.source_object_type, 'quote');
    assert.equal(observation.source_id, quoteId);
    assert.ok(observation.source_status.length > 0);
    const mapped = assessJobberQuoteRequestAssociation(observation);
    if (observation.request_ref) {
      assert.equal(mapped.blocking_reasons.length, 0);
      assert.equal(mapped.source_request_association?.source_id, quoteId);
      assert.equal(mapped.source_request_association?.relation, 'associated_request');
      assert.equal(mapped.source_request_association?.request_ref.source_id, observation.request_ref.source_id);
      assert.equal('request_source' in (mapped.source_request_association ?? {}), false);
    } else {
      assert.equal(mapped.source_request_association, null);
      assert.deepEqual(mapped.blocking_reasons, ['jobber_quote_has_no_source_request_association']);
    }

    const monetarySchema = await observeJobberQuoteMoneySchema({
      accessToken,
      version: requestedVersion
    });
    assert.equal(monetarySchema.api_version, requestedVersion);
    assert.equal(monetarySchema.exact_money_assessment.normalized_exact_value, null);
    assert.ok(monetarySchema.types.some((type) => type.type_name === 'QuoteAmounts'));
  }
);
