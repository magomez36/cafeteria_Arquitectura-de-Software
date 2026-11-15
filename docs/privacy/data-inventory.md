# Initial privacy and team-data inventory

| Data | Purpose | Initial collection | Retention/access |
|---|---|---|---|
| Developer account identifier, PR/review/test/documentation events, workflow result and duration | Team delivery visibility required by the spec | GitHub and CI events; no local personal data is seeded | Team-level aggregates by default; individual view requires notice and restricted ACL; no ranking or quality inference from commit counts. Set retention before enabling Grafana collection. |
| Local developer service data | Reproducible integration development | Disposable local-only data in Docker volumes | Each contributor controls and may delete local volumes; never copy production personal data. |

No customer PII, credentials, card data, or production records are collected by this platform foundation. Future customer data must be added by the owning spec with purpose, lawful basis, access controls and retention before implementation.
