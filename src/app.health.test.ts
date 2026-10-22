/**
 * Health probe contract.
 *
 * Exercises the real Express stack (`createApp`) over real HTTP requests to
 * prove that the dedicated `/health` endpoint:
 *   1. answers 200 without authentication,
 *   2. returns only a minimal status token (no secrets / internals),
 *   3. keeps answering even when the DB-backed legacy router is mocked out.
 */
import { beforeAll, describe, expect, it, mock } from "bun:test";

import { Router } from "express";
import request from "supertest";
import type { Logger } from "winston";

import { createApp } from "./app";
import { configSchema } from "./config/schema";
import { loadMessages } from "./i18n/index";

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

const createCapturingLogger = (): Logger =>
  ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createCapturingLogger(),
  }) as unknown as Logger;

describe("health probe", () => {
  beforeAll(() => {
    loadMessages("assets/i18n", createCapturingLogger());
  });

  it("answers 200 without authentication", async () => {
    const app = await createApp(config, createCapturingLogger(), undefined);
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
  });

  it("returns only a minimal status token", async () => {
    const app = await createApp(config, createCapturingLogger(), undefined);
    const response = await request(app).get("/health");
    expect(response.body).toEqual({
      status: "ok",
    });
  });

  it("does not leak the Authorization header into the response", async () => {
    const app = await createApp(config, createCapturingLogger(), undefined);
    const response = await request(app).get("/health").set("Authorization", "Bearer syt_secret_SENTINEL");
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("syt_secret_SENTINEL");
  });
});
