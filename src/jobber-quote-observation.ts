import { jobberGraphql } from './jobber-graphql.ts';

export const JOBBER_QUOTE_EVIDENCE_QUERY = `
  query QuoteEvidence($quoteId: EncodedId!, $first: Int!, $after: String) {
    quote(id: $quoteId) {
      id
      quoteStatus
      createdAt
      updatedAt
      transitionedAt
      sentAt
      request {
        id
      }
      jobs(first: $first, after: $after) {
        nodes {
          id
        }
        pageInfo {
          hasNextPage
          endCursor
        }
        totalCount
      }
    }
  }
`;

type JobberQuoteGraphqlNode = {
  id: string;
  quoteStatus: string;
  createdAt: string;
  updatedAt: string;
  transitionedAt: string;
  sentAt: string | null;
  request: { id: string } | null;
  jobs: {
    nodes: Array<{ id: string }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    totalCount: number;
  } | null;
};

type JobberQuoteResponse = {
  quote: JobberQuoteGraphqlNode | null;
};

export type JobberQuoteObservation = {
  source_system: 'jobber';
  source_object_type: 'quote';
  source_id: string;
  source_status: string;
  observed_at: string;
  created_at: string;
  updated_at: string;
  transitioned_at: string;
  sent_at: string | null;
  request_ref: {
    source_object_type: 'request';
    source_id: string;
  } | null;
  job_refs: Array<{
    source_object_type: 'job';
    source_id: string;
  }>;
  api_version: string | null;
};

type GraphqlTypeRef = {
  kind: string;
  name: string | null;
  ofType: GraphqlTypeRef | null;
};

type GraphqlFieldIntrospection = {
  name: string;
  type: GraphqlTypeRef;
};

type GraphqlTypeIntrospection = {
  name: string;
  fields: GraphqlFieldIntrospection[] | null;
} | null;

type JobberQuoteMoneySchemaResponse = {
  quoteType: GraphqlTypeIntrospection;
  quoteAmountsType: GraphqlTypeIntrospection;
  quoteLineItemType: GraphqlTypeIntrospection;
};

export const JOBBER_QUOTE_MONEY_SCHEMA_QUERY = `
  query QuoteMoneySchema {
    quoteType: __type(name: "Quote") {
      name
      fields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
    quoteAmountsType: __type(name: "QuoteAmounts") {
      name
      fields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
    quoteLineItemType: __type(name: "QuoteLineItem") {
      name
      fields {
        name
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
`;

export type JobberQuoteMoneySchemaObservation = {
  source_system: 'jobber';
  observed_at: string;
  api_version: string | null;
  types: Array<{
    type_name: 'Quote' | 'QuoteAmounts' | 'QuoteLineItem';
    fields: Array<{
      name: string;
      graphql_named_type: string | null;
      graphql_type_shape: GraphqlTypeRef;
    }>;
  }>;
  exact_money_assessment: {
    normalized_exact_value: null;
    quote_related_float_fields: Array<{ type_name: string; field_name: string }>;
    blocking_reasons: string[];
  };
};

function sameQuotePage(left: JobberQuoteGraphqlNode, right: JobberQuoteGraphqlNode): boolean {
  return (
    left.id === right.id &&
    left.quoteStatus === right.quoteStatus &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.transitionedAt === right.transitionedAt &&
    left.sentAt === right.sentAt &&
    left.request?.id === right.request?.id
  );
}

/**
 * Reads one Jobber Quote and all converted Job references without mutations.
 *
 * This is intentionally an authority-preserving source observation. Quote
 * lifecycle, acceptance, money, taxes, line-item meaning, booking, and work
 * authorization are not normalized here.
 */
