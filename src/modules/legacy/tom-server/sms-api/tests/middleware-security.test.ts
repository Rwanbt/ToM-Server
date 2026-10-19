import { describe, expect, it, mock } from 'bun:test'
import type { NextFunction, Response } from 'express'
import type { TwakeLogger } from '../../../logger'
import type { AuthRequest } from '../../types'
import SmsApiMiddleware from '../middlewares'

const makeResponse = () => {
  const status = mock(() => response)
  const json = mock(() => response)
  const response = { status, json } as unknown as Response
  return { response, status, json }
}

describe('SMS input log privacy', () => {
  it('rejects an invalid recipient without logging it or Error.cause', () => {
    const debug = mock()
    const middleware = new SmsApiMiddleware(
      { debug } as unknown as TwakeLogger
    )
    const next = mock() as unknown as NextFunction
    const { response, status, json } = makeResponse()
    const privateRecipient = 'phone-sensitive-identifier-987'

    middleware.validateMobilePhone(
      { body: { to: ['+21652127155', privateRecipient] } } as AuthRequest,
      response,
      next
    )

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({ message: 'Invalid phone number' })
    expect(next).not.toHaveBeenCalled()
    expect(debug).toHaveBeenCalledTimes(1)
    expect(debug).toHaveBeenCalledWith('Invalid phone number provided')
    expect(JSON.stringify(debug.mock.calls)).not.toContain(privateRecipient)
  })

  it('logs only a generic message for malformed SMS requirements', () => {
    const debug = mock()
    const middleware = new SmsApiMiddleware(
      { debug } as unknown as TwakeLogger
    )
    const next = mock() as unknown as NextFunction
    const { response, status, json } = makeResponse()

    middleware.checkSendRequirements(
      { body: { to: 'recipient-private', text: '' } } as AuthRequest,
      response,
      next
    )

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({ message: 'Bad Request' })
    expect(next).not.toHaveBeenCalled()
    expect(debug).toHaveBeenCalledTimes(1)
    expect(debug).toHaveBeenCalledWith('Missing destination or text')
  })
})
