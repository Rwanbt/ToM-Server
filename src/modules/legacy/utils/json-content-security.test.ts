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
})
