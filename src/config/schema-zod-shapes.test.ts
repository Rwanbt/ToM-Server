import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { configSchema } from "./schema";

// Compiling these assignments checks that the public schema has not been
// widened to ZodType<unknown>, and that prefaulted sections remain optional
// on input but fully present after parse.
const minimalConfig: z.input<typeof configSchema> = {
  server: { name: "local-test-server" },
  database: {
    host: "fixture-db",
    name: "fixture",
    user: "fixture",
    password: "not-a-real-password",
  },
};

describe("precise top-level configuration ZodObject", () => {
  it("keeps required sections strict and materializes nested defaults", () => {
    expect(configSchema).toBeInstanceOf(z.ZodObject);
    const output: z.output<typeof configSchema> = configSchema.parse(minimalConfig);

    expect(output.server.name).toBe("local-test-server");
    expect(output.server.port).toBe(3000);
    expect(output.server.rate_limiting).toEqual({
      window_ms: 60_000,
      max_requests: 100,
    });
    expect(output.database.ssl).toBe(false);
    expect(output.cors.enabled).toBe(true);
    expect(output.features.user_profile.default_visibility_settings).toEqual({
      visibility: "private",
      visible_fields: [],
    });
    expect(output.features.createroom_proxy).toBeUndefined();
  });

  it("rejects missing required sections, bad port and CORS policy bypass", () => {
    expect(configSchema.safeParse({ server: { name: "x" } }).success).toBe(false);
    expect(configSchema.safeParse({ database: minimalConfig.database }).success).toBe(false);
    expect(configSchema.safeParse({
      ...minimalConfig,
      server: { name: "x", port: 0 },
    }).success).toBe(false);
    expect(configSchema.safeParse({
      ...minimalConfig,
      cors: { credentials: true },
    }).success).toBe(false);
    expect(configSchema.safeParse({
      ...minimalConfig,
      cors: { origins: ["~["], credentials: false },
    }).success).toBe(false);
  });

  it("preserves exact proxy preset defaults and rejects invalid encryption", () => {
    const output = configSchema.parse({
      ...minimalConfig,
      features: { createroom_proxy: {} },
    });
    expect(output.features.createroom_proxy?.encryption).toBe("allowed");
    expect(output.features.createroom_proxy?.presets).toHaveLength(5);
    expect(configSchema.safeParse({
      ...minimalConfig,
      features: { createroom_proxy: { encryption: "unsupported" } },
    }).success).toBe(false);
  });
});
