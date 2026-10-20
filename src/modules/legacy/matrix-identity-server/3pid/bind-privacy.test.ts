import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import bind from './bind'

const sensitive = 'private-onbind-database-access-token-671'

describe('Matrix 3pid binding error privacy', () => {
  it('never returns or logs an upstream database secret when mapping lookup fails', async () => {
    const logger = { error: mock(), warn: mock(), debug: mock(), info: mock() }
    const db = {
      get: mock(async () => { throw new Error(sensitive) })
    }
    const identity = {
      logger,
      db,
      authenticate: (_req: unknown, _res: unknown, callback: (data: object, id: string) => void) =>
        callback({}, 'opaque-id')
    }
    const handler = bind(identity as never)
    const server = createServer((req, res) => handler(req as never, res))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No ephemeral server port')
      const response = await fetch(`http://127.0.0.1:${address.port}/bind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_secret: 'client-secret',
          mxid: '@alice:matrix.example.com',
          sid: 'sid123'
        }),
        signal: AbortSignal.timeout(2500)
      })
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain(sensitive)
      expect(Bun.inspect(logger.error.mock.calls)).not.toContain(sensitive)
    } finally {
      server.closeAllConnections()
      try {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw error
      }
    }
  })
})
