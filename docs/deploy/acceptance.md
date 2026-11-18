# Preview and staging acceptance record

| Scenario                 | Required evidence                                                                      | Current result                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR preview               | Vercel deployment URL on the exact PR head SHA; automated smoke and axe pass           | Local Playwright checks pass; no Vercel account, URL or run supplied                                                                                |
| API preview              | Isolated Render preview, or owner-approved shared staging fallback                     | No Render service/API URL supplied                                                                                                                  |
| Merge to staging         | Same immutable API/worker digest and web prebuilt promoted from verified SHA           | Local tests validate the scanned archive, publication attempt and staging digest selection. No registry publication or provider deployment observed |
| Post-deploy health       | `/health` and home pass after deploy; failure preserves previous deployment and alerts | Local API/web smoke pass; no deployed smoke run                                                                                                     |
| Merge-to-staging latency | Record merge timestamp and healthy-staging timestamp; target <20 minutes               | Not measured                                                                                                                                        |
| Provider Git deployment  | Vercel/Render auto deploy disabled and authorized workflow is sole writer              | Vercel desired config/docs exist; provider settings and Render are not verified                                                                     |

Acceptance requires a real owner-provisioned preview/staging environment, successful post-deploy smoke, and recorded timing. Do not infer provider URLs or mark this table passed from local tests.

For the first acceptance run, record URLs from the providers and timestamps from GitHub Actions rather than estimates. Use a trial PR with test data.

| Evidence                                    | Source                                      | Timestamp (UTC)          | Result                 |
| ------------------------------------------- | ------------------------------------------- | ------------------------ | ---------------------- |
| PR and exact head SHA                       | `<PR_URL>`                                  | `<PR_OPENED_AT>`         | Pending                |
| Required checks and Sonar Quality Gate      | `<CI_RUN_URL>`                              | `<CI_COMPLETED_AT>`      | Pending for this trial |
| Preview web and API smoke                   | `<PREVIEW_URL>` and `<PREVIEW_RUN_URL>`     | `<PREVIEW_HEALTHY_AT>`   | Pending                |
| Merge and immutable artifacts               | `<MERGED_SHA>` and `<GHCR_PUBLISH_RUN_URL>` | `<MERGED_AT>`            | Pending                |
| Staging web, API health and release digests | `<STAGING_URL>` and `<STAGING_RUN_URL>`     | `<STAGING_HEALTHY_AT>`   | Pending                |
| Telemetry for the CI and deployment SHAs    | `<DASHBOARD_URL>`                           | `<TELEMETRY_VISIBLE_AT>` | Pending                |

Calculate main CI time (SC-001), merge-to-healthy staging (SC-004), and the end-to-end time (SC-009) using these timestamps and the limits in `spec.md`.
