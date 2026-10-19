import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import SubmitToken from './submitToken'

const secret = 'email-verification-secret-must-not-leak-493'

async function callSubmitToken(db: object): Promise<{ status: number; body: string; logs: string }> {
  const logger = { error: mock() }
  const handler = SubmitToken({ db, logger } as never)
  const server = createServer((req, res) => {
    Object.assign(req, { query: { token: secret, client_secret: 'client-secret', sid: 'sid' } })
    handler(req as never, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No ephemeral port')
    const response = await fetch(`http://127.0.0.1:${address.port}/submit`, {
      signal: AbortSignal.timeout(1500)
    })
    return {
      status: response.status,
      body: await response.text(),
      logs: Bun.inspect(logger.error.mock.calls)
    }
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
}

describe('email verification failed storage operations', () => {
  it('does not disclose a failed token lookup exception in HTTP or logs', async () => {
    const result = await callSubmitToken({ verifyToken: async () => { throw Error(secret) } })
    expect(result.status).toBe(400)
    expect(result.body).not.toContain(secret)
    expect(result.logs).not.toContain(secret)
  })

  it('responds with a safe server error when token consumption fails', async () => {
    const result = await callSubmitToken({
      verifyToken: async () => ({ sid: 'sid', client_secret: 'client-secret' }),
      deleteToken: async () => { throw Error(secret) }
    })
    expect(result.status).toBe(500)
    expect(result.body).not.toContain(secret)
    expect(result.logs).not.toContain(secret)
  })

  it('responds with a safe server error when verified session update fails', async () => {
    const result = await callSubmitToken({
      verifyToken: async () => ({ sid: 'sid', client_secret: 'client-secret' }),
      deleteToken: async () => undefined,
      updateAnd: async () => { throw Error(secret) }
    })
    expect(result.status).toBe(500)
    expect(result.body).not.toContain(secret)
    expect(result.logs).not.toContain(secret)
  })
})
