import { describe, expect, it, mock } from 'bun:test'
import Pg from './pg'

describe('PostgreSQL identity queries do not disclose credentials in diagnostics', () => {
  it('keeps PostgreSQL connection and background error credentials out of logs', async () => {
    const secret = 'private-postgres-connection-password-817'
    const logger = { info: mock(), error: mock(), debug: mock() }
    class FakePool {
      private errorHandler?: (error: Error) => void
      on(_event: string, handler: (error: Error) => void): this {
        this.errorHandler = handler
        return this
      }
      async query(): Promise<never> {
        this.errorHandler?.(new Error(secret))
        throw new Error(secret)
      }
      async end(): Promise<void> {}
    }
    const database = Object.create(Pg.prototype) as Pg<string>
    Object.defineProperty(database, 'logger', { value: logger })
    const poolLoader = database as unknown as {
      createVerifiedPool: (
        pg: unknown,
        options: { host: string; ssl: boolean },
        label: string
      ) => Promise<unknown>
    }

    await expect(poolLoader.createVerifiedPool(
      { Pool: FakePool },
      { host: '127.0.0.1', ssl: false },
      'identity-pg'
    )).rejects.toThrow(secret)
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(Bun.inspect(logger.error.mock.calls)).not.toContain(secret)
    expect(Bun.inspect(logger.info.mock.calls)).not.toContain(secret)
  })
  it('does not log private lookup values or database exceptions from LIKE matching', async () => {
    const secret = 'private-lookup-query-secret-974'
    const logger = { debug: mock(), error: mock(), info: mock() }
    const pool = {
      query: mock((_sql: string, _args: unknown[], callback: (error: Error) => void) => {
        callback(new Error(secret))
      })
    }
    const database = Object.create(Pg.prototype) as Pg<string>
    database.db = pool as never
    Object.defineProperty(database, 'logger', { value: logger })

    await expect(database.match('mappings', ['address'], ['address'], secret))
      .rejects.toThrow(secret)
    expect(pool.query).toHaveBeenCalledTimes(1)
    expect(Bun.inspect(logger.debug.mock.calls)).not.toContain(secret)
    expect(Bun.inspect(logger.error.mock.calls)).not.toContain(secret)
  })
  it('never logs SQL query values or provider errors on a failed query', async () => {
    const secret = 'matrix-identity-sql-bearer-secret-974'
    const query = `SELECT * FROM accessTokens WHERE id = '${secret}'`
    const logger = { debug: mock(), error: mock(), info: mock() }
    const pool = { query: mock(async () => { throw Error(secret) }) }
    const database = Object.create(Pg.prototype) as Pg<string>
    database.db = pool as never
    Object.defineProperty(database, 'logger', { value: logger })

    await expect(database.rawQuery(query)).rejects.toThrow(secret)
    expect(pool.query).toHaveBeenCalledWith(query)
    expect(Bun.inspect(logger.debug.mock.calls)).not.toContain(secret)
    expect(Bun.inspect(logger.error.mock.calls)).not.toContain(secret)
    expect(logger.error).toHaveBeenCalledWith('[Pg][rawQuery] Query failed')
  })
})
