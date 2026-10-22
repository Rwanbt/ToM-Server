/**
 * Revocation contract of the federated identity service, exercised over real
 * HTTP requests.
 *
 * The federation path accepts a bearer credential from the `Authorization`
 * header or from the `access_token` query parameter. A revoked credential
 * must be rejected on both, and a credential that was never revoked must
 * keep working.
 */
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";

import express, { type Express } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";

import { type Config } from "../types";
import { type ConfigDescription } from "../../config-parser";
import { type TwakeLogger } from "../../logger";
import FederatedIdentityService from "../index";
import { auth } from "./auth";

const TOKEN = "federated_session_credential_0123456789";
const OTHER_TOKEN = "federated_session_credential_9876543210";

const mockLogger: Partial<TwakeLogger> = {
  debug: mock(),
  error: mock(),
  warn: mock(),
  info: mock(),
  close: mock(),
};

const testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "tom-federation-revocation-"));
const databaseHost = path.join(testDbDir, "federation.db");
const userdbHost = path.join(testDbDir, "user.db");

const description = {
  database_engine: "sqlite",
  database_host: databaseHost,
  matrix_server: "example.org",
  userdb_engine: "sqlite",
  userdb_host: userdbHost,
  rate_limiting_window: 60000,
  rate_limiting_nb_requests: 1000,
  trusted_servers_addresses: [],
  trust_x_forwarded_for: false,
  template_dir: "assets/templates",
} as unknown as ConfigDescription;

const fedServer = new FederatedIdentityService(
  { ...description } as unknown as Config,
  description,
  mockLogger as TwakeLogger,
);

const app: Express = express();

describe("federated identity service token revocation", () => {
  beforeAll(async () => {
    await fedServer.ready;
    await fedServer.db.insert("accessTokens", {
      id: TOKEN,
      data: JSON.stringify({ sub: "@alice:example.org", epoch: Date.now() }),
    });
    await fedServer.db.insert("accessTokens", {
      id: OTHER_TOKEN,
      data: JSON.stringify({ sub: "@bob:example.org", epoch: Date.now() }),
    });
    app.get(
      "/_matrix/identity/v2/hash_details",
      auth(fedServer.authenticate),
      (_req, res) => {
        res.status(200).json({ pepper: "test-pepper" });
      },
    );
    const logoutHandler = fedServer.api.post["/_matrix/identity/v2/account/logout"];
    if (!logoutHandler) {
      throw new Error("the identity server must expose the logout endpoint");
    }
    app.post("/_matrix/identity/v2/account/logout", logoutHandler);
  });

  afterAll(() => {
    fedServer.cleanJobs();
    for (const file of [databaseHost, userdbHost]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // The SQLite handle may still be closing on Windows.
      }
    }
    fs.rmSync(testDbDir, { recursive: true, force: true });
  });

  it("accepts a session credential carried by the Authorization header", async () => {
    const response = await request(app)
      .get("/_matrix/identity/v2/hash_details")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
  });

  it("rejects a revoked credential carried by the Authorization header", async () => {
    const logout = await request(app)
      .post("/_matrix/identity/v2/account/logout")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(logout.status).toBe(200);

    const afterRevocation = await request(app)
      .get("/_matrix/identity/v2/hash_details")
      .set("Authorization", `Bearer ${TOKEN}`);
    expect(afterRevocation.status).toBe(401);
  });

  it("rejects a revoked credential carried by the access_token query parameter", async () => {
    const response = await request(app)
      .get("/_matrix/identity/v2/hash_details")
      .query({ access_token: TOKEN });
    expect(response.status).toBe(401);
  });

  it("keeps accepting a credential that was never revoked", async () => {
    const response = await request(app)
      .get("/_matrix/identity/v2/hash_details")
      .set("Authorization", `Bearer ${OTHER_TOKEN}`);
    expect(response.status).toBe(200);

    const viaQuery = await request(app)
      .get("/_matrix/identity/v2/hash_details")
      .query({ access_token: OTHER_TOKEN });
    expect(viaQuery.status).toBe(200);
  });
});
