import { describe, expect, it, mock } from 'bun:test'
import TwakeSql from './sql'
import MatrixSql from '../../matrix-identity-server/db/sql/sql'

describe('legacy SQL count responses are validated before parsing', () => {
  for (const [label, Sql] of [['Twake', TwakeSql], ['Matrix identity', MatrixSql]] as const) {
    it(`${label}: accepts a valid integer result`, async () => {
      const context = { get: mock(async () => [{ count: '15' }]) }
      await expect(Sql.prototype.getCount.call(context as never, 'users' as never, 'id'))
        .resolves.toBe(15)
    })

    it(`${label}: rejects an absent result without silently returning NaN`, async () => {
      const context = { get: mock(async () => []) }
      await expect(Sql.prototype.getCount.call(context as never, 'users' as never, 'id'))
        .rejects.toThrow('missing or malformed')
    })

    it(`${label}: rejects truncated or non-integer count values`, async () => {
      const context = { get: mock(async () => [{ count: '12garbage' }]) }
      await expect(Sql.prototype.getCount.call(context as never, 'users' as never, 'id'))
        .rejects.toThrow('missing or malformed')
    })
  }
})
