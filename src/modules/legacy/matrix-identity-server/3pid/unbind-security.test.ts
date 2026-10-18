import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import unbind from './unbind'

const SECRET = 'SENTINEL_UNBIND_PRIVATE_SECRET_X18'

async function sendUnbind(body: object, opts: { failLookup?: boolean; mapping?: boolean } = {}) {
  const entries: unknown[][] = []
  const logger = {
    debug: mock((...args: unknown[]) => { entries.push(args) }),
    warn: mock((...args: unknown[]) => { entries.push(args) }),
    error: mock((...args: unknown[]) => { entries.push(args) })
  }
  const db = {
    get: mock(async () => {
      if (opts.failLookup) throw new Error(`DB lookup of ${SECRET} failed`)
      return opts.mapping ? [{ address: 'person@example.org' }] : []
    }),
    deleteEqual: mock(async () => undefined)
  }
  const handler = unbind({
    authenticate: (_req: unknown, _res: unknown, next: (...args: unknown[]) => void) => next({}, null),
    logger,
    db
  } as never)
  const server = createServer((req, res) => handler(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('No local HTTP port')
    const response = await fetch(`http://127.0.0.1:${addr.port}/_matrix/identity/v2/3pid/unbind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000)
    })
    return { status: response.status, data: await response.text(), entries, db }
  } finally {
    server.closeAllConnections()
    try {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw err
    }
  }
}

const body = {
  client_secret: SECRET,
  sid: 'session-1',
  mxid: '@person:example.org',
  threepid: { address: 'person@example.org', medium: 'email' }
}

describe('Matrix unbind requires an authorized session and never discloses it', () => {
  it('rejects missing unsigned session credentials promptly (not a hanging request)', async () => {
    const result = await sendUnbind({ mxid: body.mxid, threepid: body.threepid })
    expect(result.status).toBe(400)
    expect(result.db.get).not.toHaveBeenCalled()
  })

  it('redacts credentials in database failures from both HTTP response and logs', async () => {
    const result = await sendUnbind(body, { failLookup: true })
    expect(result.status).toBe(500)
    expect(result.data).not.toContain(SECRET)
    expect(JSON.stringify(result.entries)).not.toContain(SECRET)
  })

  it('deletes only an owned mapping for a validated session', async () => {
    const result = await sendUnbind(body, { mapping: true })
    expect(result.status).toBe(200)
    expect(result.db.deleteEqual).toHaveBeenCalledWith('hashes', 'value', body.mxid)
  })
})
