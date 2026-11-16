# Dependency audit policy

The required PR workflow runs `pnpm audit --audit-level=high` against the frozen lockfile. Any high or critical advisory fails the workflow; lower-severity findings remain visible in the audit output and are tracked rather than silently ignored.

`pnpm-workspace.yaml` contains pnpm overrides for transitive package ranges with known patched versions. They were added after the Vercel CLI dependency tree introduced high/critical advisories and `pnpm audit --fix` supplied compatible patched ranges. The current local audit on 2026-11-15 reports one low advisory and no high or critical advisories. The overrides do not change severity thresholds. Review and remove an override only after the upstream dependency range resolves to a patched version and a fresh frozen install, test suite, and audit pass.

Do not add audit suppressions, ignored advisories, or an exception to the CI severity threshold to get a green result.
