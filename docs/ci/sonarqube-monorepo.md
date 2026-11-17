# SonarQube Cloud in the pnpm monorepo

## Repository configuration

The PR workflow generates six workspace LCOV reports with `pnpm coverage` and a seventh report for tested CI, deployment, migration-order, load-target, telemetry, and module-boundary utilities with `pnpm test:ci:coverage`. `sonar-project.properties` imports all seven reports. The pinned SonarSource scanner waits for the actual Quality Gate; missing credentials, missing reports, failed gates, and `not-computed` results fail the `quality` job.

The repository owner has configured the GitHub Actions secret `SONAR_TOKEN` and variables `SONAR_PROJECT_KEY` and `SONAR_ORGANIZATION`. Their values are intentionally not read or stored in this repository. The passing PR analysis targeted `main`. Verify each subsequent PR head and confirm the exact gate configuration as part of acceptance.

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

## Earlier PR evidence

Run `43975115316` (head `093d270`) passed per-commit validation, lint, typecheck, unit tests, API/worker integration tests, build, Playwright/axe, and LCOV generation. The scanner log confirms that it imported all seven LCOV reports. Sonar calculated a failed Quality Gate solely because new-code coverage was 79.2% (required 80%). Reliability, security and maintainability were all A; duplication was 2.1% and reviewed hotspots were 100%. The public issues API returned no open bugs or vulnerabilities. CodeQL, dependency audit, secret scan, image builds and Trivy passed; `pr-report` correctly propagated the failed `quality` job. Preview remained skipped while PR #1 was Draft.

The earlier run `43917776461` had reported 23.0% new-code coverage, C security and D reliability. Its default-sort, workflow-permission, telemetry-trust and Git-resolution findings are resolved in the real analysis on `093d270`. The run on `341cc4a` confirmed the increase above the unchanged threshold.

The scanner also reports that its current analysis-scope mode ignores `sonar.sources`, `sonar.tests` and `sonar.test.inclusions` and scans the whole repository. This explains why application-only coverage was insufficient. This correction keeps application, infrastructure and CI code in scope and adds executable tests; it does not exclude untested production files to pass the gate.

The public branch API now confirms `main` protection and `quality` enforcement for everyone. The `quality` job waits for Sonar and propagates a failed gate. The native `SonarCloud Code Analysis` check provides the direct analysis result. [Branch protection evidence](../contributing/branch-protection.md)

## Passing analysis on the corrected head

Run [44004176940](https://github.com/magomez36/cafeteria_Arquitectura-de-Software/actions/runs/44004176940), head `341cc4a02cfd992f9a4b1566e556d8e92841ce3e`, completed successfully. Its scanner log confirms all seven LCOV imports and `QUALITY GATE STATUS: PASSED`; the native `SonarCloud Code Analysis` check also succeeded on that SHA. The public Quality Gate API reports `OK`, with no ignored conditions: new-code coverage 81.5%, all three ratings A, duplication 2.1%, and reviewed hotspots 100%. No open bugs/vulnerabilities were returned. CodeQL, dependency audit, secret scan, images/Trivy and `pr-report` all succeeded. This is a calculated gate result, not `not-computed`.

The per-commit validator passed 28/28 commits in 737,744 ms. Policy tests passed 67/67 and browser E2E/axe passed 4/4. PR #1 remains Draft, open and mergeable without conflicts. The passing analysis does not activate branch protection automatically and does not close the remaining negative CI acceptance scenarios.

## Monorepo PR acceptance experiment

1. Run a normal PR and inspect the Sonar analysis SHA, all seven LCOV imports, new-code metrics, and `quality` conclusion.
2. On a disposable branch, add a temporary production-source fixture whose coverage is below 80%; verify the Sonar Quality Gate and the GitHub `quality` check fail. Remove the fixture in a separate cleanup change.
3. Verify the GitHub branch rule requires the stable `quality` check, and that a failed, `not-computed`, missing-token, or missing-project result cannot merge.
4. Keep T031 open until a failed gate is observed blocking integration under the active rule. The historical failed pipeline and the current required-check configuration were verified separately.

If the native monorepo analysis does not publish a blocking check, do not weaken the gate. Follow the alternate project/aggregator investigation in `research.md` and document the observed result before changing the integration design.

## References

- [SonarSource scan action](https://github.com/SonarSource/sonarqube-scan-action)
- [SonarQube Cloud GitHub integration](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/administering-your-projects/devops-platform-integration/github)
- [SonarQube Cloud quality gates](https://docs.sonarsource.com/sonarqube-cloud/standards/managing-quality-gates/introduction-to-quality-gates)
- [SonarQube Cloud new-code standards](https://docs.sonarsource.com/sonarqube-cloud/standards/about-new-code)
