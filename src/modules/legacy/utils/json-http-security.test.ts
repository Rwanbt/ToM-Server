import { describe, expect, it } from 'bun:test'
import { createServer, request } from 'node:http'
import { jsonContent } from './utils'

const SENTINEL = 'SENTINEL_HTTP_SECRET_DO_NOT_LOG_9017'

async function withLocalParser(run: (port: number) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    jsonContent(req, res, { error: () => undefined } as any, body => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Ephemeral HTTP listener has no port')
  }
  try {
    await run(address.port)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

async function postChunks(port: number, chunks: Buffer[]): Promise<{ status: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/',
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json' }
      },
      res => {
        const received: Buffer[] = []
        res.on('data', (chunk: Buffer) => received.push(chunk))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(received).toString('utf8')
        }))
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    for (const chunk of chunks) req.write(chunk)
    req.end()
  })
}

describe('real loopback HTTP JSON ingress', () => {
  it('preserves valid multibyte UTF-8 split at an arbitrary network chunk boundary', async () => {
    await withLocalParser(async port => {
      const json = Buffer.from(JSON.stringify({ text: 'René € 漢字' }))
      const symbol = Buffer.from('€')
      const pos = json.indexOf(symbol) + 1
      expect(pos).toBeGreaterThan(0)
      const reply = await postChunks(port, [json.subarray(0, pos), json.subarray(pos)])
      expect(reply.status).toBe(200)
      expect(JSON.parse(reply.body)).toEqual({ text: 'René € 漢字' })
    })
  })

  it('rejects invalid UTF-8 byte sequences across the actual HTTP boundary', async () => {
    await withLocalParser(async port => {
      const invalid = Buffer.concat([
        Buffer.from('{"password":"'),
        Buffer.from([0xc3, 0x28]),
        Buffer.from('"}')
      ])
      const reply = await postChunks(port, [invalid.subarray(0, 10), invalid.subarray(10)])
      expect(reply.status).toBe(400)
      expect(reply.body).not.toContain(SENTINEL)
    })
  })

  it('bounds chunked HTTP payloads and never processes large secret-bearing JSON', async () => {
    await withLocalParser(async port => {
      const huge = Buffer.from(JSON.stringify({
        password: SENTINEL,
        contents: 'x'.repeat(1_100_000)
      }))
      const reply = await postChunks(port, [
        huge.subarray(0, 700_000),
        huge.subarray(700_000)
      ])
      expect(reply.status).toBe(413)
      expect(reply.body).not.toContain(SENTINEL)
    })
  })
})
