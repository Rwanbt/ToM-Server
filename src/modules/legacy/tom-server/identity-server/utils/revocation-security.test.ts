/**
 * Revocation contract of the legacy ToM identity server, exercised over real
 * HTTP requests.
 *
 * A bearer credential that has been revoked must never authenticate again,
 * whatever path carries it. The ToM server caches the homeserver identity of
 * a credential in `matrixTokens`: if the revocation does not invalidate that
 * cache, the revocation is fictitious and the credential keeps working.
 */
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";

import express, { type Express } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";

import { type Config } from "../../types";
import { type ConfigDescription } from "../../../config-parser";
import { type TwakeLogger } from "../../../logger";
import { type MatrixDB } from "../../../matrix-identity-server";
import IdServer from "../../identity-server";

const TOKEN = "revocable_bearer_credential_0123456789";

const fetchMock = mock();
mock.module("node-fetch", () => ({ default: fetchMock }));

const mockLogger: Partial<TwakeLogger> = {
  debug: mock(),
  error: mock(),
  warn: mock(),
  info: mock(),
  close: mock(),
};

const testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "tom-revocation-"));
const databaseHost = path.join(testDbDir, "identity.db");
const userdbHost = path.join(testDbDir, "user.db");

const configDescription = {
  database_engine: "sqlite",
  database_host: databaseHost,
  matrix_server: "example.org",
  userdb_engine: "sqlite",
  userdb_host: userdbHost,
  rate_limiting_window: 60000,
  rate_limiting_nb_requests: 1000,
  template_dir: "assets/templates",
} as unknown as ConfigDescription;

const config = {
  database_engine: "sqlite",
  database_host: databaseHost,
  matrix_server: "example.org",
  userdb_engine: "sqlite",
  userdb_host: userdbHost,
  rate_limiting_window: 60000,
  rate_limiting_nb_requests: 1000,
  template_dir: "assets/templates",
} as unknown as Config;

const idServer = new IdServer(
  { get: mock() } as unknown as MatrixDB,
  config,
  configDescription,
  mockLogger as TwakeLogger,
);

const app: Express = express();

describe("legacy ToM token revocation", () => {
  beforeAll(async () => {
    await idServer.ready;
    for (const [route, handler] of Object.entries(idServer.api.get)) {
      app.get(route, handler);
    }
    for (const [route, handler] of Object.entries(idServer.api.post)) {
      app.post(route, handler);
    }
  });

  afterAll(() => {
    idServer.cleanJobs();
    for (const file of [databaseHost, userdbHost]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // The SQLite handle may still be closing on Windows.
      }
    }
    fs.rmSync(testDbDir, { recursive: true, force: true });
  });

  it("rejects a revoked credential carried by the Authorization header", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: mock().mockResolvedValue({ user_id: "@alice:example.org" }),
    });

    const authenticated = await request(app)
      .get("/_matrix/identity/v2/account")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(authenticated.status).toBe(200);
    expect(authenticated.body).toEqual({ user_id: "@alice:example.org" });

    // The homeserver revokes the credential.
    fetchMock.mockResolvedValue({
      ok: false,
      json: mock().mockResolvedValue({ errcode: "M_UNKNOWN_TOKEN" }),
    });

    const logout = await request(app)
      .post("/_matrix/identity/v2/account/logout")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(logout.status).toBe(200);

    const afterRevocation = await request(app)
      .get("/_matrix/identity/v2/account")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(afterRevocation.status).toBe(401);
  });

  it("rejects a revoked credential carried by the access_token query parameter", async () => {
    const queryToken = "revocable_query_credential_9876543210";
    fetchMock.mockResolvedValue({
      ok: true,
      json: mock().mockResolvedValue({ user_id: "@bob:example.org" }),
    });

    const authenticated = await request(app)
      .get("/_matrix/identity/v2/account")
      .query({ access_token: queryToken });
    expect(authenticated.status).toBe(200);

    fetchMock.mockResolvedValue({
      ok: false,
      json: mock().mockResolvedValue({ errcode: "M_UNKNOWN_TOKEN" }),
    });

    const logout = await request(app)
      .post("/_matrix/identity/v2/account/logout")
      .query({ access_token: queryToken });
    expect(logout.status).toBe(200);

    const afterRevocation = await request(app)
      .get("/_matrix/identity/v2/account")
      .query({ access_token: queryToken });
    expect(afterRevocation.status).toBe(401);
  });

  it("keeps a revoked credential revoked even when the homeserver still accepts it", async () => {
    const stubbornToken = "revocable_stubborn_credential_55555";
    fetchMock.mockResolvedValue({
      ok: true,
      json: mock().mockResolvedValue({ user_id: "@carol:example.org" }),
    });

    const authenticated = await request(app)
      .get("/_matrix/identity/v2/account")
      .set("Authorization", `Bearer ${stubbornToken}`);
    expect(authenticated.status).toBe(200);

    // The logout revokes the credential locally; the homeserver keeps
    // answering, which must not resurrect the credential.
    const logout = await request(app)
      .post("/_matrix/identity/v2/account/logout")
      .set("Authorization", `Bearer ${stubbornToken}`);
    expect(logout.status).toBe(200);

    const afterRevocation = await request(app)
      .get("/_matrix/identity/v2/account")
      .set("Authorization", `Bearer ${stubbornToken}`);
    expect(afterRevocation.status).toBe(401);
  });

  it("does not let a revoked credential be cached again by a concurrent homeserver validation", async () => {
    const racyToken = "revocable_racy_credential_77777";
    fetchMock.mockResolvedValue({
      ok: true,
      json: mock().mockResolvedValue({ user_id: "@dave:example.org" }),
    });

    const authenticated = await request(app)
      .get("/_matrix/identity/v2/account")
      .set("Authorization", `Bearer ${racyToken}`);
    expect(authenticated.status).toBe(200);

    const logout = await request(app)
      .post("/_matrix/identity/v2/account/logout")
      .set("Authorization", `Bearer ${racyToken}`);
    expect(logout.status).toBe(200);

    // A late homeserver answer must not re-populate the identity cache.
    fetchMock.mockResolvedValue({
      ok: true,
      json: mock().mockResolvedValue({ user_id: "@dave:example.org" }),
    });
    const afterRevocation = await request(app)
      .get("/_matrix/identity/v2/account")
      .set("Authorization", `Bearer ${racyToken}`);
    expect(afterRevocation.status).toBe(401);

    const cached = await idServer.db.get("matrixTokens", ["data"], { id: racyToken });
    expect(cached).toHaveLength(0);
  });
});
