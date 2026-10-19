import { afterAll, beforeEach, describe, expect, it, mock, spyOn, test, type Mock } from 'bun:test'
import { getLogger } from '../../../logger'
import fetch, { type Response } from 'node-fetch'
import { type Config } from '../../types'
import SmsService from '../services'
mock.module('node-fetch', () => ({
  default: mock(),
}))

beforeEach(() => {
  spyOn(console, 'error').mockImplementation(() => {})
})

describe('the SMS service', () => {
  const smsConfig = {
    sms_api_key: 'test',
    sms_api_login: 'test',
    sms_api_url: 'https://url/'
  }
  const mockFetch = fetch as Mock<(...args: any[]) => any>
  const logger = getLogger()
  const smsService = new SmsService(smsConfig as Config, logger)

  afterAll(() => {
    logger.close()
  })

  it('should attempt to use the SMS api', async () => {
    mockFetch.mockResolvedValue(
      Promise.resolve({ status: 200 } as unknown as Response)
    )
    await smsService.send({ to: ['123456'], text: 'test' })

    expect(mockFetch).toHaveBeenCalledWith('https://url/', {
      method: 'POST',
      body: JSON.stringify({
        recipients: [{ phone_number: '123456' }],
        sender: 'Twake',
        text: 'test',
        type: 'sms_low_cost'
      }),
      headers: {
        'Content-Type': 'application/json',
        'cache-control': 'no-cache',
        'api-key': 'test',
        'api-login': 'test'
      },
      signal: expect.any(AbortSignal),
      redirect: 'error'
    })
  })

  it('should throw an error if the sms api returns an error', async () => {
    mockFetch.mockResolvedValue(
      Promise.resolve({ status: 400 } as unknown as Response)
    )
    // expect the service to throw an error
    await expect(
      smsService.send({ to: ['123456'], text: 'test' })
    ).rejects.toThrow('Failed to send SMS')
  })

  for (const status of [401, 403, 429, 500, 503]) {
    it(
      `should reject SMS provider HTTP ${status} instead of reporting success`,
      async () => {
        mockFetch.mockResolvedValue({ status } as Response)

        await expect(
          smsService.send({ to: ['123456'], text: 'test' })
        ).rejects.toThrow('Failed to send SMS')
      }
    )
  }

  it('aborts a stalled SMS provider request without exposing transport secrets', async () => {
    const transportSecret = 'sms-provider-secret-token-9876'
    let observedSignal: AbortSignal | undefined
    mockFetch.mockImplementation(
      (_url: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          observedSignal = options.signal
          options.signal?.addEventListener(
            'abort',
            () => reject(new Error(transportSecret)),
            { once: true }
          )
        })
    )
    const boundedService = new SmsService(smsConfig as Config, logger, 15)

    let watchdog: ReturnType<typeof setTimeout> | undefined
    try {
      await expect(
        Promise.race([
          boundedService.send({ to: ['123456'], text: 'test' }),
          new Promise<never>((_resolve, reject) => {
            watchdog = setTimeout(
              () => reject(new Error('Provider request was not aborted')),
              120
            )
          })
        ])
      ).rejects.toThrow('Failed to send SMS')
    } finally {
      clearTimeout(watchdog)
    }
    expect(observedSignal?.aborted).toBe(true)
  })

  it('clears the provider timeout after a successful response', async () => {
    let observedSignal: AbortSignal | undefined
    mockFetch.mockImplementation(
      (_url: string, options: { signal?: AbortSignal }) => {
        observedSignal = options.signal
        return Promise.resolve({ status: 200 } as Response)
      }
    )
    const boundedService = new SmsService(smsConfig as Config, logger, 20)

    await boundedService.send({ to: ['123456'], text: 'test' })
    await new Promise((resolve) => setTimeout(resolve, 35))
    expect(observedSignal?.aborted).toBe(false)
  })

  it('rejects insecure remote SMS URLs and credential-bearing provider URLs before a request', () => {
    for (const endpoint of [
      'http://sms.example.com/v1',
      'https://apikey:password@sms.example.com/v1',
      'file:///etc/passwd',
      'https://sms.example.com/#secret'
    ]) {
      expect(
        () =>
          new SmsService(
            { ...smsConfig, sms_api_url: endpoint } as Config,
            logger
          )
      ).toThrow('Invalid SMS API endpoint')
    }
  })

  it('does not follow provider redirects carrying SMS credentials', async () => {
    mockFetch.mockResolvedValue({ status: 200 } as Response)
    const secureService = new SmsService(
      { ...smsConfig, sms_api_url: 'https://sms.example.com/v1' } as Config,
      logger
    )
    await secureService.send({ to: ['123456'], text: 'test' })
    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://sms.example.com/v1',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal)
      })
    )
  })
})
