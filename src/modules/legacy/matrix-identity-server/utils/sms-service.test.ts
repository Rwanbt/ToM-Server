import { describe, expect, it, mock, test } from "bun:test"
import { type TwakeLogger } from '../../logger'
import type { Config } from '../types'
import { SmsService } from './sms-service'

const loggerMock = {
  info: mock(),
  error: mock()
}

const mockConfig = {
  sms_api_key: 'test_key',
  sms_api_login: 'test_secret',
  sms_api_url: 'http://localhost/sms/api'
}

// Test doubles must implement Bun's fetch.preconnect contract. Real Response
// objects additionally exercise the same status/json paths as HTTP responses.
const mockFetch = (status: number, body: object = {}) =>
  Object.assign(mock(async () => new Response(JSON.stringify(body), { status })), {
    preconnect: () => {}
  })

describe('the SMS service', () => {
  const smsService = new SmsService(
    mockConfig as Config,
    loggerMock as unknown as TwakeLogger
  )

  describe('the send method', () => {
    it('should send a SMS', async () => {
      global.fetch = mockFetch(200, { success: true })

      await smsService.send('test', 'test')
      expect(loggerMock.error).not.toHaveBeenCalled()
    })

    it('should fail closed and log only a generic error when SMS provider rejects', async () => {
      global.fetch = mockFetch(401)

      await expect(smsService.send('test', 'test')).rejects.toThrow(
        'Failed to send SMS'
      )

      expect(loggerMock.error).toHaveBeenCalledWith('Failed to send SMS')
    })

    it('should call the API endpoint with correct parameters', async () => {
      global.fetch = mockFetch(200, { success: true })

      await smsService.send('+330744556688', 'test sms')

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost/sms/api/sms-campaign/send',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-login': 'test_secret',
            'api-key': 'test_key'
          },
          redirect: 'error',
          signal: expect.any(AbortSignal),
          body: JSON.stringify({
            sender: 'Twake',
            recipients: [{ phone_number: '+330744556688' }],
            text: 'test sms',
            type: 'sms_low_cost'
          })
        }
      )
    })
    it('refuses insecure remote SMS credentials transport', () => {
      expect(
        () =>
          new SmsService(
            { ...mockConfig, sms_api_url: 'http://sms.example.com' } as Config,
            loggerMock as unknown as TwakeLogger
          )
      ).toThrow('Invalid SMS API endpoint')
    })

    it('never discloses provider error payloads into logs', async () => {
      loggerMock.error.mockClear()
      const secret = 'provider-sensitive-number-token-57'
      global.fetch = mockFetch(403, { message: secret })
      await expect(smsService.send('123456', secret)).rejects.toThrow(
        'Failed to send SMS'
      )
      expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain(secret)
    })
  })
})
