import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import PostTerms from './index.post'
import { resetPolicies } from './_computePolicies'

const acceptedUrl = 'https://example.org/terms/1'

async function postWithDatabase(updateAnd: () => Promise<unknown>) {
  resetPolicies()
  const db = {
    get: mock(async () => [{ data: JSON.stringify({ sub: '@alice:example.org' }) }]),
    updateAnd: mock(updateAnd)
  }
  const logger = { info: mock(), warn: mock(), error: mock() }
  const handler = PostTerms({
    db,
    conf: { policies: { terms_of_service: { version: '1', en: { name: 'Terms', url: acceptedUrl } } } },
    logger,
    authenticate: (_req: unknown, _res: unknown, callback: (data: unknown, token: string) => void) =>
      callback({ sub: '@alice:example.org', epoch: 1 }, 'token')
  } as never)
  const server = createServer((req, res) => handler(req as never, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No ephemeral port')
    const response = await fetch(`http://127.0.0.1:${address.port}/_matrix/identity/v2/terms`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
      body: JSON.stringify({ user_accepts: [acceptedUrl] }), signal: AbortSignal.timeout(2000)
    })
    return { status: response.status, body: await response.text(), db, logger }
  } finally {
    server.closeAllConnections()
    try {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw error
    }
  }
}

describe('HTTP policy acceptance waits for authenticated durable DB mutation', () => {
  it('does not return 200 when the DB refuses acceptance', async () => {
    const result = await postWithDatabase(async () => { throw new Error('SENTINEL_PRIVATE_SQL_44') })
    expect(result.status).toBe(500)
    expect(result.body).not.toContain('SENTINEL_PRIVATE_SQL_44')
  })

  it('records the authenticated account and returns 200 only after durable update', async () => {
    const result = await postWithDatabase(async () => [])
    expect(result.status).toBe(200)
    expect(result.db.updateAnd).toHaveBeenCalledWith('userPolicies', { accepted: 1 },
      { field: 'user_id', value: '@alice:example.org' },
      { field: 'policy_name', value: 'terms_of_service 1' })
  })
})
