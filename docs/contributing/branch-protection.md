# `main` branch protection

## Activation evidence

The owner confirmed activation for the final Spec #1 baseline. On 2026-11-17 UTC, `GET /repos/magomez36/cafeteria_Arquitectura-de-Software/branches/main` independently returned:

- `protected: true` and `protection.enabled: true`;
- `required_status_checks.enforcement_level: everyone`;
- the six required checks below.

| Exact required context        | GitHub app ID | Relationship to CI                             |
| ----------------------------- | ------------- | ---------------------------------------------- |
| `quality`                     | 15368         | Includes the blocking Sonar scan/Quality Gate. |
| `CodeQL`                      | 57789         | Native CodeQL analysis check.                  |
| `security / dependency-audit` | 15368         | High/critical dependency findings block.       |
| `security / secret-scan`      | 15368         | Secret findings block.                         |
| `images`                      | 15368         | Builds and Trivy scans API/worker images.      |
| `pr-report`                   | 15368         | Propagates failed or cancelled jobs.           |

The active rule selects the native **`CodeQL`** check. The preview helper now requires that check and the workflow job `security / codeql`. Sonar failure propagates through the required `quality` job. The native `SonarCloud Code Analysis` context is separate from the six required checks.

These checks passed on `341cc4a` ([run 44004176940](https://github.com/magomez36/cafeteria_Arquitectura-de-Software/actions/runs/44004176940)). They must pass again on the documentation commit. PR #1 remains Draft and has no human approval recorded in the reviewed evidence.

The administrative protection endpoint returns `403 Resource not accessible by integration`. An empty public ruleset list does not invalidate enabled classic branch protection. The public branch response does not expose the approval count, linear-history requirement or bypass settings; the owner must confirm these details rather than the agent inferring them.

## Required policy and remaining verification

The administrator should verify the active rule includes:

- Pull request required, at least one approving review; dismiss stale approvals and require approval of the latest reviewable push where available.
- All conversations resolved, all six exact required checks successful and the branch up to date.
- Linear history and the agreed rebase integration method.
- No direct-push/bypass exception for normal contributors; force pushes and deletion blocked.

Record an owner settings export or redacted screenshot of these rule details. T033 remains partial until all required settings are evidenced. Run [44230304773](https://github.com/magomez36/cafeteria_Arquitectura-de-Software/actions/runs/44230304773) propagated a calculated Sonar failure to required `quality` under the active rule. The audit also failed in that run. T031 still needs an isolated enforcement case. T034's remaining negative scenarios are open.

Enforcement experiments need a separate authorized disposable PR. Do not attempt a direct push, forced merge or destructive test against `main` or PR #1 merely to collect evidence. No such experiment was run during documentation closure.

## Preparing the baseline review

After the documentation SHA has green required checks, PR #1 is technically ready to leave Draft for a colleague's review. Ready for review is not merge approval or completion of all Spec #1 tasks. Obtain the required human approval, confirm the rule details above and record acceptance gaps before any authorized merge. Keep `feature/spec-1` as the only implementation branch until integration; colleagues create `feature/spec-2`, `feature/spec-3` and `feature/spec-5` from the accepted, updated `main` afterwards.
