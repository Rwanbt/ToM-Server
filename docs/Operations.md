# ToM Server — operations runbook

Operational procedures for the ToM Server (Matrix identity server used by
Twake Workplace). Every command below is meant to be run on a disposable
environment first: the deployment lifecycle exercised by
`src/modules/legacy/tom-server/deployment-lifecycle.test.ts` is the
reference implementation of these procedures.

## 1. Release layout

A release is a self-contained directory. The deployment keeps the previous
releases so a rollback never has to rebuild anything.

```
<deploy-root>/
  releases/<release-id>/      # immutable release payload + its config.yaml
  current.json                # {"release": "<release-id>"} — the live release
  data/                       # stateful volume (ToM database)
  backup/                     # verified backups of the stateful volume
```

Switching the live release is a single pointer write followed by a restart:

```bash
printf '{"release":"%s"}' "$RELEASE_ID" > "$DEPLOY_ROOT/current.json"
systemctl restart tom-server
```

## 2. Startup and schema migration

The server creates its tables on start-up. The creation is idempotent
(`CREATE TABLE` guarded by an existence check), so starting a new release on
an existing volume performs the migration in place and keeps the existing
rows.

```bash
# start and observe the migration
systemctl restart tom-server
journalctl -u tom-server -f | grep -E "initialized|Unable to"
```

A start-up that cannot reach its database fails: the process exits with a
non-zero status and the error is logged as `Unable to initialize server`.

## 3. Health checks

| Signal | Endpoint / source | Meaning |
|---|---|---|
| Liveness | process is up | the container/systemd unit is running |
| Readiness | `GET /_matrix/identity/v2/account` answers `401` without a token | the HTTP stack and the identity database are reachable |
| Metrics | `GET /metrics` (when `telemetry.enabled` is true) | Prometheus scrape endpoint |

`401` on the readiness probe is the expected answer for an anonymous caller:
it proves the request reached the identity layer and was rejected on purpose.
A `5xx` or a timeout means the deployment is not ready.

## 4. Backup

The stateful volume holds the ToM database. Backups are made while the
service is stopped so the copy is consistent.

```bash
systemctl stop tom-server
cp -a "$DEPLOY_ROOT/data" "$DEPLOY_ROOT/backup/data-$RELEASE_ID-$(date -u +%Y%m%dT%H%M%SZ)"
systemctl start tom-server
sha256sum "$DEPLOY_ROOT/backup/data-$RELEASE_ID-"*/tom.db
```

The backup is only considered valid once the digest has been recorded and a
restore has been verified (§5).

## 5. Restore and rollback

A rollback is only complete when the state after it has been **verified**.

```bash
# 1. the live release goes back to the previous one
printf '{"release":"%s"}' "$PREVIOUS_RELEASE_ID" > "$DEPLOY_ROOT/current.json"

# 2. the stateful volume is restored from the last verified backup
systemctl stop tom-server
rm -rf "$DEPLOY_ROOT/data"
cp -a "$DEPLOY_ROOT/backup/data-$PREVIOUS_RELEASE_ID-<timestamp>" "$DEPLOY_ROOT/data"

# 3. the service is restarted
systemctl start tom-server

# 4. the state after the rollback is verified
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/_matrix/identity/v2/account
# expected: 401
```

Verification checklist after a rollback:

- the service starts and the readiness probe answers `401`;
- the digest of the restored database matches the digest of the backup;
- the rows that existed before the degraded release are readable again
  (for example the sessions of `accessTokens`).

A rollback that is not verified is not a rollback: it is an unverified change
of production.

## 6. Observability

- Structured JSON logs on stdout (winston). The request logger writes the
  request **path** only: the query string is never logged because it may
  carry a bearer credential.
- Prometheus metrics when `telemetry.enabled` is true.
- Every request carries a `requestId`, and the trace identifiers of the
  active OpenTelemetry span when telemetry is enabled.
- Security events to alert on: `homeserver failure`, `request rejected`,
  `token rejected`, `Pepper update failed`, `Expiration cleanup failed`.

## 7. GO / NO-GO criteria

A release is **GO** only when every item below is green:

| # | Criterion | Evidence |
|---|---|---|
| 1 | `bun run type-check` is green (TypeScript strict) | CI job `typecheck` at the exact SHA |
| 2 | `bun test --isolate` is green, with the JUnit artifact published | CI job `full-regression` + artifact `tom-bun-regression-<sha>-attempt-1` |
| 3 | Biome reports no error | CI job `call-linters / biome` |
| 4 | The container image is built and published by digest | `docker buildx imagetools inspect` on the tag |
| 5 | SBOM produced for the image | SPDX or CycloneDX artifact attached to the release |
| 6 | Dependency and secret scans show no unresolved critical finding | scan artifacts attached to the release |
| 7 | Deployment lifecycle (start, migrate, backup, restart, restore, rollback) executed and verified | `bun test --isolate src/modules/legacy/tom-server/deployment-lifecycle.test.ts` |
| 8 | Revocation invalidates every cached identity (header, query parameter, federation) | `bun test --isolate src/modules/legacy/tom-server/identity-server/utils/revocation-security.test.ts src/modules/legacy/federated-identity-service/middlewares/revocation-security.test.ts` |
| 9 | No bearer credential reaches the logs, and oversized/malformed payloads are rejected with 413/400 | `bun test --isolate src/app.security.test.ts` |

Any red item is a **NO-GO**. A skipped job is not a green item.
