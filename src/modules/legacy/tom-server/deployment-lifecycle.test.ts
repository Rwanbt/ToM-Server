/**
 * Deployment lifecycle of the stateful ToM server on a disposable environment.
 *
 * The scenarios mirror a real release operation: a release is deployed, the
 * service starts, the schema is migrated, the state is backed up, the service
 * is restarted, a degraded release is deployed, and the deployment is rolled
 * back. Every step is executed and the state after each step is verified:
 * a rollback that is not executed, or whose result is not checked, proves
 * nothing.
 *
 * The environment is a throw-away directory: no shared database, no shared
 * port, nothing outside the temporary directory is touched.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";

import TwakeServer from "./index";
import { type Config, type TwakeDB } from "./types";

const SESSION_ID = "deployment-session-credential-0001";
const SESSION_SUBJECT = "@deploy:example.org";

interface Release {
  id: string;
  dataFile: string;
}

interface Deployment {
  root: string;
  matrixDb: string;
  releases: Map<string, Release>;
  current: () => string;
  deploy: (id: string) => void;
  release: () => Release;
}

const sha256 = (file: string): string =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/**
 * Creates an empty but valid SQLite database.
 *
 * The Matrix database is opened read-only by the server: it models the
 * Synapse database, which must exist before the server starts.
 */
const createSqliteFile = async (file: string): Promise<void> => {
  const sqlite3 = await import("sqlite3");
  const db = new sqlite3.Database(file);
  await new Promise<void>((resolve, reject) => {
    db.run("CREATE TABLE IF NOT EXISTS probe (id text)", (error) =>
      error ? reject(error) : resolve(),
    );
  });
  await new Promise<void>((resolve) => db.close(() => resolve()));
};

const createDeployment = (): Deployment => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tom-deployment-"));
  fs.mkdirSync(path.join(root, "releases"), { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "backup"), { recursive: true });
  const releases = new Map<string, Release>();
  const pointer = path.join(root, "current.json");
  const matrixDb = path.join(root, "data", "matrix.db");

  const write = (id: string, dataFile: string): void => {
    releases.set(id, { id, dataFile });
    fs.writeFileSync(path.join(root, "releases", `${id}.json`), JSON.stringify({ id, dataFile }));
  };

  const current = (): string => JSON.parse(fs.readFileSync(pointer, "utf-8")).release as string;

  write("release-a", path.join(root, "data", "tom.db"));
  write("release-b", path.join(root, "data", "tom-b.db"));
  fs.writeFileSync(pointer, JSON.stringify({ release: "release-a" }));

  return {
    root,
    matrixDb,
    releases,
    current,
    deploy: (id: string) => {
      fs.writeFileSync(pointer, JSON.stringify({ release: id }));
    },
    release: () => {
      const release = releases.get(current());
      if (!release) throw new Error("unknown release");
      return release;
    },
  };
};

const start = async (deployment: Deployment): Promise<TwakeServer> => {
  const release = deployment.release();
  const conf = {
    database_engine: "sqlite",
    database_host: release.dataFile,
    matrix_database_engine: "sqlite",
    matrix_database_host: deployment.matrixDb,
    userdb_engine: "sqlite",
    userdb_host: path.join(deployment.root, "data", "user.db"),
    server_name: "example.org",
    matrix_server: "example.org",
    rate_limiting_window: 60000,
    rate_limiting_nb_requests: 1000,
    template_dir: "assets/templates",
    sms_api_url: "https://api.example.com/",
    sms_api_login: "",
    sms_api_key: "",
  } as unknown as Config;
  const server = new TwakeServer(conf);
  await server.ready;
  return server;
};

const asApp = (server: TwakeServer): express.Application => {
  const app = express();
  app.use(server.endpoints);
  return app;
};

const dbOf = (server: TwakeServer): TwakeDB => {
  if (!server.db) {
    throw new Error("the database is not ready");
  }
  return server.db;
};

const stop = (server: TwakeServer | undefined): void => {
  server?.cleanJobs();
};

