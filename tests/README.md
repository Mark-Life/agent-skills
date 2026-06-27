# tests

Dev-only. **Never shipped** to skill installs — that's the whole point of keeping
it out of `skills/` (see `../CLAUDE.md` for why the skill folder is the shipped
artifact).

```
tests/
  guard.test.ts            # asserts skills/ contains no dev-only files
  memory-view/
    scan.test.ts           # detector + redaction smoke tests
    fixtures/              # synthetic broken-on-purpose memory vaults
  session-report/
    tokens.test.ts         # pure helper unit tests
```

## Run

```bash
bun test            # all unit + guard tests
bun test tests/guard.test.ts
```

Tests import runtime code from the shipped skill by relative path
(`../../skills/<name>/scripts/lib/*.ts`) and resolve fixtures with
`import.meta.dir`. No build step, no runtime deps.

## Model-version evals (planned)

The two model-dependent skills (memory-view's candidate judgment, session-report)
will get evals that run against the newest Claude releases. Convention:

- File name `*.eval.ts` (not `*.test.ts`) → excluded from the default `bun test`.
- Gated behind `RUN_MODEL_EVALS=1` and `ANTHROPIC_API_KEY`.
- Live under `tests/<name>/model/`, with the model-id list parametrized so a new
  Claude release means adding an id and re-running.
