import { telemetrySettingsSchema } from "../telemetry/schema";

import { describe, expect, it } from "bun:test";

import { i18nSettingsSchema } from "../i18n/schema";
import { loggerSettingsSchema } from "../logger/schema";
import { landingSettingsSchema } from "../modules/landing/schema";

// Public Zod object types must preserve input defaults, validation and
// materialized output; strict declaration typing cannot replace schemas with
// a generic ZodType<unknown> just to make declaration generation green.
describe("strictly typed public configuration schemas", () => {
  it("preserves locale defaults and optional path", () => {
    expect(i18nSettingsSchema.parse({})).toEqual({
      locale: "en",
    });
    expect(
      i18nSettingsSchema.parse({
        locales_path: "./translations",
      }),
    ).toEqual({
      locale: "en",
      locales_path: "./translations",
    });
    expect(
      i18nSettingsSchema.safeParse({
        locale: 2,
      }).success,
    ).toBe(false);
  });

  it("enforces logger severity and pretty defaults", () => {
    expect(loggerSettingsSchema.parse({})).toEqual({
      level: "info",
      pretty: false,
    });
    expect(
      loggerSettingsSchema.parse({
        level: "warn",
      }).level,
    ).toBe("warn");
    expect(
      loggerSettingsSchema.safeParse({
        level: "TRACE",
      }).success,
    ).toBe(false);
  });

  it("enforces bounded telemetry sampling and protocol-valid endpoint", () => {
    const defaults = telemetrySettingsSchema.parse({});
    expect(defaults.enabled).toBe(true);
    expect(defaults.trace_sample_ratio).toBe(1);
    expect(defaults.diag_log_level).toBe("NONE");
    expect(
      telemetrySettingsSchema.safeParse({
        trace_sample_ratio: 1.01,
      }).success,
    ).toBe(false);
    expect(
      telemetrySettingsSchema.safeParse({
        trace_sample_ratio: -0.1,
      }).success,
    ).toBe(false);
    expect(
      telemetrySettingsSchema.safeParse({
        otlp_endpoint: "not a URL",
      }).success,
    ).toBe(false);
    expect(
      telemetrySettingsSchema.parse({
        trace_sample_ratio: 0,
      }).trace_sample_ratio,
    ).toBe(0);
  });

  it("supplies a deterministic landing file path with the correct name", () => {
    const path = landingSettingsSchema.parse({}).file_path;
    expect(path).toMatch(/[\\/]twake[\\/]chat[\\/]tom[\\/]static[\\/]landing\.html$/);
    expect(
      landingSettingsSchema.safeParse({
        file_path: null,
      }).success,
    ).toBe(false);
  });
});
