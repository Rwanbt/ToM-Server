import { describe, expect, it, mock } from 'bun:test'
import Authenticate from './authenticate'

describe('legacy ToM login log hygiene', () => {
  it('never logs request headers when no access token is provided', () => {
    const SECRET = 'SENTINEL_PRIVATE_COOKIE_d9200f'
    const entries: unknown[][] = []
    const logger = {
      warn: mock((...args: unknown[]) => { entries.push(args) }),
      error: mock((...args: unknown[]) => { entries.push(args) })
    }
    const db = { get: mock() }
    const res = { writeHead: mock(), write: mock(), end: mock() }
    const req = { headers: { cookie: SECRET }, socket: { remoteAddress: '192.0.2.42' } }
    Authenticate(db as any, {} as any, logger as any)(req as any, res as any, () => {
      throw Error('unexpected authentication')
    })
    expect(res.writeHead).toHaveBeenCalled()
    expect(JSON.stringify(entries)).not.toContain(SECRET)
  })
})
