import { describe, expect, it, mock } from 'bun:test'
import type { NextFunction, Response } from 'express'
import type { TwakeLogger } from '../../../logger'
import type { AuthRequest } from '../../types'
import SmsApiMiddleware from '../middlewares'

const logger = { debug: mock() } as unknown as TwakeLogger

function check(
  method: 'checkSendRequirements' | 'validateMobilePhone',
  body: unknown
) {
  const next = mock() as unknown as NextFunction
  const response = {
    status: mock(() => response),
    json: mock(() => response)
  } as unknown as Response
  const middleware = new SmsApiMiddleware(logger)
  middleware[method]({ body } as AuthRequest, response, next)
  return { next, response }
}

describe('SMS API validates untrusted JSON before provider dispatch', () => {
  it.each([
    [{ to: [], text: 'hello' }, 'empty recipient list'],
    [{ to: '+21652127155', text: 42 }, 'numeric message'],
    [{ to: '+21652127155', text: ['hello'] }, 'array message'],
    [{ to: '+21652127155', text: { length: 1 } }, 'object message'],
    [{ to: ['+21652127155'], text: '' }, 'empty message'],
    [{ to: '+21652127155', text: '   ' }, 'whitespace message'],
    [{ to: { phone: '+21652127155' }, text: 'hello' }, 'object recipient'],
    [null, 'null body']
  ])('rejects %s (%s) with 400 before reaching downstream', (body) => {
    const { response, next } = check('checkSendRequirements', body)
    expect(response.status).toHaveBeenCalledWith(400)
    expect(next).not.toHaveBeenCalled()
  })

  it('never treats an empty recipient array as valid', () => {
    const { response, next } = check('validateMobilePhone', { to: [] })
    expect(response.status).toHaveBeenCalledWith(400)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects non-string recipients even when mixed with valid numbers', () => {
    const { response, next } = check('validateMobilePhone', {
      to: ['+21652127155', { value: '+21622547856' }]
    })
    expect(response.status).toHaveBeenCalledWith(400)
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts a valid multi-recipient request', () => {
    const body = { to: ['+21652127155', '+21622547856'], text: 'hello' }
    expect(check('checkSendRequirements', body).next).toHaveBeenCalledTimes(1)
    expect(check('validateMobilePhone', body).next).toHaveBeenCalledTimes(1)
  })
})
