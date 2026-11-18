# Release rollback runbook

This is an operating procedure draft. No production rollback has been executed.

1. Stop further releases through the serialized production workflow; preserve the failing release SHA, artifact digests, workflow URL and timestamps.
2. Inspect whether failure is application or schema related. A failed predeploy must stop before activating any new backend; keep the previous API, worker and web artifacts available.
3. Restore the prior API/worker image digest and prior Vercel prebuilt deployment by immutable deployment IDs/digests; do not rebuild from a tag such as `latest`.
4. Run `/health` and a production smoke check using approved, non-mutating probes. Confirm the prior release is healthy and record `rollbackOf` against the failed deployment ID.
5. Notify the authorized release channel with the SHA, failed check, restored artifact IDs and elapsed time. Avoid customer PII and secrets in the incident record.
6. If a migration was already applied, do not run a destructive down migration; prepare a forward compensating migration that remains compatible with the restored version.
7. Preserve the previous artifacts until the incident review and retention period end.

The local rollout tests verify the previous baseline, migrate before switching, activate API and worker before web, and restore attempted components by immutable reference in reverse order on a failed smoke check. The PostgreSQL E2E additionally tests transactional cleanup of a failed migration while the prior API remains healthy. A provider adapter must wait for deployment completion and verify which digest or Vercel deployment is live before reporting success. T048/T050 still need those adapters, approved environments, timed smoke and rollback evidence, and the release job and notification path.
