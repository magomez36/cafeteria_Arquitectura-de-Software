# Staging revert drill

**Status: blocked on an owner-provisioned staging environment and deployment workflow.** No commit revert has been sent to staging.

When available, select a non-destructive platform or UI change, integrate the revert through a normal reviewed PR, keep the already-applied schema, and use a compensating migration only if required. Record candidate and revert SHAs, required checks, deployment artifact digests, smoke result, human intervention, and elapsed time. Repeat with a representative migration-compatible change and confirm the chosen commit reaches healthy staging without manual deployment. Do not test this against production or delete database volumes.
