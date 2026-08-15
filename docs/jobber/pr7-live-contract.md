# PR #7 — Jobber live read-only occurrence contract

## Purpose

Test the existing `OccurrenceObservation` vocabulary against a real external operational API without changing the canonical workflow schema.

The experiment treats Jobber as authoritative for its Job/Visit state. The adapter reads Jobber, preserves source-native facts, and projects only the already-earned occurrence fields.

## Version pin

The implementation pins Jobber GraphQL API version `2025-04-16` by default. Jobber requires the `X-JOBBER-GRAPHQL-VERSION` header on every request. The live test also checks the version reported under the response `extensions.versioning.version` field.

## Minimal live setup

Use a Jobber developer/test account and a Draft app with read access to the objects needed for Jobs and Visits.

For the first experiment, use a temporary testing access token from Jobber's official GraphiQL flow rather than implementing production OAuth/token refresh.

Run locally:

```bash
JOBBER_ACCESS_TOKEN='...' \
JOBBER_JOB_ID='...' \
npm run test:jobber-live
```

Optional override:

```bash
JOBBER_GRAPHQL_VERSION='2025-04-16'
```

Never commit an access token, authorization code, client secret, refresh token, or real customer data.

## Seed data required for the live falsification

Use synthetic/test-account data only. The target Job should contain at minimum:

1. two distinct Visits;
2. one unscheduled Visit with `startAt = null` and `endAt = null`;
3. at least one completed Visit;
4. at least one incomplete Visit;
5. preferably one Visit with an arrival window distinct from its exact start/end.

PR #7 itself remains read-only. Seed through the Jobber test UI rather than adding mutations to this repository.

## Query

The implementation deliberately reads one Job rather than deeply nesting Visits beneath a list of Jobs.

```graphql
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
```

The adapter paginates until every Visit reported by `totalCount` has been observed.

## Mapping invariant

Mapped into `OccurrenceObservation`:

- Jobber `Visit.id` -> `source_id`
- `Visit.visitStatus` -> `source_status` verbatim
- Jobber Visit -> `source_object_type = "visit"`
- `Visit.job.id` -> `parent_ref.source_id`
- `Visit.startAt/endAt` -> scheduled window, preserving null
- arrival-window bounds -> arrival-window bounds, preserving null

Deliberately not promoted into generic semantics:

- `isComplete`
- `completedAt`
- `completedBy`
- `clientConfirmed`
- parent Job status

Those remain source-native observations because provider completion, whole-Job completion, scheduling confirmation, customer economic authorization, and customer acceptance are different facts.

## Falsification rule

`OccurrenceObservation` survives this gate only if a real Jobber Visit can be represented without inventing normalized status meanings, synthetic schedules, canonical IDs, or customer/completion semantics.

The canonical workflow schema remains unchanged in PR #7 regardless of the outcome.
