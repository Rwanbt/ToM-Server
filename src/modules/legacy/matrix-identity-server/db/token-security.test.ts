import { describe, expect, test } from "bun:test";
import type { TwakeLogger } from "../../logger/index";
import IdentityServerDb, { type Collections, type IdDbBackend } from "./index";

type TokenDb = IdDbBackend<Collections>;

function fixture(overrides: Partial<TokenDb>): IdentityServerDb {
  // This exercises the *real* production methods without starting a database,
  // cron timer, real credentials, or services in the caller's environment.
  const instance = Object.create(IdentityServerDb.prototype) as IdentityServerDb;
  instance.db = overrides as TokenDb;
  Object.defineProperty(instance, "logger", {
    value: { error: () => undefined, info: () => undefined } as unknown as TwakeLogger,
  });
  return instance;
}

describe("identity DB token fail-closed behavior", () => {
  test("does not silently hang if one-time token INSERT fails", async () => {
    const db = fixture({ insert: async () => { throw Error("database offline"); } });
    // A short bounded race also catches an unresolved promise instead of
    // allowing CI to hang forever. The rejected branch wins deterministically.
    const observed = await Promise.race([
      db.createOneTimeToken({ sub: "test" }).then(
        () => "unexpected success",
        (error: unknown) => error instanceof Error ? error.message : "unexpected non-Error",
      ),
      Bun.sleep(500).then(() => "PENDING"),
    ]);
    expect(observed).toBe("database offline");
  });

  test("rejects an unknown token without reading a nonexistent row", async () => {
    const db = fixture({ get: async () => [] });
    await expect(db.verifyToken("redacted-token-id")).rejects.toThrow("Unknown token");
  });

  test("rejects an expired one-time token without disclosing token content", async () => {
    const db = fixture({ get: async () => [{ data: JSON.stringify({ sub: "sensitive" }), expires: 0 }] });
    await expect(db.verifyToken("opaque-token")).rejects.toThrow("Token expired");
  });

  test("rejects a failed delete instead of falsely treating a token as consumed", async () => {
    const db = fixture({ deleteEqual: async () => { throw Error("write denied"); } });
    await expect(db.deleteToken("never-print-this-secret")).rejects.toThrow("write denied");
  });

  test("one-time verification fails if consumption of the token fails", async () => {
    const db = fixture({
      get: async () => [{ data: JSON.stringify({ sub: "user" }), expires: Date.now() + 100000 }],
      deleteEqual: async () => { throw Error("write denied"); },
    });
    await expect(db.verifyOneTimeToken("opaque-secret")).rejects.toThrow("write denied");
  });

  test("key deletion failure propagates rather than reporting revocation success", async () => {
    const db = fixture({ deleteEqual: async () => { throw Error("write denied"); } });
    await expect(db.deleteKey("key-id-secret")).rejects.toThrow("write denied");
  });

  test("key lookup with no rows fails with a stable error", async () => {
    const db = fixture({ getAll: async () => [] });
    await expect(db.getKeys("current")).rejects.toThrow("No currentKey found");
  });
});
