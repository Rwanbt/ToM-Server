import type { TwakeLogger } from '../../logger/index'
import { type Config, type ISMSService, type SendSmsPayload } from '../types'
import { buildUrl } from '../utils'
import { assertSecureSmsProviderUrl } from '../../utils/sms-provider-security'

export class SmsService implements ISMSService {
  private API_ENDPOINT: string
  private HEADERS: Record<string, string>
  private readonly sender: string = 'Twake Chat'
  private readonly SEND_ENDPOINT = '/sms-campaign/send'

  constructor(
    private readonly config: Config,
    private readonly logger: TwakeLogger
  ) {
    const { sms_api_key, sms_api_login, sms_api_url } = this.config

    if (!sms_api_key || !sms_api_login || !sms_api_url) {
      this.logger.error('SMS API configuration is missing')
    }
    if (sms_api_url) assertSecureSmsProviderUrl(sms_api_url)

    this.API_ENDPOINT = buildUrl(sms_api_url as string, this.SEND_ENDPOINT)
    this.HEADERS = {
      'Content-Type': 'application/json',
      'api-login': sms_api_login as string,
      'api-key': sms_api_key as string
    }

    this.logger.info('[SmsService] initialized.')
  }

  /**
   * sends an sms to the given number
   *
   * @param {string} to - the number to send the sms to
   * @param {string} text - the body of the sms to send
   */
  async send(to: string, text: string): Promise<void> {
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        headers: this.HEADERS,
        redirect: 'error',
        signal: controller.signal,
        body: JSON.stringify({
          sender: 'Twake',
          recipients: [{ phone_number: to }],
          text,
          type: 'sms_low_cost'
        } satisfies SendSmsPayload)
      })

      if (response.status !== 200 && response.status !== 201) {
        throw new Error('Failed to send SMS')
      }
    } catch {
      // Never expose untrusted provider errors, phone numbers or API headers.
      this.logger.error('Failed to send SMS')
      throw new Error('Failed to send SMS')
    } finally {
      clearTimeout(deadline)
    }
  }
}
