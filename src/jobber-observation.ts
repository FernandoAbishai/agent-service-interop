import { jobberGraphql } from './jobber-graphql.ts';
import {
  observeJobberVisit,
  type JobberVisitGraphqlNode,
  type JobberVisitObservation
} from './jobber-occurrence.ts';

export const JOBBER_JOB_VISITS_QUERY = `
  query JobWithVisits($jobId: EncodedId!, $first: Int!, $after: String) {
    job(id: $jobId) {
      id
      jobStatus
      visits(first: $first, after: $after) {
        nodes {
          id
          visitStatus
          startAt
          endAt
          arrivalWindow {
            startAt
            endAt
          }
          isComplete
          completedAt
          completedBy
          clientConfirmed
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

type JobWithVisitsResponse = {
  job: {
    id: string;
    jobStatus: string;
    visits: {
      nodes: Array<Omit<JobberVisitGraphqlNode, 'job'>>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      totalCount: number;
    };
  } | null;
};

export type JobberJobObservation = {
  source_system: 'jobber';
  source_object_type: 'job';
  source_id: string;
  source_status: string;
  observed_at: string;
};

export type JobberJobVisitsObservation = {
  job: JobberJobObservation;
  visits: JobberVisitObservation[];
  api_version: string | null;
};

/**
 * Reads every Visit for one Job through Jobber's GraphQL API and preserves the
 * source-native boundary before any Occurrence projection. This function is
 * intentionally read-only and pagination-aware; it contains no mutations,
 * OAuth storage, refresh-token handling, or canonical writes.
 */
export async function observeJobberJobVisits(options: {
  accessToken: string;
  jobId: string;
  observedAt?: string;
  pageSize?: number;
  version?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}): Promise<JobberJobVisitsObservation> {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const pageSize = options.pageSize ?? 50;
  let after: string | null = null;
  let expectedTotal: number | null = null;
  let parent: { id: string; jobStatus: string } | null = null;
  let apiVersion: string | null = null;
  const visits: JobberVisitObservation[] = [];

  for (;;) {
    const response = await jobberGraphql<JobWithVisitsResponse>({
      accessToken: options.accessToken,
      query: JOBBER_JOB_VISITS_QUERY,
      variables: {
        jobId: options.jobId,
        first: pageSize,
        after
      },
      version: options.version,
      endpoint: options.endpoint,
      fetchImpl: options.fetchImpl
    });

    const job = response.data?.job;
    if (!job) {
      throw new Error(`Jobber job not found or not visible to the current app: ${options.jobId}`);
    }

    if (parent && (parent.id !== job.id || parent.jobStatus !== job.jobStatus)) {
      throw new Error(`Jobber parent Job changed while Visits were being paginated: ${options.jobId}`);
    }

    parent = { id: job.id, jobStatus: job.jobStatus };
    apiVersion = response.extensions?.versioning?.version ?? apiVersion;
    expectedTotal = job.visits.totalCount;

    for (const visit of job.visits.nodes) {
      visits.push(
        observeJobberVisit(
          {
            ...visit,
            job: {
              id: job.id,
              jobStatus: job.jobStatus
            }
          },
          observedAt
        )
      );
    }

    if (!job.visits.pageInfo.hasNextPage) break;
    if (!job.visits.pageInfo.endCursor) {
      throw new Error('Jobber reported another Visit page without an endCursor');
    }
    after = job.visits.pageInfo.endCursor;
  }

  if (!parent) throw new Error(`Jobber job not found: ${options.jobId}`);
  if (expectedTotal !== null && visits.length !== expectedTotal) {
    throw new Error(`Jobber Visit pagination mismatch: expected ${expectedTotal}, observed ${visits.length}`);
  }

  return {
    job: {
      source_system: 'jobber',
      source_object_type: 'job',
      source_id: parent.id,
      source_status: parent.jobStatus,
      observed_at: observedAt
    },
    visits,
    api_version: apiVersion
  };
}
