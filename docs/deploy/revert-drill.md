# Staging revert drill

**Status: blocked on an owner-provisioned staging environment and deployment workflow.** No commit revert has been sent to staging.

`Staging revert rehearsal` can run on the default branch after setting `REVERT_DRILL_SHA` to an already merged, single-parent application-only commit. It creates the patch in a temporary clone, refuses migrations and workflow changes, and runs lint, typecheck, tests and build in the runner checkout. The scheduled rehearsal has read-only permissions. The local policy suite covers the patch and verifies the source checkout and migration files are preserved.

When available, select a non-destructive platform or UI change, integrate the revert through a normal reviewed PR, keep the already-applied schema, and use a compensating migration only if required. Record candidate and revert SHAs, required checks, deployment artifact digests, smoke result, human intervention, and elapsed time. Repeat with a representative migration-compatible change and confirm the chosen commit reaches healthy staging without manual deployment. Do not test this against production or delete database volumes.
