import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createServer, type Server } from 'node:http'
import SmsApiService from '../services'
import LegacySmsService from '../../utils/services/sms-service'
import { SmsService as MatrixIdentitySmsService } from '../../../matrix-identity-server/utils/sms-service'

// Actual HTTP protocol redirects, no mocks or external SMS provider.
// A custom api-key header MUST NOT be replayed to the redirect destination.
describe('SMS provider redirects never disclose credentials', () => {
  let server: Server
  let endpoint = ''
  let redirectedRequests = 0
  let leakedCredentials = 0
  const logger = { info() {}, warn() {}, error() {}, debug() {} }

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/capture') {
        redirectedRequests++
        if (req.headers['api-key'] || req.headers['api-login']) {
          leakedCredentials++
        }
        res.writeHead(200).end('{}')
        return
      }
      res.writeHead(307, { location: '/capture' }).end()
    })
    await new Promise<void>(resolve =>
      server.listen(0, '127.0.0.1', resolve)
    )
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Disposable SMS HTTP server has no TCP address')
    }
    endpoint = `http://127.0.0.1:${address.port}/redirect`
  })

  afterAll(async () => {
    server?.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    )
  })

  it('rejects a 307 in the public SMS API outbound service', async () => {
    const service = new SmsApiService(
      {
        sms_api_url: endpoint,
        sms_api_key: 'private-test-key',
        sms_api_login: 'private-test-login'
      } as any,
      logger as any
    )
    await expect(service.send({ text: 'hello', to: ['123456'] })).rejects.toThrow(
      'Failed to send SMS'
    )
    expect(redirectedRequests).toBe(0)
    expect(leakedCredentials).toBe(0)
  })

  it('rejects a 307 in the legacy Twake SMS notification service', async () => {
    const service = new LegacySmsService(
      {
        sms_api_url: endpoint,
        sms_api_key: 'private-test-key',
        sms_api_login: 'private-test-login'
      } as any,
      logger as any
    )
    await expect(service.send('123456', 'hello')).rejects.toThrow(
      'Failed to send SMS'
    )
    expect(redirectedRequests).toBe(0)
    expect(leakedCredentials).toBe(0)
  })

  it('rejects a 307 in the Matrix identity registration SMS service', async () => {
    const service = new MatrixIdentitySmsService(
      {
        sms_api_url: endpoint,
        sms_api_key: 'private-test-key',
        sms_api_login: 'private-test-login'
      } as any,
      logger as any
    )
    await expect(service.send('123456', 'hello')).rejects.toThrow(
      'Failed to send SMS'
    )
    expect(redirectedRequests).toBe(0)
    expect(leakedCredentials).toBe(0)
  })
})
