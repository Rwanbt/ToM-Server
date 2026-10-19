import { type TwakeLogger } from '../../../logger/index'
import { type Config } from '../../types'
import { type ISmsService, type SMS, type SendSmsPayload } from '../types'
import fetch from 'node-fetch'

export default class SmsService implements ISmsService {
  private readonly headers: Record<string, string>

  constructor(
    private readonly config: Config,
    private readonly logger: TwakeLogger,
    private readonly requestTimeoutMs = 15_000
  ) {
    if (
      config.sms_api_url === undefined ||
      config.sms_api_key === undefined ||
      config.sms_api_login === undefined
    ) {
      throw new Error('SMS API configuration is missing')
    }
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error('SMS API request timeout must be positive')
    }

    this.headers = {
      'Content-Type': 'application/json',
      'cache-control': 'no-cache',
      'api-key': config.sms_api_key,
      'api-login': config.sms_api_login
    }

    this.logger.info('[SmsService] initialized.')
  }

  /**
   * send an SMS to a single or multiple numbers using the octupush API
   *
   * @param {SMS} sms - the sms payload to send
   */
  public send = async ({ text, to }: SMS): Promise<void> => {
    // A provider that never responds must not hold an Express request open
    // indefinitely. Always cancel the timer, including on transport failure.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs)
    try {
      const response = await fetch(this.config.sms_api_url as string, {
        method: 'POST',
        body: JSON.stringify({
          recipients: to.map((number) => ({ phone_number: number })),
          sender: 'Twake',
          text,
          type: 'sms_low_cost'
        } satisfies SendSmsPayload),
        headers: this.headers,
        signal: controller.signal
      })

      if (response.status < 200 || response.status >= 300) {
        this.logger.warn('SMS API rejected the request', {
          status: response.status
        })
        throw new Error('Failed to send SMS')
      }
    } catch {
      // Provider bodies and transport errors may contain credentials or phone
      // numbers. Keep the HTTP status above, but do not log untrusted details.
      this.logger.debug('SMS API request failed')
      throw new Error('Failed to send SMS')
    } finally {
      clearTimeout(timer)
    }
  }
}
