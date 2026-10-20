import { describe, expect, it, mock } from 'bun:test'
import Pg from './pg'
import SQLite from './sqlite'

const credential = 'TWAKEDB_PRIVATE_ACCESS_TOKEN_875'

function loggerFixture() {
  const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() }
  const logs = () => Bun.inspect([...logger.debug.mock.calls, ...logger.error.mock.calls])
  return { logger, logs }
}

describe('legacy shared DB diagnostics privacy', () => {
  it('does not log private filter values or driver exceptions on PostgreSQL deleteWhere', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(Pg.prototype) as Pg<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { query: (_q: string, _v: unknown[], cb: (error: Error) => void) => cb(Error(credential)) } as never
    await expect(db.deleteWhere('tokens', { field: 'id', operator: '=', value: credential })).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not log private filter values or driver exceptions on SQLite deleteWhere', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(SQLite.prototype) as SQLite<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { prepare: () => ({
      all: (_v: unknown[], cb: (error: Error) => void) => cb(Error(credential)),
      finalize: (cb: (error: null) => void) => cb(null)
    }) } as never
    await expect(db.deleteWhere('tokens', { field: 'id', operator: '=', value: credential })).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not log update error credentials in PostgreSQL', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(Pg.prototype) as Pg<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { query: (_q: string, _v: unknown[], cb: (error: Error) => void) => cb(Error(credential)) } as never
    await expect(db.update('tokens', { id: credential }, 'id', credential)).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not log update error credentials in SQLite', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(SQLite.prototype) as SQLite<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { prepare: () => ({
      all: (_v: unknown[], cb: (error: Error) => void) => cb(Error(credential)),
      finalize: (cb: (error: null) => void) => cb(null)
    }) } as never
    await expect(db.update('tokens', { id: credential }, 'id', credential)).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })
  it('does not disclose inline SQL join conditions from PostgreSQL SELECT diagnostics', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(Pg.prototype) as Pg<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { query: (_q: string, _v: unknown[], cb: (error: Error) => void) => cb(Error(credential)) } as never
    await expect(db._get(['tokens'], ['id'], undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { 'tokens.id': `'${credential}'` })).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not disclose inline SQL join conditions from SQLite SELECT diagnostics', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(SQLite.prototype) as SQLite<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { prepare: () => ({
      all: (_v: unknown[], cb: (error: Error) => void) => cb(Error(credential)),
      finalize: (cb: (error: null) => void) => cb(null)
    }) } as never
    await expect(db._get(['tokens'], ['id'], undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { 'tokens.id': `'${credential}'` })).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })
  it('does not disclose inline join data from PostgreSQL aggregate diagnostics', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(Pg.prototype) as Pg<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { query: (_q: string, _v: unknown[], cb: (error: Error) => void) => cb(Error(credential)) } as never
    await expect(db._getMinMax('MAX', ['tokens'], 'id', ['id'],
      undefined, undefined, undefined, undefined, undefined,
      { 'tokens.id': `'${credential}'` })).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not disclose inline join data from SQLite aggregate diagnostics', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(SQLite.prototype) as SQLite<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { prepare: () => ({
      all: (_v: unknown[], cb: (error: Error) => void) => cb(Error(credential)),
      finalize: (cb: (error: null) => void) => cb(null)
    }) } as never
    await expect(db._getMinMax('MAX', ['tokens'], 'id', ['id'],
      undefined, undefined, undefined, undefined, undefined,
      { 'tokens.id': `'${credential}'` })).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })
  it('does not expose raw SQL or driver errors in PostgreSQL raw queries', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(Pg.prototype) as Pg<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { query: mock(async () => { throw Error(credential) }) } as never
    await expect(db.rawQuery(`SELECT '${credential}'`)).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not expose raw SQL or driver errors in SQLite raw queries', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(SQLite.prototype) as SQLite<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { run: (_query: string, cb: (error: Error) => void) => cb(Error(credential)) } as never
    await expect(db.rawQuery(`SELECT '${credential}'`)).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not disclose PostgreSQL insert values on rejected writes', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(Pg.prototype) as Pg<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { query: (_q: string, _v: unknown[], cb: (error: Error) => void) => cb(Error(credential)) } as never
    await expect(db.insert('tokens', { id: credential })).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not disclose SQLite insert values on rejected writes', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(SQLite.prototype) as SQLite<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = {
      prepare: () => ({
        all: (_values: unknown[], cb: (error: Error) => void) => cb(Error(credential)),
        finalize: (cb: (error: null) => void) => cb(null)
      })
    } as never
    await expect(db.insert('tokens', { id: credential })).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not log search values on failed PostgreSQL LIKE matches', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(Pg.prototype) as Pg<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = { query: (_query: string, _values: unknown[], cb: (error: Error) => void) => cb(Error(credential)) } as never
    await expect(db.match('tokens', ['id'], ['id'], credential)).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })

  it('does not log search values on failed SQLite LIKE matches', async () => {
    const { logger, logs } = loggerFixture()
    const db = Object.create(SQLite.prototype) as SQLite<'tokens'>
    Object.defineProperty(db, 'logger', { value: logger })
    db.db = {
      prepare: () => ({
        all: (_values: unknown[], cb: (error: Error) => void) => cb(Error(credential)),
        finalize: (cb: (error: null) => void) => cb(null)
      })
    } as never
    await expect(db.match('tokens', ['id'], ['id'], credential)).rejects.toThrow(credential)
    expect(logs()).not.toContain(credential)
  })
})
