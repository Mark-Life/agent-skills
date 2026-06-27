---
name: orphan-topic
description: "A real topic file on disk that no MEMORY.md entry references (inIndex = false)"
metadata:
  node_type: memory
  type: project
  originSessionId: 55555555-5555-4555-8555-555555555555
---

This file exists in the memory dir but is absent from MEMORY.md, so the index never surfaces it to Claude. The body-link from `indexed-topic` keeps it reachable in the link graph, isolating the IDX01 (index orphan) signal from the LNK07 (graph orphan) signal: a file can be graph-reachable yet invisible to the always-loaded index.
