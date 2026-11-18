# CI acceptance and baseline review

## Verified baseline

[PR #1](https://github.com/magomez36/cafeteria_Arquitectura-de-Software/pull/1), source SHA `341cc4a02cfd992f9a4b1566e556d8e92841ce3e`, passed [run 44004176940](https://github.com/magomez36/cafeteria_Arquitectura-de-Software/actions/runs/44004176940). The six workflow jobs `quality`, `security / codeql`, `security / dependency-audit`, `security / secret-scan`, `images` and `pr-report` concluded `success`.

- Commit-range validation: 28/28 commits passed in 737,744 ms. Each affected commit received its configured checks.
- Lint, typecheck, unit tests, API/worker Testcontainers integration tests, health smoke and build passed.
- Policy tests passed 67/67; Playwright/axe passed 4/4 on the initial page and `/health` contract.
- Sonar imported all seven LCOV reports and logged `QUALITY GATE STATUS: PASSED`. The native `SonarCloud Code Analysis` check succeeded on the same SHA.
- Sonar new-code metrics: coverage 81.5%, maintainability/reliability/security A, duplication 2.1%, reviewed security hotspots 100%. The public API returned no open bugs or vulnerabilities and no ignored gate conditions.
- Dependency audit, Gitleaks, CodeQL, image builds and API/worker Trivy scans passed. The verified image archive was retained as `verified-images-341cc4a02cfd992f9a4b1566e556d8e92841ce3e`, artifact ID `14294931410`.

The owner confirmed activation of `main` protection. On 2026-11-17 UTC, the public branch API independently returned `protected: true`, protection enabled, and required-check enforcement `everyone`. The exact required checks are `quality`, **`CodeQL`**, `security / dependency-audit`, `security / secret-scan`, `images`, and `pr-report`. `CodeQL` is the native check name; `security / codeql` is also a successful workflow job. See [branch-protection.md](../contributing/branch-protection.md) for the distinction and the remaining administrative verification.

This evidence supports technical review of the implemented local/CI baseline. It does not close all 69 Spec #1 tasks, approve a merge, verify a provider deployment, or replace a colleague's review. Every required check must pass again on the final documentation commit before review readiness is reported.

## Acceptance scenarios

| Scenario                                | Executed evidence                                                                                                                                                               | Remaining verification                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Valid PR                                | Run `44004176940`: all CI jobs and native Sonar check succeeded on `341cc4a`.                                                                                                   | Recheck the documentation commit's own SHA; obtain human review before merge.                                                                                                              |
| Invalid Conventional Commit             | Local commitlint tests exercise rejection.                                                                                                                                      | A deliberately invalid test PR has not been run.                                                                                                                                           |
| Broken intermediate commit              | The real 28-commit history passed per-commit checks.                                                                                                                            | A deliberately broken intermediate-commit PR has not been run.                                                                                                                             |
| Failing unit test                       | Positive unit suites passed; workflow propagates failures.                                                                                                                      | No recorded disposable PR with a deliberately failing unit test.                                                                                                                           |
| Insufficient coverage                   | Run `43975115316` on `093d270` calculated 79.2% coverage and failed solely on the 80% condition. `quality` and `pr-report` failed; run `44004176940` passed after adding tests. | This failure predates protection activation. A negative PR under the active rule has not been exercised.                                                                                   |
| Missing CI metadata                     | Five subprocess tests run real CLI entrypoints without required metadata; each exits 1 with a diagnostic. Policy suite passed 67/67 locally and remotely.                       | These tests do not replace the other negative PR scenarios.                                                                                                                                |
| Secret detected                         | Gitleaks successfully scanned the real PR history.                                                                                                                              | A synthetic secret fixture has not been tested in a disposable PR.                                                                                                                         |
| Blocking dependency/image vulnerability | Dependency audit and API/worker Trivy passed; high/critical thresholds stay enabled.                                                                                            | No disposable vulnerable dependency/image fixture has exercised remote blocking.                                                                                                           |
| Branch protection                       | Owner confirmation plus public API: protection enabled and six exact checks enforced for everyone. PR remains Draft with `mergeable_state: blocked`.                            | Administrative API returns 403. Approval count, linear history, bypass restrictions and negative experiments still need owner evidence. Draft/blocked alone does not prove those settings. |

T031 and T033 remain partial while their remaining enforcement evidence is missing; T034 remains open. No task is marked complete solely from a positive pipeline run or a partial view of protection settings.

## Timing and historical failures

The commit-range budget is 15 minutes for a typical PR of up to 10 commits, scaling by 15 minutes per further block of ten. All commits are still tested. Run `43968734209` exhausted the former 15-minute job timeout; `43971522418` passed all 26 commits but failed the former fixed duration guard. The corrected run `44004176940` passed 28 commits in 12m17s. This alone does not measure SC-001's complete set of controls for a typical PR.

Run `43917776461` calculated 23.0% new-code coverage with C security and D reliability. Later analyses confirmed the security/reliability fixes, and the `341cc4a` analysis passed. Historical failures are retained as evidence, not presented as the current state.

## Controlled negative test procedure

Negative experiments remain separate work. Use an owner-approved disposable test branch/PR; never introduce failing fixtures in `main`, `feature/spec-1`, a release tag or production. Use only synthetic non-secrets and known-vulnerable disposable fixtures excluded from production manifests. Capture SHA, check name, failed step, numeric Sonar gate where applicable, active protection and observed merge restriction. Clean up through normal reviewed changes without weakening checks. No such branch or experiment was created for this documentation closure.

## After merge and before full Spec #1 acceptance

1. Verify the rebase-preserved history and required checks on the integrated baseline; colleagues then create their module branches from the updated `main`.
2. Run the first default-branch workflows and verify Release Please, immutable GHCR promotion and telemetry where configured. A workflow file alone does not prove a successful execution.
3. Provision approved preview/staging resources and complete T037–T044: provider Git auto-deploy disabled, immutable artifact identity, migrations, smoke tests and measured merge-to-staging latency (SC-004).
4. Complete staging reversibility drills T055–T056, observability/ACL/alerts/load evidence T058–T065 and the full PR→staging→dashboard path T068 (SC-007–SC-009).
5. Perform NVDA/VoiceOver verification T067 before a release. Production tasks T047–T051 require approved environments and explicit release authorization; measure rollback and availability (SC-005/SC-006).

Some checks also require new implementation or external setup; they are not assumed to run automatically after merge. Preview and negative CI scenarios can run before merge once their prerequisites exist; they are not exclusively post-merge checks.
