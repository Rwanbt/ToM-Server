# Authentication and JSON ingress: deterministic security evidence

Base: `Rwanbt/ToM-Server` main `6651bd21a75570c6f659d832afec73cbf4a77fef`.

## Threat model and repair

- Legacy Matrix identity authentication logged the complete unknown bearer token and could log database exceptions containing it.
- Legacy ToM authentication logged request headers, including arbitrary cookies, on unauthenticated requests. Raw upstream error objects and responses could also be logged.
- Legacy JSON request parsing logged the entire malformed request body (including possible passwords) and passed the parser error to the HTTP client.
- These paths now emit controlled messages without raw token, header, request-body or exception objects. Authentication success and fail-closed responses are preserved.

## Local deterministic RED -> GREEN

Command:

```sh
bun install --frozen-lockfile
bun test --isolate \
  src/modules/legacy/matrix-identity-server/authentication-security.test.ts \
  src/modules/legacy/tom-server/identity-server/utils/authentication-security.test.ts \
  src/modules/legacy/utils/json-content-security.test.ts
```

Before the repair, the unknown-token test, DB-error test, cookie-header test and malformed-body test each failed, printing test-only sentinels. The repaired tests: **6 pass, 0 fail, 16 assertions** on Bun 1.3.11.

## Wider gates: NOT YET GREEN

Running `bun test --isolate` against this local tree: **511 pass, 358 fail, 869 total across 77 files**. Running `bun run type-check` also fails on numerous TypeScript 7 `--isolatedDeclarations`, missing third-party types and older legacy code errors. These must be investigated against the unmodified base and corrected in separate, scoped changes; no claim of complete suite readiness is made here.

This patch does **not** certify all token ingress, distributed rate limiting, external SSO, UI/UX, or production deployments. Never use real secrets in these tests, and do not merge without mandatory independent CI verification on the exact PR HEAD.
