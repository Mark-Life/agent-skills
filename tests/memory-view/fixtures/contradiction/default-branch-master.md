---
name: default-branch-master
description: "Records that the repository's default branch is master and PRs merge into it"
metadata:
  node_type: memory
  type: reference
  originSessionId: 99999999-9999-4999-8999-999999999992
---

The default branch of this repository is `master`. Open pull requests against `master`, and releases are cut from `master`. This directly contradicts [[default-branch-main]]; the curator surfaces both, and curation keeps the current/newer fact and removes or merges the loser (CON01).
