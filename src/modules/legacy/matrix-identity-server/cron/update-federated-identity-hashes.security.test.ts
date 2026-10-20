import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import type { TwakeLogger } from '../../logger'
import type { Config } from '../types'
import type UserDB from '../userdb'
import updateFederatedHashes, { isSecureFederationPeer, parseFederatedHashDetails } from './update-federated-identity-hashes'

const PRIVATE_EMAIL = 'very-private@example.org'
const PRIVATE_PHONE = '+33 600 555 444'

describe('federated hash_details input authorization', () => {
  it('requires HTTPS except local integration fixtures and rejects URL credentials/fragments', () => {
    for (const url of [
      'http://example.org',
      'https://user:password@example.org',
      'https://example.org/#private-token',
      'https://example.org/?access_token=secret',
      'ftp://example.org',
      'not a peer URL'
    ]) expect(isSecureFederationPeer(url)).toBe(false)
    expect(isSecureFederationPeer('https://example.org')).toBe(true)
    expect(isSecureFederationPeer('http://127.0.0.1:18080')).toBe(true)
  })

  it('rejects insecure peer URLs before accessing directory contents', async () => {
    const { logger, userDB } = await runRealCron('http://example.org')
    expect(userDB.getAll).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
  it('allows only a supported hash method, bounded pepper strings and no duplicates', () => {
    expect(parseFederatedHashDetails({
      algorithms: ['sha512', 'sha256'],
      lookup_pepper: 'one',
      alt_lookup_peppers: ['two', 'one']
    })).toEqual({ algorithm: 'sha256', peppers: ['one', 'two'] })
    for (const value of [null, [], {}, { algorithms: ['toString'], lookup_pepper: 'x' },
      { algorithms: ['sha256'], lookup_pepper: '' },
      { algorithms: ['sha256'], lookup_pepper: 'a'.repeat(257) },
      { algorithms: ['sha256'], lookup_pepper: 'ok', alt_lookup_peppers: [''] },
      { algorithms: ['sha256'], lookup_pepper: 'ok', alt_lookup_peppers: 'not-an-array' },
      { algorithms: ['sha256'], lookup_pepper: 'ok', alt_lookup_peppers: Array(9).fill('p') }]) {
      expect(parseFederatedHashDetails(value)).toBeNull()
    }
  })
})

async function withDisposableFederation(
  details: object,
  check: (url: string, posts: Array<Record<string, unknown>>) => Promise<void>,
  redirectPostTo?: string
) {
  const posts: Array<Record<string, unknown>> = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url?.endsWith('/hash_details')) {
      res.end(JSON.stringify(details))
      return
    }
    if (req.method === 'POST' && req.url?.endsWith('/lookups')) {
      if (redirectPostTo) {
        res.statusCode = 307
        res.setHeader('Location', redirectPostTo)
        res.end('{}')
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      posts.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      res.end('{}')
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Ephemeral HTTP port unavailable')
    await check(`http://127.0.0.1:${address.port}`, posts)
  } finally {
    server.closeAllConnections()
    // Bun can close an idle HTTP server as part of closeAllConnections.
    // Cleanup must not turn an otherwise successful security assertion red.
    try {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw err
    }
  }
}

async function runRealCron(url: string | string[]) {
  const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() }
  const userDB = {
    getAll: mock(async () => [{ uid: 'someone', mail: PRIVATE_EMAIL, mobile: PRIVATE_PHONE }])
  }
  const config = {
    base_url: 'https://self.example.org',
    server_name: 'self.example.org',
    federated_identity_services: Array.isArray(url) ? url : [url]
  } as Config
  await updateFederatedHashes(config, userDB as unknown as UserDB, logger as unknown as TwakeLogger)
  return { logger, userDB }
}

describe('real federated hashing over disposable local HTTP', () => {
  it('does not forward directory hashes to a redirected host', async () => {
    const details = { algorithms: ['sha256'], lookup_pepper: 'private-pepper' }
    await withDisposableFederation(details, async (targetUrl, leakedPosts) => {
      await withDisposableFederation(details, async (sourceUrl) => {
        await runRealCron(sourceUrl)
        expect(leakedPosts).toHaveLength(0)
      }, `${targetUrl}/_matrix/identity/v2/lookups`)
    })
  })
  it('never transmits cleartext contact data or logs directory secrets', async () => {
    await withDisposableFederation({ algorithms: ['sha256'], lookup_pepper: 'pepper-one', alt_lookup_peppers: ['pepper-two'] }, async (url, posts) => {
      const { logger } = await runRealCron(url)
      expect(posts).toHaveLength(2)
      for (const post of posts) {
        expect(post.algorithm).toBe('sha256')
        const serialized = JSON.stringify(post)
        expect(serialized).not.toContain(PRIVATE_EMAIL)
        expect(serialized).not.toContain(PRIVATE_PHONE)
        expect(Object.hasOwn(post.mappings as object, 'self.example.org:443')).toBe(true)
      }
      const logs = JSON.stringify([...logger.debug.mock.calls, ...logger.error.mock.calls])
      expect(logs).not.toContain(PRIVATE_EMAIL)
      expect(logs).not.toContain(PRIVATE_PHONE)
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  it('fails closed without POST or directory reads for a malicious algorithm', async () => {
    await withDisposableFederation({ algorithms: ['constructor'], lookup_pepper: 'secret' }, async (url, posts) => {
      const { logger, userDB } = await runRealCron(url)
      expect(posts).toHaveLength(0)
      expect(userDB.getAll).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  it('never shifts a healthy federation peer onto the pepper of a rejected peer', async () => {
    await withDisposableFederation({ algorithms: ['toString'], lookup_pepper: 'evil-pepper' }, async (invalidUrl, invalidPosts) => {
      await withDisposableFederation({ algorithms: ['sha256'], lookup_pepper: 'valid-pepper' }, async (validUrl, validPosts) => {
        const { logger } = await runRealCron([invalidUrl, validUrl])
        expect(invalidPosts).toHaveLength(0)
        expect(validPosts).toHaveLength(1)
        expect(validPosts[0]?.pepper).toBe('valid-pepper')
        expect(validPosts[0]?.algorithm).toBe('sha256')
        expect(logger.error).toHaveBeenCalledTimes(1)
      })
    })
  })
})
