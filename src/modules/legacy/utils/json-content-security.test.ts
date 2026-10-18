import { describe, expect, it, mock } from 'bun:test'
import { jsonContent } from './utils'

const SECRET = 'SENTINEL_JSON_PASSWORD_c240ef'

describe('untrusted JSON body handling', () => {
  it('rejects malformed JSON without reflecting request contents into response or logs', () => {
    const events: Record<string, (data?: string) => void> = {}
    const req = {
      headers: { 'content-type': 'application/json' },
      on: (name: string, listener: (data?: string) => void) => {
        events[name] = listener
      }
    }
    const entries: unknown[][] = []
    const logger = {
      error: mock((...args: unknown[]) => { entries.push(args) })
    }
    let status = 0
    let responseBody = ''
    const res = {
      writeHead: (code: number) => { status = code },
      write: (data: string) => { responseBody += data },
      end: mock()
    }
    const accepted = mock()
    jsonContent(req as any, res as any, logger as any, accepted)
    events.data?.(`{"password":"${SECRET}", BROKEN`)
    events.end?.()

    expect(status).toBe(400)
    expect(accepted).not.toHaveBeenCalled()
    expect(responseBody).not.toContain(SECRET)
    expect(entries.flat().map(x => x instanceof Error ? x.message : String(x)).join(' ')).not.toContain(SECRET)
  })

  it('does not reflect a transport parser error with untrusted details', () => {
    const events: Record<string, (error?: Error) => void> = {}
    const req = {
      headers: {},
      on: (name: string, handler: (error?: Error) => void) => { events[name] = handler }
    }
    let body = ''
    const res = {
      writeHead: mock(),
      write: (text: string) => { body += text },
      end: mock()
    }
    const accepted = mock()
    jsonContent(req as any, res as any, { error: mock() } as any, accepted)
    events.error?.(new Error(`malicious parser error ${SECRET}`))
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object))
    expect(accepted).not.toHaveBeenCalled()
    expect(body).not.toContain(SECRET)
  })

  it('rejects oversized chunked bodies before parsing and responds only once', () => {
    const events: Record<string, (value?: any) => void> = {}
    const req = {
      headers: { 'content-type': 'application/json' },
      on: (event: string, handler: (value?: any) => void) => { events[event] = handler }
    }
    const res = { writeHead: mock(), write: mock(), end: mock() }
    const callback = mock()
    jsonContent(req as any, res as any, { error: mock() } as any, callback)
    // Include valid JSON-looking bytes that would otherwise consume unbounded memory.
    events.data?.(Buffer.alloc(700_000, 'a'))
    events.data?.(Buffer.alloc(700_000, 'b'))
    events.data?.(Buffer.alloc(700_000, 'c'))
    events.end?.()
    events.error?.(new Error(SECRET))
    expect(res.writeHead).toHaveBeenCalledTimes(1)
    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object))
    expect(res.end).toHaveBeenCalledTimes(1)
    expect(callback).not.toHaveBeenCalled()
    expect(JSON.stringify(res.write.mock.calls)).not.toContain(SECRET)
  })

  it('accepts an already parsed request body exactly once even after stream end', () => {
    const on = mock()
    const callback = mock()
    const req = { headers: {}, body: { message: 'ok' }, on }
    jsonContent(req as any, { writeHead: mock(), write: mock(), end: mock() } as any,
      { error: mock() } as any, callback)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({ message: 'ok' })
    const endCallback = on.mock.calls.find(([name]) => name === 'end')?.[1]
    endCallback?.()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('enforces the byte limit for UTF-8 and ignores repeated stream end events', () => {
    const events: Record<string, (chunk?: string) => void> = {}
    const res = { writeHead: mock(), write: mock(), end: mock() }
    const accepted = mock()
    const req = {
      headers: { 'content-type': 'application/json' },
      on: (name: string, fn: (chunk?: string) => void) => { events[name] = fn }
    }
    jsonContent(req as any, res as any, { error: mock() } as any, accepted)
    events.data?.('€'.repeat(400_000))
    events.end?.()
    events.end?.()
    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object))
    expect(res.end).toHaveBeenCalledTimes(1)
    expect(accepted).not.toHaveBeenCalled()
  })
})
