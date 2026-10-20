import { describe, expect, it, mock } from 'bun:test'
import Middleware from './index'

function build(rows: unknown[]) {
  const db = { get: mock(async () => rows) }
  const logger = { info: mock(), error: mock(), warn: mock() }
  const middleware = new Middleware(db as never, logger as never, {} as never)
  const status = mock(() => response)
  const json = mock(() => response)
  const response = { status, json }
  const next = mock()
  const req = { userId: 'alice', params: { id: 'invite-1' }, body: { contact: 'alice@example.org' } }
  return { middleware, db, req, response, next }
}

describe('invitation authorization fails closed on incomplete database records', () => {
  it('rejects invitation lookup without a usable record', async () => {
    const ctx = build([])
    await ctx.middleware.checkInvitation(ctx.req as never, ctx.response as never, ctx.next)
    expect(ctx.response.status).toHaveBeenCalledWith(404)
    expect(ctx.next).not.toHaveBeenCalled()
  })

  it('rejects ownership lookup without a usable record', async () => {
    const ctx = build([])
    await ctx.middleware.checkInvitationOwnership(ctx.req as never, ctx.response as never, ctx.next)
    expect(ctx.response.status).toHaveBeenCalledWith(404)
    expect(ctx.next).not.toHaveBeenCalled()
  })

  it('rejects malformed expiration instead of accepting the invitation', async () => {
    const ctx = build([{ sender: 'bob', expiration: 'not-a-timestamp' }])
    await ctx.middleware.checkInvitation(ctx.req as never, ctx.response as never, ctx.next)
    expect(ctx.response.status).toHaveBeenCalledWith(400)
    expect(ctx.next).not.toHaveBeenCalled()
  })

  it('does not bypass the rate limit on malformed database expiration', async () => {
    const ctx = build([{ expiration: 'not-a-timestamp' }])
    await ctx.middleware.rateLimitInvitations(ctx.req as never, ctx.response as never, ctx.next)
    expect(ctx.response.status).toHaveBeenCalledWith(400)
    expect(ctx.next).not.toHaveBeenCalled()
  })
})
