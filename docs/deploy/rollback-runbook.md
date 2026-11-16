# Release rollback runbook

This is an operating procedure draft. No production rollback has been executed.

1. Stop further releases through the serialized production workflow; preserve the failing release SHA, artifact digests, workflow URL and timestamps.
2. Inspect whether failure is application or schema related. A failed predeploy must stop before activating any new backend; keep the previous API, worker and web artifacts available.
3. Restore the prior API/worker image digest and prior Vercel prebuilt deployment by immutable deployment IDs/digests; do not rebuild from a tag such as `latest`.
4. Run `/health` and a production smoke check using approved, non-mutating probes. Confirm the prior release is healthy and record `rollbackOf` against the failed deployment ID.
5. Notify the authorized release channel with the SHA, failed check, restored artifact IDs and elapsed time. Avoid customer PII and secrets in the incident record.
6. If a migration was already applied, do not run a destructive down migration; prepare a forward compensating migration that remains compatible with the restored version.
7. Preserve the previous artifacts until the incident review and retention period end.

Before using this runbook, T048/T050 need a provider-backed release/rollback workflow and staging/production dry-run evidence. Do not execute production actions from a developer workstation.
