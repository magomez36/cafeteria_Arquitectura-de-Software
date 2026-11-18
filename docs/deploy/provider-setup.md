# External deployment provider setup

No external deployment has been created from this repository. Provider settings remain unverified until a repository owner supplies the existing project/account IDs and records a successful deployment check.

## Vercel preview

Create or select the existing Vercel project for `apps/web`. Set its Root Directory to `apps/web`, enable **Include source files outside of the Root Directory in the Build Step** so the workspace package `packages/ui` remains available, and turn off Git deployments. The repository `apps/web/vercel.json` repeats the Next.js framework/build setting and disables Git deployment as code. Do not connect a second Git-based deploy path.

Add to the GitHub Actions `preview` Environment:

- Secret `VERCEL_TOKEN`: a project-scoped/least-privilege token accepted by Vercel CLI.
- Variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`: exact IDs from the selected Vercel project.
- Variable `RENDER_STAGING_API_URL`: the owner-provided staging API URL, used by the preview smoke tests as the backend fallback.

Keep the Preview environment limited to non-secret values needed at build/runtime. The current UI may use a public API base URL; do not add database, Redis, broker, mail, signing, or production credentials to Vercel Preview. `vercel pull` writes the selected environment into ignored `.vercel` files, so the workflow does not run `vercel build` with the deployment token in its environment. The workflow refuses Draft PRs and fork PRs, checks the exact PR head SHA for successful required checks first, builds prebuilt output, and uploads it afterward. Keep the Vercel token only in the protected GitHub Environment.

The CLI may create a preview deployment only after the Vercel project exists and the owner has configured this Environment. This document does not select a paid plan or create a Vercel project.

## Render and GHCR

Before creating any Render service, the owner must provide and approve:

1. The existing Render workspace and the region it supports in common with the selected Vercel setup.
2. Compute plan for the API and worker; Postgres plan, storage, backup/retention and replica decision; Key Value plan; and whether RabbitMQ is a Render private service or CloudAMQP (including its plan).
3. The resulting service IDs and owner-created preview/staging API URL. Do not infer a provider URL or assume a free plan.
4. Approval for any recurring cost and confirmation that staging uses test/anonymous data.

The staging template is `render.yaml`. Run `node scripts/deploy/render-blueprint.mjs` with `GITHUB_REPOSITORY`, `RENDER_REGION`, `RENDER_API_PLAN`, `RENDER_WORKER_PLAN`, `RENDER_CACHE_PLAN`, `RENDER_POSTGRES_PLAN`, `RENDER_GHCR_CREDENTIAL`, `API_IMAGE_DIGEST` and `WORKER_IMAGE_DIGEST`. Keep the rendered file local until provisioned settings are approved. The credential value here is the name of a Render credential already configured for read-only GHCR access. The digest variables must be the exact API and worker references returned by publication. Run Render's Blueprint validator before applying it.

Render staging uses private Postgres and Key Value connection strings and a background worker without a public route. The owner must configure `RABBITMQ_URL` in Render for the chosen private broker and verify connectivity. For a Render private service, choose a pinned RabbitMQ image and an approved compute and persistence plan. For an external broker, confirm private connectivity from the selected Render region before using it. Set backups and retention in the approved Postgres plan and decide whether a replica is needed before applying the template.

Render runs `node apps/api/dist/database/migrate.js`, the compiled entry point for `pnpm db:migrate`, directly from the promoted API image. Predeploy requires a plan that supports that command. Keep Vercel Git deployment disabled and check that the image-backed Render services accept only authorized deployments. [Render Blueprint reference](https://render.com/docs/blueprint-spec) · [Render image-backed services](https://render.com/docs/deploying-an-image)

GHCR publication is limited to immutable SHA/digest artifacts from trusted workflows. The publish workflow runs only for a merged PR to `main`, locates a successful PR CI run for the exact source SHA, downloads the retained API/worker images already built and scanned by that run, validates the manifest, then uses the job-scoped `GITHUB_TOKEN` with `packages:write` to publish those image bytes without rebuilding. PR workflows have no package-write permission. A repository owner must verify the first post-merge image digests; do not publish a production release from a feature branch.

The `Prepare staging promotion` workflow is read-only and retains a verified digest plan. Provider adapters, a healthy retained baseline and staging-only endpoint credentials are still needed before it can deploy or record a successful smoke run.
