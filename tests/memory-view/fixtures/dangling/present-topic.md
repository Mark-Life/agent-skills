---
name: present-topic
description: "The one index entry that resolves; its sibling entry points at a missing file"
metadata:
  node_type: memory
  type: reference
  originSessionId: 66666666-6666-4666-8666-666666666666
---

This note exists and is correctly indexed. The neighbouring MEMORY.md line links `ghost-file.md`, which is not on disk, producing an unresolved index edge (IDX02). The deterministic fix is to drop the dead line, or — if it is a rename — repoint it to the surviving file.
