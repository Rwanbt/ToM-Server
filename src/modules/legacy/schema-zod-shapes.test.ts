import { expect, it } from "bun:test";

import { z } from "zod";

import { legacyConfigSchema } from "./schema";

it("legacy ZodObject retains original flat defaults and optional LDAP settings", () => {
  expect(legacyConfigSchema).toBeInstanceOf(z.ZodObject);
  expect(legacyConfigSchema.shape.matrix_database_engine.parse(undefined)).toBe("pg");
  expect(legacyConfigSchema.shape.database_engine.parse(undefined)).toBe("pg");
  expect(legacyConfigSchema.shape.smtp_server.parse(undefined)).toBe("");
  expect(legacyConfigSchema.shape.mail_link_delay.parse(undefined)).toBe(7200);
  expect(
    legacyConfigSchema.shape.ldapts_opts.parse({
      connectTimeout: 1200,
    }),
  ).toEqual({
    connectTimeout: 1200,
  });
  expect(legacyConfigSchema.shape.userdb_engine.safeParse("ldap").success).toBe(true);
  expect(legacyConfigSchema.shape.userdb_engine.safeParse("sql").success).toBe(false);
});

it("retains strict nested features and validates Matrix power-level events", () => {
  const features: z.input<typeof legacyConfigSchema.shape.features> = {
    common_settings: {
      enabled: true,
      application_url: "http://fixture.invalid",
    },
    matrix_profile_updates_allowed: false,
    user_profile: {
      default_visibility_settings: {
        visibility: "private",
        visible_fields: [],
      },
    },
    user_directory: {
      enabled: false,
    },
    createroom_proxy: {
      is_direct_mask: {
        events: {
          "m.room.name": 50,
        },
      },
    },
  };
  const validated: z.output<typeof legacyConfigSchema.shape.features> =
    legacyConfigSchema.shape.features.parse(features);
  expect(validated.createroom_proxy?.is_direct_mask?.events?.["m.room.name"]).toBe(50);
  expect(
    legacyConfigSchema.shape.features.safeParse({
      ...features,
      createroom_proxy: {
        is_direct_mask: {
          events: {
            "m.room.name": "invalid",
          },
        },
      },
    }).success,
  ).toBe(false);
  expect(
    legacyConfigSchema.shape.features.safeParse({
      ...features,
      user_directory: {
        enabled: "true",
      },
    }).success,
  ).toBe(false);
});

it("allows boolean and structured SSL options without coercing their types", () => {
  expect(legacyConfigSchema.shape.database_ssl.parse(true)).toBe(true);
  expect(
    legacyConfigSchema.shape.database_ssl.parse({
      rejectUnauthorized: true,
    }),
  ).toEqual({
    rejectUnauthorized: true,
  });
  expect(legacyConfigSchema.shape.database_ssl.safeParse(1234).success).toBe(false);
});
