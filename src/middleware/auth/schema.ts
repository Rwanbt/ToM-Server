import { z } from "zod";

const DEFAULT_TOKEN_CACHE_SIZE = 1000;
const DEFAULT_TOKEN_CACHE_TTL_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export const authSettingsSchema: z.ZodObject<{
  token_cache_size: z.ZodDefault<z.ZodNumber>;
  token_cache_ttl_ms: z.ZodDefault<z.ZodNumber>;
  timeout_ms: z.ZodDefault<z.ZodNumber>;
}> = z.object({
  token_cache_size: z.number().int().positive().default(DEFAULT_TOKEN_CACHE_SIZE),
  token_cache_ttl_ms: z.number().int().positive().default(DEFAULT_TOKEN_CACHE_TTL_MS),
  timeout_ms: z.number().int().positive().default(DEFAULT_TIMEOUT_MS),
});

export const whoamiSchema: z.ZodObject<{ user_id: z.ZodString }> = z.object({
  user_id: z.string().min(1),
});
