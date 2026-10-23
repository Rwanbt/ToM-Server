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
  it('rejects array and object access_token query values before database or remote authentication', () => {
    for (const candidate of [['token1', 'token2'], { nested: 'token' }, '', 'mal formed', '  ', 42]) {
      const db = { get: mock() }
      const res = { writeHead: mock(), write: mock(), end: mock() }
      const logger = { warn: mock(), error: mock() }
      const req = { headers: {}, query: { access_token: candidate } }
      Authenticate(db as never, {} as never, logger as never)(req as never, res as never, () => {
        throw Error('malformed token must not authenticate')
      })
      expect(res.writeHead).toHaveBeenCalled()
      expect(db.get).not.toHaveBeenCalled()
    }
  })
  it('rejects an inherited query token without attempting remote whoami', () => {
    const db = { get: mock() }
    const logger = { warn: mock(), error: mock(), debug: mock(), info: mock() }
    const remote = mock()
    const response = { writeHead: mock(), write: mock(), end: mock() }
    const query = Object.create({ access_token: 'inherited-secret' })
    Authenticate(db as never, {} as never, logger as never, remote as never)(
      { headers: {}, query } as never, response as never,
      () => { throw Error('inherited query credentials must not authenticate') })
    expect(response.writeHead).toHaveBeenCalled()
    expect(db.get).not.toHaveBeenCalled()
    expect(remote).not.toHaveBeenCalled()
  })

  it('keeps supporting a single valid query token for Matrix whoami', async () => {
    const db = { get: mock(async () => []), insert: mock(async () => []) }
    const logger = { warn: mock(), error: mock(), debug: mock(), info: mock() }
    const remote = mock(async () => ({
      ok: true,
      json: async () => ({ user_id: '@alice:example.org' })
    }))
    const response = { writeHead: mock(), write: mock(), end: mock() }
    let complete!: (value: unknown) => void
    const authenticated = new Promise<unknown>(resolve => { complete = resolve })
    Authenticate(db as never, { matrix_server: 'example.org' } as never, logger as never, remote as never)(
      { headers: {}, query: { access_token: 'query-credential' } } as never,
      response as never, (data, token) => complete({ data, token }))
    expect(await authenticated).toEqual({
      data: { sub: '@alice:example.org', epoch: expect.any(Number) },
      token: 'query-credential'
    })
    expect(db.get).toHaveBeenCalledWith('matrixTokens', ['data'], { id: 'query-credential' })
    expect(remote).toHaveBeenCalledTimes(1)
  })

  it('does not authenticate a token from a non-success Matrix whoami response', async () => {
    const db = { get: mock(async () => []), insert: mock(async () => {}) }
    const logger = { warn: mock(), error: mock(), debug: mock(), info: mock() }
    let resolveStatus!: (code: number) => void
    const status = new Promise<number>(resolve => { resolveStatus = resolve })
    const response = { writeHead: mock((code: number) => resolveStatus(code)), write: mock(), end: mock() }
    const fetchWhoAmI = mock(async () => ({ ok: false, json: async () => ({ user_id: '@attacker:example.org' }) }))
    const callback = mock()
    Authenticate(db as never, { matrix_server: 'example.org' } as never, logger as never,
      fetchWhoAmI as never)(
        { headers: { authorization: 'Bearer invalid-token' } } as never, response as never, callback)
    expect(await status).toBe(401)
    expect(callback).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })
  it('continues to accept a successful Matrix whoami session', async () => {
    const db = { get: mock(async () => []), insert: mock(async () => {}) }
    const logger = { warn: mock(), error: mock(), debug: mock(), info: mock() }
    const fetchWhoAmI = mock(async () => ({ ok: true, json: async () => ({ user_id: '@alice:example.org' }) }))
    const response = { writeHead: mock(), write: mock(), end: mock() }
    let authenticated!: (value: unknown) => void
    const identity = new Promise<unknown>(resolve => { authenticated = resolve })
    Authenticate(db as never, { matrix_server: 'example.org' } as never, logger as never,
      fetchWhoAmI as never)(
        { headers: { authorization: 'Bearer valid-token' } } as never, response as never,
        value => authenticated(value))
    await expect(identity).resolves.toMatchObject({ sub: '@alice:example.org' })
  })
  it('does not trust malformed identity fields on HTTP-successful Matrix replies', async () => {
    for (const user_id of [' ', 'alice', '@missing-domain:', 42, null]) {
      const db = { get: mock(async () => []), insert: mock(async () => {}) }
      const logger = { warn: mock(), error: mock(), debug: mock(), info: mock() }
      const fetchWhoAmI = mock(async () => ({ ok: true, json: async () => ({ user_id }) }))
      const response = { writeHead: mock(), write: mock(), end: mock() }
      const callback = mock()
      Authenticate(db as never, { matrix_server: 'example.org' } as never, logger as never,
        fetchWhoAmI as never)(
          { headers: { authorization: 'Bearer untrusted-token' }, socket: { remoteAddress: '127.0.0.1' } } as never,
          response as never, callback)
      // Promise continuations must complete without ever caching an invalid subject.
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(db.insert).not.toHaveBeenCalled()
      expect(callback).not.toHaveBeenCalled()
    }
  })
  it('rejects malformed cached Matrix subjects and checks the authoritative server', async () => {
    const db = {
      get: mock(async (table: string) => table === 'accessTokens'
        ? []
        : [{ data: JSON.stringify({ sub: 'not-a-matrix-id', epoch: 123 }) }]),
      insert: mock()
    }
    const logger = { warn: mock(), error: mock(), debug: mock(), info: mock() }
    const remote = mock(async () => ({ ok: false, json: async () => ({ user_id: '@attacker:example.org' }) }))
    let resolveOutcome!: (outcome: string) => void
    const outcome = new Promise<string>(resolve => { resolveOutcome = resolve })
    const callback = mock(() => resolveOutcome('authenticated'))
    Authenticate(db as never, { matrix_server: 'example.org' } as never, logger as never, remote as never)(
      { headers: { authorization: 'Bearer cached-token' } } as never,
      { writeHead: (code: number) => resolveOutcome(String(code)), write: mock(), end: mock() } as never,
      callback)
    expect(await outcome).toBe('401')
    expect(callback).not.toHaveBeenCalled()
    expect(remote).toHaveBeenCalledTimes(1)
  })
  it('revalidates stale cached Matrix tokens instead of bypassing remote revocation', async () => {
    const db = {
      get: mock(async (table: string) => table === 'accessTokens'
        ? []
        : [{ data: JSON.stringify({ sub: '@alice:example.org', epoch: Date.now() - 3600000 }) }]),
      insert: mock()
    }
    const logger = { warn: mock(), error: mock(), debug: mock(), info: mock() }
    const remote = mock(async () => ({ ok: false, json: async () => ({ user_id: '@alice:example.org' }) }))
    let finish!: (value: string) => void
    const result = new Promise<string>(resolve => { finish = resolve })
    const callback = mock(() => finish('authenticated'))
    Authenticate(db as never, { matrix_server: 'example.org' } as never, logger as never, remote as never)(
      { headers: { authorization: 'Bearer revoked-token' } } as never,
      { writeHead: (status: number) => finish(String(status)), write: mock(), end: mock() } as never,
      callback)
    expect(await result).toBe('401')
    expect(callback).not.toHaveBeenCalled()
    expect(remote).toHaveBeenCalledTimes(1)
  })
  it('renews the timestamp of a stale token only after Matrix whoami succeeds', async () => {
    const db = {
      get: mock(async (table: string) => table === 'accessTokens'
        ? []
        : [{ data: JSON.stringify({ sub: '@alice:example.org', epoch: Date.now() - 3600000 }) }]),
      update: mock(async () => []),
      insert: mock(async () => [])
    }
    const logger = { warn: mock(), error: mock(), debug: mock(), info: mock() }
    const remote = mock(async () => ({ ok: true, json: async () => ({ user_id: '@alice:example.org' }) }))
    let complete!: () => void
    const completed = new Promise<void>(resolve => { complete = resolve })
    Authenticate(db as never, { matrix_server: 'example.org' } as never, logger as never, remote as never)(
      { headers: { authorization: 'Bearer stale-token' } } as never,
      { writeHead: mock(), write: mock(), end: mock() } as never,
      () => complete())
    await completed
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
    expect(db.update).toHaveBeenCalledWith(
      'matrixTokens', expect.objectContaining({ data: expect.stringContaining('@alice:example.org') }),
      'id', 'stale-token')
  })
})
