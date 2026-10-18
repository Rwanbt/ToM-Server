import { describe, expect, it, mock } from 'bun:test'
import updateKey from './updateKey'

const SENTINEL = 'SENTINEL_PRIVATE_KEY_MUST_NEVER_LEAK'

function harness(previous: unknown[], current: unknown[], failure?: Error) {
  const db = {
    get: mock(async (_table: string, _fields: string[], filter: { name: string }) => {
      if (failure) throw failure
      return filter.name === 'previousKey' ? previous : current
    }),
    update: mock(async () => {})
  }
  const logger = { info: mock(), error: mock() }
  return { db, logger, run: () => updateKey(db as never, logger as never) }
}

describe('long-term signing key rotation does not accept incomplete DB rows or leak secrets', () => {
  it('never rotates when the previous key is absent', async () => {
    const ctx = harness([], [{ keyID: 'ed25519:current', public: 'pub', private: SENTINEL }])
    await ctx.run()
    expect(ctx.db.update).not.toHaveBeenCalled()
  })

  it('never rotates when the current key is missing its private material', async () => {
    const ctx = harness([{ keyID: 'ed25519:previous' }], [{ keyID: 'ed25519:current', public: 'pub' }])
    await ctx.run()
    expect(ctx.db.update).not.toHaveBeenCalled()
  })

  it('never serializes a sensitive database exception to logging', async () => {
    const ctx = harness([], [], new Error(SENTINEL))
    await ctx.run()
    expect(ctx.db.update).not.toHaveBeenCalled()
    const logged = ctx.logger.error.mock.calls
      .flatMap(args => args.map(value => value instanceof Error ? `${value.message} ${value.stack}` : String(value)))
      .join(' ')
    expect(logged).not.toContain(SENTINEL)
  })
})
