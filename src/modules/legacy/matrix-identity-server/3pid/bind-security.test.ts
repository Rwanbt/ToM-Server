import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import bind from './bind'

const SECRET = 'SENTINEL_BIND_CLIENT_SECRET_9A1'

async function requestBind(body: object, rowsByTable: Record<string, unknown[]> = {}) {
  const messages: unknown[][] = []
  const logger = {
    debug: mock((...args: unknown[]) => { messages.push(args) }),
    info: mock((...args: unknown[]) => { messages.push(args) }),
    warn: mock((...args: unknown[]) => { messages.push(args) }),
    error: mock((...args: unknown[]) => { messages.push(args) })
  }
  const db = {
    get: mock(async (table: string) => rowsByTable[table] ?? []),
    insert: mock(async () => undefined),
    listInvitationTokens: mock(async () => [])
  }
  const handler = bind({
    authenticate: (_req: unknown, _res: unknown, next: (...args: unknown[]) => void) => next({}, null),
    logger,
    db
  } as never)
  const server = createServer((req, res) => handler(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a local TCP server')
    const response = await fetch(`http://127.0.0.1:${address.port}/_matrix/identity/v2/3pid/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return { status: response.status, payload: await response.json(), messages, db }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

describe('Matrix 3pid binding HTTP secret handling', () => {
  it('returns a real 404 for unknown sessions without logging the client secret', async () => {
    const result = await requestBind({
      client_secret: SECRET,
      mxid: '@user:example.org',
      sid: 'sid-1'
    })
    expect(result.status).toBe(404)
    expect(result.payload.errcode).toBe('M_NO_VALID_SESSION')
    expect(result.db.get).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result.messages)).not.toContain(SECRET)
  })

  it('rejects an invalid client secret before any database access', async () => {
    const result = await requestBind({ client_secret: 'bad', mxid: '@user:example.org', sid: 'sid-1' })
    expect(result.status).toBe(400)
    expect(result.db.get).not.toHaveBeenCalled()
  })

  it('returns a bounded 500 when the cryptographic pepper is missing', async () => {
    const result = await requestBind({ client_secret: SECRET, mxid: '@user:example.org', sid: 'sid-1' }, {
      mappings: [{ address: 'person@example.org', medium: 'email', submit_time: 12, valid: 1 }]
    })
    expect(result.status).toBe(500)
    expect(result.db.insert).not.toHaveBeenCalled()
    expect(JSON.stringify(result.messages)).not.toContain(SECRET)
  })

  it('never leaves the HTTP response hanging without a signing keypair', async () => {
    const result = await requestBind({ client_secret: SECRET, mxid: '@user:example.org', sid: 'sid-1' }, {
      mappings: [{ address: 'person@example.org', medium: 'email', submit_time: 12, valid: 1 }],
      keys: [{ data: 'test-pepper' }]
    })
    expect(result.status).toBe(500)
    expect(result.db.insert).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result.messages)).not.toContain(SECRET)
  })
})
