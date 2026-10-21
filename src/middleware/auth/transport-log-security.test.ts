import { describe, expect, it, mock } from "bun:test";

import { DomainError } from "../../errors/domain-error";
import { loadMessages } from "../../i18n/index";
import { TokenValidator } from "./index";

describe("Matrix whoami transport diagnostics", () => {
  it("must not log or surface a bearer token echoed by a transport failure", async () => {
    const token = "SENTINEL_PRIVATE_MATRIX_BEARER_NOT_FOR_LOGS_57391";
    const originalFetch = globalThis.fetch;
    const logged: unknown[][] = [];
    const warn = mock((...args: unknown[]) => { logged.push(args); });
    const requested = mock();
    // Production boot loads the English warning template, which interpolates
    // the transport reason. Without this, the unloaded i18n fallback hides
    // the actual credential disclosure and creates a false-green test.
    const logger = { warn, debug: () => {}, info: () => {}, error: () => {} };
    expect(loadMessages("assets/i18n", logger as never)).toBe(true);
    // Exercise the real TokenValidator -> HttpClient -> fetch error path.
    globalThis.fetch = (async (_url: unknown, init?: { headers?: unknown }) => {
      requested(init?.headers);
      throw new Error(`network adapter failed: Authorization: Bearer ${token}`);
    }) as unknown as typeof fetch;

    try {
      const validator = new TokenValidator(
        {
          serverUrl: "https://matrix.example.invalid",
          serverName: "example.invalid",
          timeoutMs: 1000,
          tokenCacheSize: 10,
          tokenCacheTtlMs: 60000,
        },
        logger as never,
      );
      const error = await new Promise<unknown>((resolve) => {
        validator.middleware()(
          { headers: { authorization: `Bearer ${token}` } } as never,
          {} as never,
          (err?: unknown) => resolve(err),
        );
      });

      expect(requested).toHaveBeenCalledTimes(1);
      expect(requested.mock.calls[0]?.[0]).toEqual({ Authorization: `Bearer ${token}` });
      expect(error).toBeInstanceOf(DomainError);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(logged)).not.toContain(token);
      expect(String(error)).not.toContain(token);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
