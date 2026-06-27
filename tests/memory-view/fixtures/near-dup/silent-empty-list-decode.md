---
name: silent-empty-list-decode
description: "Derived Schema.UUID rejects non-RFC Postgres ids, so the list silently empties at HTTP 200 (re-saved near-dup)"
metadata:
  node_type: memory
  type: project
  originSessionId: 88888888-8888-4888-8888-888888888882
---

A derived `Schema.UUID` field rejects the non-RFC ids that Postgres actually stores. Decoding the query result fails, react-query receives no data, and the UI renders an empty list even though the network request returned HTTP 200 with no logged error. The fix is to relax the uuid columns to `Schema.String` on the wire model so decode stops throwing. This note was re-saved in a later session with almost the same wording — a lexical near-duplicate (DUP02) the curator should offer to merge.