export async function observeJobberQuote(options: {
  accessToken: string;
  quoteId: string;
  observedAt?: string;
  pageSize?: number;
  version?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}): Promise<JobberQuoteObservation> {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const pageSize = options.pageSize ?? 50;
  let after: string | null = null;
  let quoteSnapshot: JobberQuoteGraphqlNode | null = null;
  let expectedTotal: number | null = null;
  let apiVersion: string | null = null;
  const jobIds: string[] = [];

  for (;;) {
    const response = await jobberGraphql<JobberQuoteResponse>({
      accessToken: options.accessToken,
      query: JOBBER_QUOTE_EVIDENCE_QUERY,
      variables: {
        quoteId: options.quoteId,
        first: pageSize,
        after
      },
      version: options.version,
      endpoint: options.endpoint,
      fetchImpl: options.fetchImpl
    });

    const quote = response.data?.quote;
    if (!quote) {
      throw new Error(`Jobber quote not found or not visible to the current app: ${options.quoteId}`);
    }

    if (quoteSnapshot && !sameQuotePage(quoteSnapshot, quote)) {
      throw new Error(`Jobber Quote changed while converted Job references were being paginated: ${options.quoteId}`);
    }
    quoteSnapshot ??= quote;
    const responseApiVersion = response.extensions?.versioning?.version ?? null;
    if (apiVersion !== null && responseApiVersion !== null && apiVersion !== responseApiVersion) {
      throw new Error(`Jobber API version changed while Quote was being paginated: ${options.quoteId}`);
    }
    apiVersion = responseApiVersion ?? apiVersion;

    if (!quote.jobs) {
      if (after !== null || expectedTotal !== null) {
        throw new Error(`Jobber Quote Job connection changed while being paginated: ${options.quoteId}`);
      }
      break;
    }
    if (expectedTotal === null) {
      expectedTotal = quote.jobs.totalCount;
    } else if (expectedTotal !== quote.jobs.totalCount) {
      throw new Error(`Jobber Quote Job totalCount changed while being paginated: ${options.quoteId}`);
    }
    for (const job of quote.jobs.nodes) jobIds.push(job.id);

    if (!quote.jobs.pageInfo.hasNextPage) break;
    if (!quote.jobs.pageInfo.endCursor) {
      throw new Error('Jobber reported another Quote Job page without an endCursor');
    }
    after = quote.jobs.pageInfo.endCursor;
  }

  if (!quoteSnapshot) throw new Error(`Jobber quote not found: ${options.quoteId}`);
  if (expectedTotal !== null && jobIds.length !== expectedTotal) {
    throw new Error(`Jobber Quote Job pagination mismatch: expected ${expectedTotal}, observed ${jobIds.length}`);
  }
  if (new Set(jobIds).size !== jobIds.length) {
    throw new Error(`Jobber Quote returned duplicate converted Job references: ${options.quoteId}`);
  }

  return {
    source_system: 'jobber',
    source_object_type: 'quote',
    source_id: quoteSnapshot.id,
    source_status: quoteSnapshot.quoteStatus,
    observed_at: observedAt,
    created_at: quoteSnapshot.createdAt,
    updated_at: quoteSnapshot.updatedAt,
    transitioned_at: quoteSnapshot.transitionedAt,
    sent_at: quoteSnapshot.sentAt,
    request_ref: quoteSnapshot.request
      ? {
          source_object_type: 'request',
          source_id: quoteSnapshot.request.id
        }
      : null,
    job_refs: jobIds.map((sourceId) => ({
      source_object_type: 'job' as const,
      source_id: sourceId
    })),
    api_version: apiVersion
  };
}

/**
 * Preserves Jobber's native Quote -> Request association without assigning a
 * stronger responds-to direction that the current source documentation does
 * not establish. A later evidence gate may compare this association with the
 * earned OfferResponseObservation, but this function does not claim that
 * equivalence.
 */
export function assessJobberQuoteRequestAssociation(
  quote: JobberQuoteObservation
): {
  source_request_association: {
    source_system: 'jobber';
    source_object_type: 'quote';
    source_id: string;
    observed_at: string;
    relation: 'associated_request';
    request_ref: { source_object_type: 'request'; source_id: string };
    unmapped_source_fields: string[];
  } | null;
  blocking_reasons: string[];
} {
  if (!quote.request_ref) {
    return {
      source_request_association: null,
      blocking_reasons: ['jobber_quote_has_no_source_request_association']
    };
  }

  return {
    source_request_association: {
      source_system: 'jobber',
      source_object_type: 'quote',
      source_id: quote.source_id,
      observed_at: quote.observed_at,
      relation: 'associated_request',
      request_ref: quote.request_ref,
      unmapped_source_fields: [
        'quote_status',
        'created_at',
        'updated_at',
        'transitioned_at',
        ...(quote.sent_at ? ['sent_at'] : []),
        ...(quote.job_refs.length ? ['job_refs'] : [])
      ]
    },
    blocking_reasons: []
  };
}

function namedType(ref: GraphqlTypeRef | null): string | null {
  let current = ref;
  while (current) {
    if (current.name) return current.name;
    current = current.ofType;
  }
  return null;
}

/**
 * Introspects the current authorized Jobber schema instead of guessing money
 * fields from stale examples. This contains no customer/account object data.
 */
export async function observeJobberQuoteMoneySchema(options: {
  accessToken: string;
  observedAt?: string;
  version?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}): Promise<JobberQuoteMoneySchemaObservation> {
  const response = await jobberGraphql<JobberQuoteMoneySchemaResponse>({
    accessToken: options.accessToken,
    query: JOBBER_QUOTE_MONEY_SCHEMA_QUERY,
    version: options.version,
    endpoint: options.endpoint,
    fetchImpl: options.fetchImpl
  });

  const expected = [
    ['Quote', response.data?.quoteType],
    ['QuoteAmounts', response.data?.quoteAmountsType],
    ['QuoteLineItem', response.data?.quoteLineItemType]
  ] as const;
  const types = expected.map(([typeName, type]) => {
    if (!type || !type.fields) throw new Error(`Jobber GraphQL introspection did not expose ${typeName}`);
    return {
      type_name: typeName,
      fields: type.fields.map((field) => ({
        name: field.name,
        graphql_named_type: namedType(field.type),
        graphql_type_shape: field.type
      }))
    };
  });

  const floatFields = types.flatMap((type) =>
    type.fields
      .filter((field) => field.graphql_named_type === 'Float')
      .map((field) => ({ type_name: type.type_name, field_name: field.name }))
  );

  return {
    source_system: 'jobber',
    observed_at: options.observedAt ?? new Date().toISOString(),
    api_version: response.extensions?.versioning?.version ?? null,
    types,
    exact_money_assessment: {
      normalized_exact_value: null,
      quote_related_float_fields: floatFields,
      blocking_reasons: [
        ...(floatFields.length ? ['graphql_float_fields_require_field_specific_semantic_review_before_exact_money_use'] : []),
        'currency_asset_and_scale_must_be_grounded_per_source_field_before_exact_normalization',
        'schema_introspection_alone_does_not_identify_decision_critical_monetary_fields'
      ]
    }
  };
}
