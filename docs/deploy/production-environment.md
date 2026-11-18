# GitHub production Environment

Create an Environment named `production` only after an authorized repository administrator confirms the organization's GitHub plan supports required reviewers. Do not store any credential value in this file or in Git.

## Required controls

- Required reviewers: at least one authorized release approver, independent from the workflow initiator when repository policy allows.
- Deployment branches/tags: restrict to release tags created from `main`; disallow arbitrary feature branches.
- Prevent administrator bypass when available; retain audit history.
- Configure a single production concurrency group in the release workflow with `cancel-in-progress: false`.
- Keep preview, staging and production secrets separate and grant each workflow only its environment's permissions.

## Names to provision after provider decisions

| Kind     | Name                          | Purpose                                                               |
| -------- | ----------------------------- | --------------------------------------------------------------------- |
| Secret   | `RENDER_API_TOKEN`            | Minimum-scope Render deploy/read/rollback API access                  |
| Variable | `RENDER_API_SERVICE_ID`       | Owner-provided API service ID                                         |
| Variable | `RENDER_WORKER_SERVICE_ID`    | Owner-provided worker service ID                                      |
| Secret   | `VERCEL_TOKEN`                | Project-scoped production promotion and rollback                      |
| Variable | `VERCEL_ORG_ID`               | Owner-provided organization ID                                        |
| Variable | `VERCEL_PROJECT_ID`           | Owner-provided project ID                                             |
| Secret   | provider database credentials | Must remain in Render, never be passed through logs or Actions output |

Do not create a production Environment or provision tokens until service IDs, approved plans, region, migration execution mode and rollback capabilities are confirmed. At present, this document is the desired setup; no GitHub Environment or secret has been created or verified.
