import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import getPubkey from './getPubkey'

const SECRET = 'SENTINEL_DATABASE_PRIVATE_KEY_77'

async function exercise(rows: unknown[][], error?: Error) {
  const requests: string[] = []
  const handler = getPubkey({
    db: {
      get: mock(async (table: string) => {
        requests.push(table)
        if (error) throw error
        return rows[requests.length - 1] ?? []
      })
    }
  } as never)
  const server = createServer((req, res) => handler({ ...req, params: { keyId: 'public-key-1' } } as never, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No local port')
    const response = await fetch(`http://127.0.0.1:${address.port}/public-key`, {
      signal: AbortSignal.timeout(2500)
    })
    return { status: response.status, text: await response.text(), requests }
  } finally {
    server.closeAllConnections()
    try {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw err
    }
  }
}

describe('public-key HTTP access never discloses key database errors', () => {
  it('returns a short term public key without looking up long term secrets', async () => {
    const result = await exercise([[{ public: 'public-value' }]])
    expect(result.status).toBe(200)
    expect(result.text).toContain('public-value')
    expect(result.requests).toEqual(['shortTermKeypairs'])
  })

  it('falls back to the long term public key', async () => {
    const result = await exercise([[], [{ public: 'stable-public' }]])
    expect(result.status).toBe(200)
    expect(result.text).toContain('stable-public')
    expect(result.requests).toEqual(['shortTermKeypairs', 'longTermKeypairs'])
  })

  it('responds 404 rather than returning a corrupt missing key field', async () => {
    const result = await exercise([[{ private: SECRET }], [{ private: SECRET }]])
    expect(result.status).toBe(404)
    expect(result.text).not.toContain(SECRET)
  })

  it('responds 500 without echoing private values from DB exceptions', async () => {
    const result = await exercise([], new Error(`database '${SECRET}' failed`))
    expect(result.status).toBe(500)
    expect(result.text).not.toContain(SECRET)
  })
})
