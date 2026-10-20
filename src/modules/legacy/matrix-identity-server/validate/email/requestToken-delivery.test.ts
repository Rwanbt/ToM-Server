import { createServer } from 'node:http'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import RequestToken from './requestToken'
import Mailer from '../../utils/mailer'

const SECRET = 'smtp-credential-not-for-client-or-logs-493'

describe('email verification invitation delivery', () => {
  afterEach(() => mock.restore())

  it('fails safely rather than returning a successful session when SMTP rejects delivery', async () => {
    spyOn(Mailer.prototype, 'sendMail').mockRejectedValue(new Error(SECRET))
    const logger = { error: mock(), info: mock(), warn: mock() }
    const db = {
      get: mock(async () => []),
      createOneTimeToken: mock(async () => 'opaque-new-token'),
      insert: mock(async () => []),
      deleteToken: mock(async () => undefined),
      deleteEqualAnd: mock(async () => undefined)
    }
    const identity = {
      logger,
      db,
      conf: {
        template_dir: 'assets/templates',
        server_name: 'matrix.example.com',
        smtp_server: '127.0.0.1',
        smtp_port: 25,
        smtp_verify_certificate: true,
        smtp_tls: false,
        mail_link_delay: 600
      },
      authenticate: (_req: unknown, _res: unknown, next: (content: object) => void) => next({})
    }
    const handler = RequestToken(identity as never)
    const server = createServer((req, res) => handler(req as never, res))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No ephemeral port')
      const response = await fetch(`http://127.0.0.1:${address.port}/requestToken`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_secret: 'client-secret',
          email: 'alice@example.com',
          send_attempt: 1
        }),
        signal: AbortSignal.timeout(2500)
      })
      const body = await response.text()
      expect(response.status).toBe(503)
      expect(body).not.toContain(SECRET)
      expect(Bun.inspect(logger.error.mock.calls)).not.toContain(SECRET)
      expect(db.createOneTimeToken).toHaveBeenCalledTimes(1)
      expect(db.deleteEqualAnd).toHaveBeenCalledTimes(1)
      expect(db.deleteToken).toHaveBeenCalledWith('opaque-new-token')
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
