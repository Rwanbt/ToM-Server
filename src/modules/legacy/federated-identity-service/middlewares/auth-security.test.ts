import { describe, expect, it, mock } from 'bun:test'
import { Authenticate } from './auth'

function authorize(remoteAddress: string, forwarded: string | undefined, trustHeader: boolean) {
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
    socket: { remoteAddress }, method: 'GET', originalUrl: '/_matrix/identity/v2/hash_details'
  }
  Authenticate(db as never, ['2001:db8::1'], trustHeader, logger as never)(
    request as never, response as never, callback, false
  )
  return { callback, db, ended }
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
})