describe("ToM server deployment lifecycle on a disposable environment", () => {
  let deployment: Deployment;

  beforeAll(async () => {
    deployment = createDeployment();
    await createSqliteFile(deployment.matrixDb);
  });

  afterAll(async () => {
    // The SQLite handles are closed asynchronously: give them a moment before
    // removing the disposable directory.
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      fs.rmSync(deployment.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // The SQLite driver may still hold the files on Windows: the
      // disposable directory lives in the operating system temp folder.
    }
  });

  it("starts on a fresh volume and creates its schema", async () => {
    const server = await start(deployment);
    try {
      expect(fs.existsSync(deployment.release().dataFile)).toBe(true);
      const tables = await dbOf(server).getAll("accessTokens", ["id"]);
      expect(Array.isArray(tables)).toBe(true);
      // The service answers HTTP requests: it is running, not just created.
      const response = await request(asApp(server)).get("/_matrix/identity/v2/account");
      expect(response.status).toBe(401);
    } finally {
      stop(server);
    }
  });

  it("keeps the state across a restart and backs it up", async () => {
    const server = await start(deployment);
    await dbOf(server).insert("accessTokens", {
      id: SESSION_ID,
      data: JSON.stringify({ sub: SESSION_SUBJECT, epoch: Date.now() }),
    });
    stop(server);

    // Restart on the same volume: the state must still be there.
    const restarted = await start(deployment);
    const sessions = await dbOf(restarted).get("accessTokens", ["id"], { id: SESSION_ID });
    expect(sessions).toHaveLength(1);
    stop(restarted);

    // Backup: the copy is a usable database holding the same state.
    const backupFile = path.join(deployment.root, "backup", "tom-release-a.db");
    fs.copyFileSync(deployment.release().dataFile, backupFile);
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(fs.statSync(backupFile).size).toBeGreaterThan(0);

    const backupServer = await start(deployment);
    const backedUp = await dbOf(backupServer).get("accessTokens", ["id"], { id: SESSION_ID });
    expect(backedUp).toHaveLength(1);
    stop(backupServer);
  });

  it("restores the state from a backup", async () => {
    const backupFile = path.join(deployment.root, "backup", "tom-release-a.db");
    const backupDigest = sha256(backupFile);

    // Lose the volume: this is the degraded state a rollback has to repair.
    fs.rmSync(deployment.release().dataFile, { force: true });
    const degraded = await start(deployment);
    const lost = await dbOf(degraded).get("accessTokens", ["id"], { id: SESSION_ID });
    expect(lost).toHaveLength(0);
    stop(degraded);

    // Restore the backup over the volume.
    fs.copyFileSync(backupFile, deployment.release().dataFile);
    expect(sha256(deployment.release().dataFile)).toBe(backupDigest);

    const restored = await start(deployment);
    const sessions = await dbOf(restored).get("accessTokens", ["id"], { id: SESSION_ID });
    expect(sessions).toHaveLength(1);
    stop(restored);
  });

  it("executes a rollback and verifies the state after it", async () => {
    const backupFile = path.join(deployment.root, "backup", "tom-release-a.db");
    const backupDigest = sha256(backupFile);

    // Deploy the degraded release: it runs against another volume, so the
    // production state disappears while the service still answers.
    deployment.deploy("release-b");
    expect(deployment.current()).toBe("release-b");
    const degraded = await start(deployment);
    const lost = await dbOf(degraded).get("accessTokens", ["id"], { id: SESSION_ID });
    expect(lost).toHaveLength(0);
    const degradedResponse = await request(asApp(degraded)).get("/_matrix/identity/v2/account");
    expect(degradedResponse.status).toBe(401);
    stop(degraded);

    // Roll back: the previous release is deployed again and its volume is
    // restored from the backup.
    deployment.deploy("release-a");
    expect(deployment.current()).toBe("release-a");
    fs.copyFileSync(backupFile, deployment.release().dataFile);
    expect(sha256(deployment.release().dataFile)).toBe(backupDigest);

    // The post-rollback state is verified: the service starts and the state
    // is the one that was backed up.
    const rolledBack = await start(deployment);
    const sessions = await dbOf(rolledBack).get("accessTokens", ["id"], { id: SESSION_ID });
    expect(sessions).toHaveLength(1);
    const response = await request(asApp(rolledBack)).get("/_matrix/identity/v2/account");
    expect(response.status).toBe(401);
    stop(rolledBack);
  });
});
