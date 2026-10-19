import type { TwakeLogger } from '../../../logger/index'
import type { Config, ISMSService, SendSmsPayload } from '../../types'
import { buildUrl } from '../../utils'
import { assertSecureSmsProviderUrl } from '../../../utils/sms-provider-security'

export default class SmsService implements ISMSService {
  private API_ENDPOINT: string
  private HEADERS: Record<string, string>
  private readonly SENDER: string = 'Twake'
  private readonly SEND_ENDPOINT = '/sms-campaign/send'

  /**
   * Constructor for SmsService
   *
   * @param {Config} config - The configuration object
   * @param {TwakeLogger} logger - The logger instance
   */
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
          sender: this.SENDER,
          recipients: [{ phone_number: to }],
          text
        } satisfies SendSmsPayload)
      })

      if (response.status !== 200 && response.status !== 201) {
        // Provider response text can disclose phone numbers and credentials.
        throw new Error('Failed to send SMS')
      }
    } catch {
      this.logger.error('Failed to send SMS')
      throw new Error('Failed to send SMS')
    } finally {
      clearTimeout(deadline)
    }
  }
}
