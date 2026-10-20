/**
 * SMS credentials are custom HTTP headers; fetch does not guarantee they will
 * be removed when following redirects across origins. Never send them over
 * unencrypted remote HTTP, or to an endpoint with embedded URL credentials.
 *
 * Loopback HTTP is allowed for disposable integration tests only. A remote
 * provider must always use HTTPS, including when an operator misconfigures it.
 */
export function assertSecureSmsProviderUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Invalid SMS API endpoint')
  }

  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const secure = url.protocol === 'https:' || (loopback && url.protocol === 'http:')
  if (!secure || url.username || url.password || url.hash) {
    // Never include the rejected URL; it might contain API credentials.
    throw new Error('Invalid SMS API endpoint')
  }
}
