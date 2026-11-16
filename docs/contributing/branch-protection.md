# `main` branch protection

## Required repository rules

The repository administrator must protect `main` with these settings:

- Require a pull request before merging, with at least one approving review.
- Dismiss stale approvals when new commits are pushed; require approval of the most recent reviewable push when available.
- Require all conversations to be resolved.
- Require the stable checks `quality`, `security / codeql`, `security / dependency-audit`, `security / secret-scan`, `images`, and `pr-report`.
- Require branches to be up to date before merging and require linear history.
- Block force pushes and branch deletion; do not grant bypass to normal contributors.
- Keep `feature/spec-1` as the only active implementation branch until the platform baseline is accepted; create module branches from the merged baseline only after the leader's integration decision.

## Activation and verification

Activation is external and requires repository administrator access. In GitHub, open **Settings → Rules → Rulesets** (or **Branches → Add branch protection rule**), target `main`, enable the requirements above, and select the check names from a successful PR run. GitHub may only offer a check after it has appeared once; do not guess a different status name. If GitHub presents security checks with a different stable display name, record that exact name and update this document and `scripts/ci/workflow-policy.spec.ts` together in one reviewed change.

After saving, verify through a disposable test PR that a direct push is rejected, an unapproved PR cannot merge, a failed required check blocks merge, and a linear-history merge succeeds. Do not use the open Draft PR as a destructive test. Remote rules are not yet confirmed from this workspace and remain pending until the administrator records the settings and test evidence here.
