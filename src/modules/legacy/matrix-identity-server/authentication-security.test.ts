import { describe, expect, it, mock } from 'bun:test'
import { Authenticate } from './utils'

const SECRET = 'SENTINEL_PRIVATE_MATRIX_TOKEN_8c9221'

function response() {
  let resolve!: (status: number) => void
  const done = new Promise<number>(r => { resolve = r })
  let status = 0
  const res = {
    writeHead: (code: number) => { status = code },
    write: () => undefined,
    end: () => resolve(status)
  }
  return { res, done }
}

function request() {
  return {
    headers: { authorization: `Bearer ${SECRET}` },
    socket: { remoteAddress: '192.0.2.10' }
  }
}

function logging() {
  const entries: unknown[][] = []
  const logger = {
    error: mock((...args: unknown[]) => { entries.push(args) }),
    warn: mock((...args: unknown[]) => { entries.push(args) })
  }
  return { logger, entries }
}

function loggedText(entries: unknown[][]): string {
  return entries.flat().map(value => value instanceof Error ? value.message : String(value)).join(' ')
}

describe('identity token logs must never expose bearer credentials', () => {
  it('preserves successful authenticated callbacks without recording credentials', async () => {
    const { logger, entries } = logging()
    const db = { get: mock().mockResolvedValue([{ data: JSON.stringify({ sub: '@safe:example.org' }) }]) }
    const { res } = response()
    let received: unknown = null
    Authenticate(db as any, logger as any)(request() as any, res as any, (data, token) => {
      received = { data, token }
    }, false)
    await Promise.resolve()
    expect(received).toEqual({ data: { sub: '@safe:example.org' }, token: SECRET })
    expect(loggedText(entries)).not.toContain(SECRET)
  })

  it('fails closed for an unknown token without logging its value', async () => {
    const { logger, entries } = logging()
    const { res, done } = response()
    const db = { get: mock().mockResolvedValue([]) }
    Authenticate(db as any, logger as any)(request() as any, res as any, () => {
      throw Error('unexpected authentication')
    })
    expect(await done).toBe(401)
    expect(db.get).toHaveBeenCalledWith('accessTokens', ['data'], { id: SECRET })
    expect(loggedText(entries)).not.toContain(SECRET)
  })

  it('redacts database errors that echo a provided bearer token', async () => {
    const { logger, entries } = logging()
    const { res, done } = response()
    const db = { get: mock().mockRejectedValue(new Error(`db lookup failed for ${SECRET}`)) }
    Authenticate(db as any, logger as any)(request() as any, res as any, () => {
      throw Error('unexpected authentication')
    })
    expect(await done).toBe(401)
    expect(loggedText(entries)).not.toContain(SECRET)
  })

  it('rejects a stored token without a valid Matrix subject', async () => {
    const { logger } = logging()
    const { res } = response()
    const callback = mock()
    const db = { get: mock().mockResolvedValue([{ data: JSON.stringify({ role: 'admin' }) }]) }
    Authenticate(db as never, logger as never)(request() as never, res as never, callback, false)
    await Promise.resolve()
    await Promise.resolve()
    expect(callback).not.toHaveBeenCalled()
  })
})
