import { createServer } from 'node:http'
import { describe, expect, it, mock } from 'bun:test'
import hashDetails from './hash_details'

const PRIVATE = 'SENTINEL_HASH_DATABASE_SECRET_42'

async function servePepper(rows: unknown[], failure?: Error) {
  const db = { get: mock(async () => {
    if (failure) throw failure
    return rows
  }) }
  const handler = hashDetails({
    db,
    authenticate: (_req: unknown, _res: unknown, callback: (data: unknown, id: string) => void) => callback({}, 'test')
  } as never)
  const server = createServer((req, res) => handler(req as never, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No ephemeral HTTP port')
    const response = await fetch(`http://127.0.0.1:${address.port}/_matrix/identity/v2/hash_details`, {
      signal: AbortSignal.timeout(2500)
    })
    return { status: response.status, text: await response.text() }
  } finally {
    server.closeAllConnections()
    try {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw error
    }
  }
}

describe('real HTTP hash_details endpoint', () => {
  it('never returns an invalid response when the pepper is missing', async () => {
    const result = await servePepper([])
    expect(result.status).toBe(500)
    expect(result.text).not.toContain(PRIVATE)
  })

  it('does not expose database exceptions in the HTTP response', async () => {
    const result = await servePepper([], new Error(PRIVATE))
    expect(result.status).toBe(500)
    expect(result.text).not.toContain(PRIVATE)
  })

  it('returns the expected pepper only when the stored row is valid', async () => {
    const result = await servePepper([{ data: 'test-lookup-pepper' }])
    expect(result.status).toBe(200)
    expect(result.text).toContain('test-lookup-pepper')
  })
})
