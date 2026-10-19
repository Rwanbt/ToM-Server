import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import Logout from './logout'

describe('identity logout credential confidentiality', () => {
  it('fails closed without logging a bearer token when the database rejects revocation', async () => {
    const token = 'identity-logout-bearer-secret-493'
    const logger = { warn: mock() }
    const db = {
      deleteEqual: mock(async () => { throw new Error(token) })
    }
    const identity = {
      logger,
      db,
      authenticate: (_req: unknown, _res: unknown, next: (content: object, id: string) => void) => {
        next({}, token)
      }
    }
    const handler = Logout(identity as never)
    const server = createServer((req, res) => handler(req as never, res))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing test port')
      const response = await fetch(`http://127.0.0.1:${address.port}/logout`, {
        signal: AbortSignal.timeout(2500)
      })
      expect(response.status).toBe(401)
      expect(await response.text()).not.toContain(token)
      expect(db.deleteEqual).toHaveBeenCalledWith('accessTokens', 'id', token)
      expect(logger.warn).toHaveBeenCalledWith('Unable to delete access token')
      expect(Bun.inspect(logger.warn.mock.calls)).not.toContain(token)
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
