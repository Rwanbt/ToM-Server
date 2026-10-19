import { expect, mock, test } from 'bun:test'
import SQLite from './sqlite'

const fakeFailingSQLite = (error: string | Error = 'constraint') => {
  const logged: unknown[][] = []
  const db = Object.assign(Object.create(SQLite.prototype), {
    logger: {
      debug: mock((...arguments_: unknown[]) => { logged.push(arguments_) }),
      error: mock((...arguments_: unknown[]) => { logged.push(arguments_) })
    },
    db: {
      prepare: () => ({
        all: (_values: unknown, callback: (error: string | Error, rows: object[]) => void) => callback(error, []),
        finalize: (callback: (error: null) => void) => callback(null)
      }),
      run: (_query: string, callback: (error: string | Error) => void) => callback(error)
    }
  }) as SQLite<'matrixTokens'>
  return { db, logged }
}

test('failed parameterized SQLite insert never logs credentials or payload values', async () => {
  const secret = 'BEARER_PRIVATE_SENTINEL_c7da35'
  const { db, logged } = fakeFailingSQLite()

  await expect(db.insert('matrixTokens', { id: secret, data: JSON.stringify({ token: secret }) }))
    .rejects.toBe('constraint')
  expect(logged.length).toBeGreaterThan(0)
  expect(JSON.stringify(logged)).not.toContain(secret)
})

test('failed SQLite match and filtered deletion never log bound search values', async () => {
  const secret = 'PRIVATE_SEARCH_SENTINEL_321b'
  const { db, logged } = fakeFailingSQLite()
  await expect(db.match('matrixTokens', ['data'], ['id'], secret)).rejects.toBe('constraint')
  await expect(db.deleteWhere('matrixTokens', { field: 'id', operator: '=', value: secret }))
    .rejects.toBe('constraint')
  expect(JSON.stringify(logged)).not.toContain(secret)
})

test('raw SQL execution errors never log sensitive SQL text', async () => {
  const secret = 'PRIVATE_SQL_LITERAL_27d8'
  const driverError = Object.assign(new Error(`invalid SQL near '${secret}'`), { code: 'SQLITE_ERROR' })
  const { db, logged } = fakeFailingSQLite(driverError)
  await expect(db.rawQuery(`SELECT '${secret}'`)).rejects.toBe(driverError)
  expect(JSON.stringify(logged)).not.toContain(secret)
  expect(JSON.stringify(logged)).toContain('SQLITE_ERROR')
})
