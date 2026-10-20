import { describe, expect, it, mock } from 'bun:test'
import Pg from './pg'

describe('PostgreSQL identity queries do not disclose credentials in diagnostics', () => {
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
