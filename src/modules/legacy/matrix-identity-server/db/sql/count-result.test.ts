import { describe, expect, test } from 'bun:test'
import IdentitySql from './sql'
import LegacySql from '../../../db/sql/sql'

// Invoke the actual SQL getCount implementation while replacing only the
// driver result. SQLite returns numbers; PostgreSQL may return text counts.
for (const [name, SQL] of [
  ['identity', IdentitySql],
  ['legacy', LegacySql]
] as const) {
  describe(`${name} SQL count response`, () => {
    for (const count of [0, 3, '0', '13']) {
      test(`accepts safe count ${JSON.stringify(count)}`, async () => {
        const connection = Object.assign(Object.create(SQL.prototype), {
          get: async () => [{ count }]
        })
        expect(await connection.getCount('users', 'id')).toBe(Number(count))
      })
    }

    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '-1', '1e3', 'NaN', null, undefined]) {
      test(`rejects malformed count ${JSON.stringify(count)}`, async () => {
        const connection = Object.assign(Object.create(SQL.prototype), {
          get: async () => [{ count }]
        })
        await expect(connection.getCount('users', 'id')).rejects.toThrow(
          'Database count response is missing or malformed'
        )
      })
    }

    test('rejects missing database rows instead of treating them as zero', async () => {
      const connection = Object.assign(Object.create(SQL.prototype), {
        get: async () => []
      })
      await expect(connection.getCount('users', 'id')).rejects.toThrow(
        'Database count response is missing or malformed'
      )
    })
  })
}
