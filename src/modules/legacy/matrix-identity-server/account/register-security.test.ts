import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import Register from './register'

const PRIVATE = 'SENTINEL_MATRIX_OIDC_ACCESS_TOKEN_REGISTER_72'

describe('registration HTTP endpoint never logs supplied bearer tokens', () => {
  it('rejects an invalid homeserver without revealing the posted secret', async () => {
    const logger = { info: mock(), warn: mock(), error: mock() }
    const db = { insert: mock(async () => []) }
    const handler = Register(db as never, logger as never)
    const server = createServer((req, res) => handler(req as never, res))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No ephemeral port')
      const response = await fetch(`http://127.0.0.1:${address.port}/_matrix/identity/v2/account/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: PRIVATE,
          expires_in: '3600',
          matrix_server_name: 'invalid hostname!',
          token_type: 'Bearer'
        }),
        signal: AbortSignal.timeout(2500)
      })
      expect(response.status).toBe(401)
      expect(await response.text()).not.toContain(PRIVATE)
      expect(db.insert).not.toHaveBeenCalled()
      const logged = [...logger.warn.mock.calls, ...logger.error.mock.calls]
        .flatMap(args => args.map(v => v instanceof Error ? `${v.message} ${v.stack}` : String(v)))
        .join(' ')
      expect(logged).not.toContain(PRIVATE)
    } finally {
      server.closeAllConnections()
      try {
        await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw error
      }
    }
  })
})
