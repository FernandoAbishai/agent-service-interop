export const JOBBER_GRAPHQL_ENDPOINT = 'https://api.getjobber.com/api/graphql';
export const DEFAULT_JOBBER_GRAPHQL_VERSION = '2025-04-16';

export type JobberGraphqlError = {
  message: string;
  extensions?: Record<string, unknown>;
};

export type JobberGraphqlResponse<T> = {
  data?: T;
  errors?: JobberGraphqlError[];
  extensions?: {
    versioning?: {
      version?: string;
      warning?: string;
    };
    [key: string]: unknown;
  };
};

export class JobberApiError extends Error {
  readonly status: number;
  readonly graphqlErrors: JobberGraphqlError[];

  constructor(message: string, status: number, graphqlErrors: JobberGraphqlError[] = []) {
    super(message);
    this.name = 'JobberApiError';
    this.status = status;
    this.graphqlErrors = graphqlErrors;
  }
}

export async function jobberGraphql<T>(options: {
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
  version?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}): Promise<JobberGraphqlResponse<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.endpoint ?? JOBBER_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'X-JOBBER-GRAPHQL-VERSION': options.version ?? DEFAULT_JOBBER_GRAPHQL_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: options.query,
      variables: options.variables ?? {}
    })
  });

  let body: JobberGraphqlResponse<T>;
  try {
    body = (await response.json()) as JobberGraphqlResponse<T>;
  } catch {
    throw new JobberApiError(`Jobber returned non-JSON HTTP ${response.status}`, response.status);
  }

  if (!response.ok) {
    throw new JobberApiError(
      `Jobber GraphQL request failed with HTTP ${response.status}`,
      response.status,
      body.errors ?? []
    );
  }

  if (body.errors?.length) {
    throw new JobberApiError(
      `Jobber GraphQL returned ${body.errors.length} error(s): ${body.errors.map((error) => error.message).join('; ')}`,
      response.status,
      body.errors
    );
  }

  return body;
}
