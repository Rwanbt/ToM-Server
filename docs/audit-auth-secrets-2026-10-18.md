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

The added `.github/workflows/ci-auth-security.yml` enforces a focused
security job **plus** independent non-optional full-regression and type-check
jobs. Until GitHub registers and executes the workflow and the existing
baselines are repaired, this PR is a strict **NO-GO**. A local unit PASS
does not waive any of the release gates.

## Legacy test compatibility after safe redaction

The first Linux Actions run identified six pre-existing test expectations
which assumed raw authorization headers or upstream exception objects
would be emitted into production logs. The corrected assertions retain
their original 401/fail-closed and DB behavior checks while requiring
redacted logger calls. Two targeted suites pass locally on Bun 1.3.11:
**14 tests, 37 assertions**. Linux full-suite and type-check reruns are
mandatory; these local results alone do not establish global PASS.

## Bounded JSON ingestion

An additional RED→GREEN set demonstrates previously unbounded JSON
stream accumulation and a duplicate callback for pre-parsed Express
requests. The parser now rejects bodies larger than one MiB with 413,
counts UTF-8 bytes rather than characters, ignores late events after
error/oversize completion and invokes each parsed callback at most once.
These paths use only synthetic secrets; no production services are used.

An additional transport RED→GREEN pair checks a multibyte UTF-8 code point
split between network chunks and malformed UTF-8 input. The ingress now
buffers at most one MiB of raw bytes, decodes the **complete** message
with fatal UTF-8 validation and only then parses JSON. It no longer
silently corrupts valid Unicode or accepts replacement characters for
invalid UTF-8. Focused auth/JSON suite: **11 pass, 33 assertions** locally.

The same one-MiB budget now applies to already-parsed Express `req.body`
objects; previously that route bypassed streaming bounds entirely. Circular
objects are rejected with a sanitized 400 and cannot reach downstream
callbacks. Both cases have RED→GREEN tests. Updated focused suite:
**13 pass, 40 assertions** under Bun 1.3.11; GitHub verifies on 1.4.3.

## Actual HTTP loopback regression

The security suite also tests a disposable `127.0.0.1` HTTP server,
exercising the real Node/Bun request stream rather than mock event emitters.
Three tests send valid UTF-8 split in the middle of a multi-byte character,
invalid byte sequences, and an over-limit chunked JSON body with synthetic
secrets. They check 200, 400 and 413 respectively without contacting any
user service or external identity provider.

Locally the four focused security files now pass **16 tests and 47
assertions**. The unchanged base-to-PR TypeScript comparison remains
**970 vs 968**, with no newly introduced diagnostic identities. Strict
TypeScript remains a blocking NO-GO until the wider type debt is corrected.

## Toolchain determinism

The original callable PR test workflow passed on Bun **1.4.3** while the
new full-regression job running exactly the same command failed many tests
on pinned Bun **1.3.11**. Both paths now pin the proven Bun 1.4.3 runtime
and the critical checkout/setup actions by immutable commit. A separate
Node.js policy test checks for toolchain drift and ensures Biome failures
can no longer be marked `continue-on-error`. This only resolves the
runner divergence if the SHA-exact Linux rerun confirms matching results;
TypeScript 7 errors remain an independent **NO-GO**.

## TypeScript baseline comparison, without weakening the gate

An independently installed detached worktree at original fork SHA
`6651bd21a75570c6f659d832afec73cbf4a77fef`, using locked
TypeScript 7.0.2, reproduced **970 TypeScript diagnostics**. The
candidate had **968**; comparing path + diagnostic code + message
independently of line position found **no newly introduced diagnostic
identities**. Unlike a simple count reduction, this prevents new error
classes from hiding behind repaired legacy errors. The extra
`typecheck-regression` CI job repeats this comparison on Linux with
two independent pinned checkouts and self-tested comparison logic.

**Important:** this is a regression guard, not a production waiver. The
unmodified full `typecheck` job still fails on inherited errors; no
release can be approved until that strict job itself passes.

This patch does **not** certify all token ingress, distributed rate limiting, external SSO, UI/UX, or production deployments. Never use real secrets in these tests, and do not merge without mandatory independent CI verification on the exact PR HEAD.
