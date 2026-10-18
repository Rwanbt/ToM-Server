import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 10000;
const REQUIRED_WHEN_ENABLED = [
  "base_url",
  "client_id",
  "client_secret",
] as const;

type VisioSettingsShape = {
  enabled: z.ZodDefault<z.ZodBoolean>;
  base_url: z.ZodOptional<z.ZodURL>;
  client_id: z.ZodOptional<z.ZodString>;
  client_secret: z.ZodOptional<z.ZodString>;
  room_access_level: z.ZodOptional<
    z.ZodEnum<{
      public: "public";
      trusted: "trusted";
      restricted: "restricted";
    }>
  >;
  timeout_ms: z.ZodDefault<z.ZodNumber>;
};

export const visioSettingsSchema: z.ZodObject<VisioSettingsShape> = z
  .object({
    enabled: z.boolean().default(false),
    base_url: z.url().optional(),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    room_access_level: z
      .enum([
        "public",
        "trusted",
        "restricted",
      ])
      .optional(),
    timeout_ms: z.number().int().positive().default(DEFAULT_TIMEOUT_MS),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    for (const key of REQUIRED_WHEN_ENABLED) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [
            key,
          ],
          message: `visio.${key} is required when visio.enabled is true`,
        });
      }
    }
  });

export const visioTokenResponseSchema: z.ZodObject<{
  access_token: z.ZodString;
}> = z.object({
  access_token: z.string().min(1),
});

export const visioRoomResponseSchema: z.ZodObject<{
  url: z.ZodURL;
}> = z.object({
  url: z.url(),
});

export const threepidsSchema: z.ZodObject<{
  threepids: z.ZodArray<
    z.ZodObject<{
      medium: z.ZodString;
      address: z.ZodString;
    }>
  >;
}> = z.object({
  threepids: z.array(
    z.object({
      medium: z.string(),
      address: z.string(),
    }),
  ),
});
