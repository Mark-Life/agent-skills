---
name: leaked-credentials
description: "Note that intentionally embeds OBVIOUSLY FAKE secrets so the SEC redaction detectors have something to match"
metadata:
  node_type: memory
  type: reference
  originSessionId: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
---

WARNING: every credential below is a deliberately fake, well-known example value — none of these are real or usable. They exist only to exercise the SEC01 secret detector and SEC03 absolute-path check.

The integration script reads an OpenAI key from the environment, but someone pasted it into memory by mistake:

    OPENAI_API_KEY=sk-proj-EXAMPLE00fake00NOTREAL00example00abcd

AWS access was also leaked here (this is AWS's own documentation example id, not a live key):

    AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
    AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIexampleKEYfakeEXAMPLEkey1234

And a local absolute path that leaks a username and machine layout (SEC03):

    config loaded from /Users/janedoe/Code/secret-project/.env.local

When redaction is on (the default), the curator replaces these with [REDACTED:*] placeholders in both the HTML artifact and findings.json, and warns the user to rotate anything real.
