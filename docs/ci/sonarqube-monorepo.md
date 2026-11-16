# SonarQube Cloud in the pnpm monorepo

## Repository configuration

The PR workflow generates six workspace LCOV reports with `pnpm coverage` and a seventh report for tested CI, deployment, migration-order, load-target, telemetry, and module-boundary utilities with `pnpm test:ci:coverage`. `sonar-project.properties` imports all seven reports. The pinned SonarSource scanner waits for the actual Quality Gate; missing credentials, missing reports, failed gates, and `not-computed` results fail the `quality` job.

The repository owner has configured the GitHub Actions secret `SONAR_TOKEN` and variables `SONAR_PROJECT_KEY` and `SONAR_ORGANIZATION`. Their values are intentionally not read or stored in this repository. Remaining remote checks are the `main` new-code reference, the exact Sonar gate configuration, and the Quality Gate result published for the current PR head.

## Required new-code conditions

- Coverage at least 80% for new code; at least 95% for new code in `promotions`, `orders`, and `payments` when those modules are introduced.
- Zero new bugs and zero new vulnerabilities.
- All new security hotspots reviewed.
- New-code duplication below 3%.
- A ratings for maintainability, reliability, and security.

SonarQube Cloud's built-in Sonar way gate covers 80% new-code coverage, A ratings/no new bugs or vulnerabilities, all new security hotspots reviewed, and duplication up to 3%. The strict project requirement is duplication **below** 3%; the administrator must ensure the configured condition enforces that strict bound. Module-specific 95% coverage must be checked by the gate or a separate required CI check when the module source exists; a global 80% condition does not satisfy it.

## Coverage reports

Run `pnpm coverage` and `pnpm test:ci:coverage` from the repository root. Expected reports:

- `apps/api/coverage/lcov.info`
- `apps/web/coverage/lcov.info`
- `apps/worker/coverage/lcov.info`
- `packages/contracts/coverage/lcov.info`
- `packages/feature-flags/coverage/lcov.info`
- `packages/ui/coverage/lcov.info`
- `coverage/scripts/lcov.info`

The latest local reports aggregate to 913 covered of 1129 instrumented lines (80.87%). This is a local LCOV aggregate, **not** a Sonar new-code measurement or Quality Gate result. Sonar's imported coverage and gate must be confirmed on the real PR head.

## Latest real PR evidence

Run `43917776461` (head `bd01bd9`) reached Sonar analysis and calculated a failed Quality Gate. Sonar reported 23.0% coverage on new code, C security rating, and D reliability rating; maintainability, duplication, and security-hotspot review passed. The workflow correctly failed `quality`, and `pr-report` correctly propagated that failure. The same run passed CodeQL, dependency audit, secret scan, and API/worker image builds and Trivy scans. Preview was skipped because PR #1 was Draft.

That analysis identified two default-sort bugs, permission-scope findings in CI/preview workflows, an unguarded `workflow_run` telemetry job, and Git executable resolution through `PATH`. The current local changes correct those findings and add executable coverage for policy scripts. They are not considered resolved by Sonar until a new pushed head has a successful analysis and computed gate.

## Monorepo PR acceptance experiment

1. Run a normal PR and inspect the Sonar analysis SHA, all seven LCOV imports, new-code metrics, and `quality` conclusion.
2. On a disposable branch, add a temporary production-source fixture whose coverage is below 80%; verify the Sonar Quality Gate and the GitHub `quality` check fail. Remove the fixture in a separate cleanup change.
3. Verify the GitHub branch rule requires the stable `quality` check, and that a failed, `not-computed`, missing-token, or missing-project result cannot merge.
4. Keep T031 incomplete until the actual PR has a passing computed Quality Gate and its required check is confirmed in GitHub.

If the native monorepo analysis does not publish a blocking check, do not weaken the gate. Follow the alternate project/aggregator investigation in `research.md` and document the observed result before changing the integration design.

## References

- [SonarSource scan action](https://github.com/SonarSource/sonarqube-scan-action)
- [SonarQube Cloud GitHub integration](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/administering-your-projects/devops-platform-integration/github)
- [SonarQube Cloud quality gates](https://docs.sonarsource.com/sonarqube-cloud/standards/managing-quality-gates/introduction-to-quality-gates)
- [SonarQube Cloud new-code standards](https://docs.sonarsource.com/sonarqube-cloud/standards/about-new-code)
