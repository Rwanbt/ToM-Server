import { describe, expect, it, mock } from 'bun:test'
import express from 'express'
import supertest from 'supertest'
import type { TwakeLogger } from '../../../logger'
import type { AuthenticationFunction, Config } from '../../types'
import router, { PATH } from '../routes'
import type { ISmsService } from '../types'

const send = mock(async () => {})
const logger = {
  debug: mock(),
  error: mock(),
  info: mock(),
  warn: mock()
} as unknown as TwakeLogger
const authenticator = ((
  _req: unknown,
  _res: unknown,
  callback: (data: { sub: string }, token: string) => void
) => callback({ sub: '@user:example.org' }, 'test-token')) as AuthenticationFunction

const app = express()
app.use(express.json())
app.use(
  router(
    {
      sms_api_key: 'test',
      sms_api_login: 'test',
      sms_api_url: 'http://unused.invalid/'
    } as Config,
    authenticator,
    logger,
    { send } as ISmsService
  )
)

describe('SMS HTTP ingress validates payloads before provider dispatch', () => {
  it.each([
    { to: [], text: 'hello' },
    { to: '+21652127155', text: 123 },
    { to: '+21652127155', text: ['hello'] },
    { to: '+21652127155', text: '   ' },
    { to: ['+21652127155', { nested: 'unsafe' }], text: 'hello' }
  ])('returns HTTP 400 and sends nothing for %j', async (body) => {
    send.mockClear()
    const response = await supertest(app).post(PATH).send(body)
    expect(response.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('dispatches exactly once for a valid multi-recipient message', async () => {
    send.mockClear()
    const response = await supertest(app).post(PATH).send({
      to: ['+21652127155', '+21622547856'],
      text: 'hello'
    })
    expect(response.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      to: ['+21652127155', '+21622547856'],
      text: 'hello'
    })
  })
})
