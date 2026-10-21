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

  it('accepts a single well-formed query token for legacy Matrix clients', async () => {
    const { logger, entries } = logging()
    const { res } = response()
    const db = { get: mock().mockResolvedValue([{ data: JSON.stringify({ sub: '@safe:example.org' }) }]) }
    let result: unknown = null
    const req = { ...request(), headers: {}, query: { access_token: SECRET } }
    Authenticate(db as never, logger as never)(req as never, res as never, (data, token) => {
      result = { data, token }
    }, false)
    await Promise.resolve()
    expect(db.get).toHaveBeenCalledWith('accessTokens', ['data'], { id: SECRET })
    expect(result).toEqual({ data: { sub: '@safe:example.org' }, token: SECRET })
    expect(loggedText(entries)).not.toContain(SECRET)
  })

  const malformedTokens: Array<{ name: string; value: unknown }> = [
    { name: 'array of repeated query parameters', value: [SECRET, 'another'] },
    { name: 'nested query object', value: { nested: SECRET } },
    { name: 'empty string', value: '' },
    { name: 'whitespace-bearing string', value: 'part one' },
    { name: 'non-string number', value: 12 }
  ]
  for (const { name, value } of malformedTokens) {
    it('rejects ' + name + ' before database access', async () => {
      const { logger, entries } = logging()
      const { res, done } = response()
      const db = { get: mock().mockResolvedValue([{ data: JSON.stringify({ sub: '@safe:example.org' }) }]) }
      const callback = mock()
      const req = { ...request(), headers: {}, query: { access_token: value } }
      Authenticate(db as never, logger as never)(req as never, res as never, callback, false)
      expect(await done).toBe(401)
      expect(db.get).not.toHaveBeenCalled()
      expect(callback).not.toHaveBeenCalled()
      expect(loggedText(entries)).not.toContain(SECRET)
    })
  }

})
