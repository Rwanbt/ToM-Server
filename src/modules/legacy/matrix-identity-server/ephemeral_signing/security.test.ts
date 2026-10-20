import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import SignEd25519 from './index'

describe('ephemeral signing token errors are confidential', () => {
  it('does not disclose rejected invitation token or upstream error over HTTP or logs', async () => {
    const secret = 'private-invitation-token-db-error-817'
    const logger = { error: mock() }
    const db = {
      verifyInvitationToken: mock(async () => { throw new Error(secret) })
    }
    const identity = {
      db,
      logger,
      authenticate: (_req: unknown, _res: unknown, next: (value: object, id: string) => void) => next({}, 'test-id')
    }
    const handler = SignEd25519(identity as never)
    const server = createServer((req, res) => handler(req as never, res))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing test listener')
      const response = await fetch(`http://127.0.0.1:${address.port}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mxid: '@alice:example.org', private_key: 'a', token: 'validtoken' }),
        signal: AbortSignal.timeout(3000)
      })
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain(secret)
      expect(Bun.inspect(logger.error.mock.calls)).not.toContain(secret)
      expect(db.verifyInvitationToken).toHaveBeenCalledWith('validtoken')
    } finally {
      server.closeAllConnections()
      try {
        await new Promise<void>((resolve, reject) =>
          server.close(error => error ? reject(error) : resolve())
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw error
      }
    }
  })
})
