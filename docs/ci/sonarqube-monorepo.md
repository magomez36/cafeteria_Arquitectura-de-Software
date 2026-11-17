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

The earlier local reports aggregated to 913 covered of 1129 instrumented lines (80.87%). After adding subprocess tests that exercise the real CLI error handlers, `pnpm test:ci:coverage` passes 67/67 tests and reports 82.24% line coverage for its instrumented scripts. These are local measurements, **not** Sonar new-code measurements or Quality Gate approval. Sonar's imported coverage and gate must be confirmed on the new PR head.

## Latest real PR evidence

Run `43975115316` (head `093d270`) passed per-commit validation, lint, typecheck, unit tests, API/worker integration tests, build, Playwright/axe, and LCOV generation. The scanner log confirms that it imported all seven LCOV reports. Sonar calculated a failed Quality Gate solely because new-code coverage was 79.2% (required 80%). Reliability, security and maintainability were all A; duplication was 2.1% and reviewed hotspots were 100%. The public issues API returned no open bugs or vulnerabilities. CodeQL, dependency audit, secret scan, image builds and Trivy passed; `pr-report` correctly propagated the failed `quality` job. Preview remained skipped while PR #1 was Draft.

The earlier run `43917776461` had reported 23.0% new-code coverage, C security and D reliability. Its default-sort, workflow-permission, telemetry-trust and Git-resolution findings are resolved in the real analysis on `093d270`. The next run must confirm that the additional CLI tests bring new-code coverage above the unchanged threshold.

The scanner also reports that its current analysis-scope mode ignores `sonar.sources`, `sonar.tests` and `sonar.test.inclusions` and scans the whole repository. This explains why application-only coverage was insufficient. This correction keeps application, infrastructure and CI code in scope and adds executable tests; it does not exclude untested production files to pass the gate.

GitHub's connected app returned `403 Resource not accessible by integration` for `main` branch protection and an empty public ruleset list. Classic branch protection cannot be inferred from the empty list. T031 and T033 remain pending until an administrator confirms the effective required checks and merge restrictions.

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
