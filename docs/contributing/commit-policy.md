# Commit policy

Each commit uses Conventional Commits with a required, known scope, for example `feat(api): add health endpoint`. Commitlint rejects missing/unknown scopes, unsupported types and empty descriptions. Standard merge and revert messages are explicit exceptions because Git may generate them; normal feature work still uses atomic Conventional Commits.

Keep each commit to one logical change, make it build and pass its relevant tests, and use `git revert` to reverse an integrated commit. A message hook can validate a commit's syntax, but cannot prove semantic atomicity; reviewers verify that property in the PR. The remote workflow validates all commit messages and code checks remain authoritative if a local hook is bypassed.
