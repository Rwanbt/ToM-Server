import { describe, expect, it, mock } from 'bun:test'
import express from 'express'
import supertest from 'supertest'
import { Authenticate, auth } from './auth'

function authorize(remoteAddress: string, forwarded: string | undefined, trustHeader: boolean, originalUrl = '/_matrix/identity/v2/hash_details') {
  let resolve!: (status: number) => void
  const ended = new Promise<number>(done => { resolve = done })
  const response = {
    writeHead: mock((status: number) => { resolve(status) }),
    write: mock(), end: mock()
  }
  const db = { get: mock(async () => []) }
  const logger = { info: mock(), debug: mock(), error: mock(), warn: mock() }
  const callback = mock()
  const request = {
    headers: { ...(forwarded ? { 'x-forwarded-for': forwarded } : {}) },
    socket: { remoteAddress }, method: 'GET', originalUrl
  }
  Authenticate(db as never, ['2001:db8::1'], trustHeader, logger as never)(
    request as never, response as never, callback, false
  )
  return { callback, db, ended, logger }
}

describe('federated identity trust boundary preserves complete IPv6 addresses', () => {
  it('recognizes a trusted full IPv6 source without discarding its prefix', () => {
    const result = authorize('2001:db8::1', undefined, false)
    expect(result.callback).toHaveBeenCalled()
    expect(result.db.get).not.toHaveBeenCalled()
  })

  it('does not honor forwarded-for when proxy trust is disabled', async () => {
    const result = authorize('198.51.100.7', '2001:db8::1', false)
    expect(result.callback).not.toHaveBeenCalled()
    expect(await result.ended).toBe(401)
  })

  it('uses the first proxy address when trusted forwarding is explicitly enabled', () => {
    const result = authorize('198.51.100.7', '2001:db8::1, 198.51.100.7', true)
    expect(result.callback).toHaveBeenCalled()
  })

  it('never logs Matrix access_token query credentials for an untrusted requester', async () => {
    const secret = 'SENTINEL_MATRIX_ACCESS_TOKEN_QUERY_483'
    const result = authorize('198.51.100.7', undefined, false,
      `/_matrix/identity/v2/hash_details?access_token=${secret}&foo=bar`)
    expect(await result.ended).toBe(401)
    const rendered = JSON.stringify({
      info: result.logger.info.mock.calls,
      debug: result.logger.debug.mock.calls,
      error: result.logger.error.mock.calls
    })
    expect(rendered).not.toContain(secret)
    expect(rendered).not.toContain('access_token=')
    expect(rendered).toContain('/_matrix/identity/v2/hash_details')
  })

  it('never logs query credentials if the source IP is malformed', async () => {
    const secret = 'SENTINEL_UNTRUSTED_QUERY_984'
    const result = authorize('not-a-valid-ip', undefined, false,
      `/_matrix/identity/v2/hash_details?access_token=${secret}`)
    expect(await result.ended).toBe(401)
    expect(JSON.stringify(result.logger.error.mock.calls)).not.toContain(secret)
    expect(JSON.stringify(result.logger.info.mock.calls)).not.toContain(secret)
  })

  it('redacts a real HTTP Matrix query token across the authorization middleware', async () => {
    const secret = 'SENTINEL_REAL_HTTP_MATRIX_TOKEN_385'
    const db = { get: mock(async () => []) }
    const logger = { info: mock(), debug: mock(), error: mock(), warn: mock() }
    const app = express()
    app.get('/_matrix/identity/v2/hash_details', auth(Authenticate(db as never, [], false, logger as never)))

    const response = await supertest(app)
      .get(`/_matrix/identity/v2/hash_details?access_token=${secret}`)
    expect(response.status).toBe(401)
    expect(db.get).toHaveBeenCalledTimes(1)
    const recorded = JSON.stringify({
      info: logger.info.mock.calls,
      debug: logger.debug.mock.calls,
      error: logger.error.mock.calls
    })
    expect(recorded).not.toContain(secret)
    expect(recorded).not.toContain('access_token=')
  })
})
