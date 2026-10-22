/**
 * Application-level ingress security contract.
 *
 * These checks exercise the real Express stack (`createApp`) over real HTTP
 * requests. They cover two production guarantees that the module-level unit
 * tests cannot prove:
 *
 *  1. A bearer credential passed as a query parameter must never reach the
 *     structured logs (the log line carries the request URL).
 *  2. Oversized or malformed payloads must be rejected with the HTTP status
 *     that describes them (413 / 400), never with a generic 500 and never
 *     with a crash inside the terminal error handler.
 */
import { beforeAll, describe, expect, it, mock } from "bun:test";

import { Router } from "express";
import request from "supertest";
import type { Logger } from "winston";

import { createApp } from "./app";
import { configSchema } from "./config/schema";
import { loadMessages } from "./i18n/index";

const SECRET = "syt_matrix_access_token_SENTINEL_9f3a1c";

mock.module("./modules/legacy/router", () => ({
  createLegacyRouter: () => Promise.resolve(Router()),
}));

const config = configSchema.parse({
  server: {
    name: "example.com",
  },
  synapse: {
    server_url: "https://matrix.example.com/",
  },
  database: {
    host: "localhost",
    name: "tom",
    user: "tom",
    password: "tom",
  },
});

interface CapturedLog {
  meta?: unknown;
  message?: unknown;
  payload?: unknown;
}

/**
 * A logger that records every child metadata set and every emitted record so
 * the test can assert that no credential leaks into the log stream.
 */
const createCapturingLogger = (): {
  logger: Logger;
  records: CapturedLog[];
} => {
  const records: CapturedLog[] = [];
  const sink = (meta: unknown) => ({
    info: (message: unknown, payload?: unknown) => {
      records.push({
        meta,
        message,
        payload,
      });
    },
    warn: (message: unknown, payload?: unknown) => {
      records.push({
        meta,
        message,
        payload,
      });
    },
    error: (message: unknown, payload?: unknown) => {
      records.push({
        meta,
        message,
        payload,
      });
    },
    debug: (message: unknown, payload?: unknown) => {
      records.push({
        meta,
        message,
        payload,
      });
    },
  });
  const logger = {
    ...sink(undefined),
    child: (meta: unknown) => {
      records.push({
        meta,
      });
      return sink(meta);
    },
  } as unknown as Logger;

  return {
    logger,
    records,
  };
};

const renderRecords = (records: CapturedLog[]): string => records.map((record) => JSON.stringify(record)).join("\n");

describe("application ingress security", () => {
  beforeAll(() => {
    loadMessages("assets/i18n", createCapturingLogger().logger);
  });

  it("never writes a query-parameter bearer credential to the structured logs", async () => {
    const { logger, records } = createCapturingLogger();
    const app = await createApp(config, logger, undefined);

    const response = await request(app).get("/.well-known/matrix/client").query({
      access_token: SECRET,
    });

    expect(response.status).toBeLessThan(500);
    expect(renderRecords(records)).not.toContain(SECRET);
  });

  it("never writes the Authorization header to the structured logs", async () => {
    const { logger, records } = createCapturingLogger();
    const app = await createApp(config, logger, undefined);

    const response = await request(app).get("/.well-known/matrix/client").set("Authorization", `Bearer ${SECRET}`);

    expect(response.status).toBeLessThan(500);
    expect(renderRecords(records)).not.toContain(SECRET);
  });

  it("rejects an oversized JSON payload with 413 instead of 500", async () => {
    const { logger } = createCapturingLogger();
    const app = await createApp(config, logger, undefined);

    const response = await request(app)
      .post("/.well-known/matrix/client")
      .set("Content-Type", "application/json")
      .send(
        JSON.stringify({
          padding: "x".repeat(200 * 1024),
        }),
      );

    expect(response.status).toBe(413);
  });

  it("rejects a malformed JSON payload with 400 instead of 500", async () => {
    const { logger } = createCapturingLogger();
    const app = await createApp(config, logger, undefined);

    const response = await request(app)
      .post("/.well-known/matrix/client")
      .set("Content-Type", "application/json")
      .send("{ this is not json ");

    expect(response.status).toBe(400);
  });

  it("rejects an oversized urlencoded payload with 413 instead of 500", async () => {
    const { logger } = createCapturingLogger();
    const app = await createApp(config, logger, undefined);

    const response = await request(app)
      .post("/.well-known/matrix/client")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(`padding=${"x".repeat(200 * 1024)}`);

    expect(response.status).toBe(413);
  });
});
