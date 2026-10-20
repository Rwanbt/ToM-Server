import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { MatrixResolve } from '../../matrix-resolve/index'
import validateMatrixToken from './validateMatrixToken'

const servers: Server[] = []
async function serve(handler: Parameters<typeof createServer>[0]): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('No ephemeral port')
  return `http://127.0.0.1:${address.port}/`
}

afterEach(async () => {
  mock.restore()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    try { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())) }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') throw err }
  }
})

describe('Matrix OpenID userinfo outbound token boundary', () => {
  it('rejects a resolved remote HTTP endpoint before sending credentials', async () => {
    const resolve = spyOn(MatrixResolve.prototype, 'resolve')
      .mockResolvedValue('http://matrix.example.org/')
    const logger = { warn: mock() }
    await expect(validateMatrixToken(logger as never)('example.org', 'secret-openid-bearer'))
      .rejects.toBe('Invalid server')
    expect(resolve).toHaveBeenCalledWith('example.org')
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret-openid-bearer')
  })

  it('encodes a token as one query value, not extra parameters or URL fragment', async () => {
    const token = 'bearer&next=http://malicious.example/#fragment'
    const requests: string[] = []
    const base = await serve((req, res) => {
      requests.push(req.url ?? '')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ sub: '@alice:example.org' }))
    })
    spyOn(MatrixResolve.prototype, 'resolve').mockResolvedValue(base)
    const logger = { warn: mock() }
    expect(await validateMatrixToken(logger as never)('example.org', token))
      .toBe('@alice:example.org')
    expect(requests).toHaveLength(1)
    const url = new URL(requests[0]!, base)
    expect(url.searchParams.get('access_token')).toBe(token)
    expect([...url.searchParams.keys()]).toEqual(['access_token'])
  })

  it('rejects a redirect without following it to a second service', async () => {
    const captured: string[] = []
    const target = await serve((req, res) => {
      captured.push(req.url ?? '')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ sub: '@alice:example.org' }))
    })
    const base = await serve((req, res) => {
      res.writeHead(307, { Location: `${target}capture?${new URL(req.url ?? '/', base).searchParams.toString()}` })
      res.end()
    })
    spyOn(MatrixResolve.prototype, 'resolve').mockResolvedValue(base)
    const logger = { warn: mock() }
    await expect(validateMatrixToken(logger as never)('example.org', 'secret-openid-bearer'))
      .rejects.toBeDefined()
    expect(captured).toHaveLength(0)
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret-openid-bearer')
  })
})
