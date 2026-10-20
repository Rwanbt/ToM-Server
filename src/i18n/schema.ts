import { z } from "zod";

const DEFAULT_LOCALE = "en";
export const DEFAULT_I18N_DIRNAME = "i18n";

// Preserve the precise public schema contract under isolatedDeclarations.
// A generic ZodType would lose the optional input/default output distinction.
type I18nSettingsShape = {
  locale: z.ZodDefault<z.ZodString>;
  locales_path: z.ZodOptional<z.ZodString>;
};

export const i18nSettingsSchema: z.ZodObject<I18nSettingsShape> = z.object({
  locale: z.string().default(DEFAULT_LOCALE),
  locales_path: z.string().optional(),
});
