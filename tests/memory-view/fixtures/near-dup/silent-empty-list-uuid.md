---
name: silent-empty-list-uuid
description: "Schema.UUID rejects non-RFC ids stored in Postgres, so the list silently empties with an HTTP 200"
metadata:
  node_type: memory
  type: project
  originSessionId: 88888888-8888-4888-8888-888888888881
---

A derived `Schema.UUID` field rejects the non-RFC ids that Postgres actually stores. Decoding the query result fails, react-query receives no data, and the UI renders an empty list even though the network request returned HTTP 200 with no logged error. The fix is to relax the uuid columns to `Schema.String` on the wire model so decode stops throwing.
