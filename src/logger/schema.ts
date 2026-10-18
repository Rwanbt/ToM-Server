import { z } from "zod";

const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_LOG_PRETTY = false;

type LoggerSettingsShape = {
  level: z.ZodDefault<
    z.ZodEnum<{
      error: "error";
      warn: "warn";
      info: "info";
      http: "http";
      debug: "debug";
      silly: "silly";
    }>
  >;
  pretty: z.ZodDefault<z.ZodBoolean>;
};

export const loggerSettingsSchema: z.ZodObject<LoggerSettingsShape> = z.object({
  level: z
    .enum([
      "error",
      "warn",
      "info",
      "http",
      "debug",
      "silly",
    ])
    .default(DEFAULT_LOG_LEVEL),
  pretty: z.boolean().default(DEFAULT_LOG_PRETTY),
});
