import { resolve } from "node:path";

import { z } from "zod";

const defaultPath = (): string => {
  const prefix = process.platform === "win32" ? (process.env.PROGRAMDATA ?? "C:\\ProgramData") : "/usr/share";

  return resolve(prefix, "twake", "chat", "tom", "static", "landing.html");
};

type LandingSettingsShape = {
  file_path: z.ZodDefault<z.ZodString>;
};

export const landingSettingsSchema: z.ZodObject<LandingSettingsShape> = z.object({
  file_path: z.string().default(defaultPath()),
});
