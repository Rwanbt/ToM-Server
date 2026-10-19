/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/dot-notation */
import { afterEach, beforeEach, describe, expect, it, mock, spyOn, test, vi, type Mock } from 'bun:test'
import AdminService from '../services'
import conf from '../../../defaultConfig.json'

interface MockLogger {
  info: Mock<(...args: any[]) => any>
  warn: Mock<(...args: any[]) => any>
  error: Mock<(...args: any[]) => any>
}

const makeLogger = (): MockLogger => ({
  info: mock(),
  warn: mock(),
  error: mock()
})

conf.matrix_server = 'https://matrix.example.com'

describe('AdminService', () => {
  let service: AdminService
  let logger: MockLogger

  beforeEach(() => {
    logger = makeLogger()
    service = new AdminService(conf as any, logger as any)
  })

  afterEach(() => {
    mock.restore()
    vi.resetAllMocks()
  })

  describe('_getAdminAccessToken', () => {
    it('throws if tokenService fails', async () => {
      spyOn(service['tokenService'], 'getAccessTokenWithCreds')
        .mockResolvedValue(null)

      await expect(service['_getAdminAccessToken']()).rejects.toThrow(
        'Failed to get access token'
      )
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get access token')
      )
    })

    it('does not leak an admin credential from an upstream failure', async () => {
      const sensitiveCredential = 'admin-api-token-do-not-log-974'
      spyOn(service['tokenService'], 'getAccessTokenWithCreds')
        .mockRejectedValue(new Error(sensitiveCredential))

      await expect(service['_getAdminAccessToken']()).rejects.toThrow(
        'Failed to get access token'
      )
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
        sensitiveCredential
      )
    })

    it('returns a token if tokenService succeeds', async () => {
      spyOn(service['tokenService'], 'getAccessTokenWithCreds')
        .mockResolvedValue('fake-token')
      const token = await service['_getAdminAccessToken']()
      expect(token).toBe('fake-token')
    })
  })

  describe('_getCachedToken and _invalidateToken', () => {
    it('fetches and caches a token if not cached', async () => {
      spyOn(service as any, '_getAdminAccessToken')
        .mockResolvedValue('cached-token')

      const t1 = await service['_getCachedToken']()
      const t2 = await service['_getCachedToken']()

      expect(t1).toBe('cached-token')
      expect(t2).toBe('cached-token')
      expect(logger.info).toHaveBeenCalledWith('Cached new admin token')
    })

    it('invalidates cached token', async () => {
      spyOn(service as any, '_getAdminAccessToken')
        .mockResolvedValue('token-to-invalidate')

      await service['_getCachedToken']()
      service['_invalidateToken']()

      expect(service['cache'].get(service['TOKEN_KEY'])).toBeUndefined()
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalidating cached admin token'
      )
    })
  })

  describe('_doFetch', () => {
    it('calls fetch with proper headers', async () => {
      const mockFetch = mock().mockResolvedValue({ ok: true })
      global.fetch = mockFetch as any

      const token = 'abc'
      const res = await service['_doFetch'](
        'endpoint',
        { method: 'POST' },
        token
      )

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${token}` })
        })
      )
      expect(res.ok).toBe(true)
    })
  })

  describe('makeRequestWithAdminToken', () => {
    it('does not expose an endpoint query token in the retry-exhaustion error', async () => {
      const secret = 'admin-query-token-secret-493'
      spyOn(service as any, '_getCachedToken').mockResolvedValue('token')
      spyOn(service as any, '_doFetch').mockResolvedValue({ status: 401 } as any)

      let message = ''
      try {
        await service.makeRequestWithAdminToken(`https://matrix.example.com/?token=${secret}`, {}, 0)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message).toContain('failed after 1 attempts')
      expect(message).not.toContain(secret)
    })
    it('returns response if status != 401', async () => {
      spyOn(service as any, '_getCachedToken').mockResolvedValue('token')
      spyOn(service as any, '_doFetch')
        .mockResolvedValue({ status: 200 } as any)

      const res = await service.makeRequestWithAdminToken('endpoint')
      expect(res.status).toBe(200)
    })

    it('retries on 401 and throws after maxRetries', async () => {
      spyOn(service as any, '_getCachedToken').mockResolvedValue('token')
      spyOn(service as any, '_doFetch')
        .mockResolvedValue({ status: 401 } as any)

      await expect(
        service.makeRequestWithAdminToken('endpoint', {}, 1)
      ).rejects.toThrow(/failed after 2 attempts/)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Received 401 Unauthorized (attempt 1)')
      )
    })
  })

  describe('_fetchAndUploadAvatar', () => {
    it('rejects local metadata and non-HTTPS avatar URLs before making any request', async () => {
      const outgoing = spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any)
      for (const url of [
        'http://169.254.169.254/latest/meta-data/',
        'http://avatar.example.com/photo.png',
        'https://127.0.0.1:8443/internal',
        'https://[::1]/internal',
        'https://localhost/admin',
        'https://user:password@avatar.example.com/avatar.png'
      ]) {
        await expect(service['_fetchAndUploadAvatar'](url))
          .rejects.toThrow('Avatar source not permitted')
      }
      expect(outgoing).not.toHaveBeenCalled()
    })

    it('rejects redirecting avatar providers before following their Location', async () => {
      const response = new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/private' }
      })
      const outgoing = spyOn(global, 'fetch').mockResolvedValueOnce(response)
      await expect(service['_fetchAndUploadAvatar']('https://avatar.example.com/img.png'))
        .rejects.toThrow()
      expect(outgoing).toHaveBeenCalledTimes(1)
      expect(outgoing).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: 'error' })
      )
    })

    it('bounds avatar download size even if the remote response omits Content-Length', async () => {
      const chunks = [new Uint8Array(3 * 1024 * 1024), new Uint8Array(3 * 1024 * 1024)]
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks.shift()
          if (chunk) controller.enqueue(chunk)
          else controller.close()
        }
      })
      spyOn(global, 'fetch').mockResolvedValueOnce(new Response(stream))
      await expect(service['_fetchAndUploadAvatar']('https://avatar.example.com/img.png'))
        .rejects.toThrow('Avatar file too large')
    })
    it('does not log the sensitive avatar URL during a fetch failure', async () => {
      const secret = 'private-avatar-query-secret-493'
      spyOn(global, 'fetch').mockRejectedValueOnce(new Error('upstream failure'))
      await expect(service['_fetchAndUploadAvatar'](`https://avatar.example.com/?token=${secret}`))
        .rejects.toThrow()
      expect(Bun.inspect(logger.info.mock.calls)).not.toContain(secret)
      expect(Bun.inspect(logger.error.mock.calls)).not.toContain(secret)
    })
    it('uploads avatar and returns MXC URL', async () => {
      const fakeMxc = 'mxc://example/avatar'
      const bufferMock = Buffer.from('test')
      const fetchResp: any = new Response(bufferMock)
      const uploadResp: any = {
        ok: true,
        json: async () => ({ content_uri: fakeMxc })
      }

      spyOn(global, 'fetch').mockResolvedValueOnce(fetchResp)
      spyOn(service, 'makeRequestWithAdminToken')
        .mockResolvedValueOnce(uploadResp as any)

      const mxc = await service['_fetchAndUploadAvatar'](
        'https://avatar.example.com/img.png'
      )
      expect(mxc).toBe(fakeMxc)
    })

    it('throws if fetch fails', async () => {
      spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'ERR'
      } as any)
      await expect(
        service['_fetchAndUploadAvatar']('https://avatar.example.com')
      ).rejects.toThrow('Failed to fetch avatar: 500 ERR')
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Avatar upload failed')
      )
    })
  })

  describe('updateUserInformation', () => {
    it('does not log personal profile fields on successful update', async () => {
      const secret = 'private-user-id-493'
      const name = 'Private Display Name 493'
      spyOn(service, 'makeRequestWithAdminToken')
        .mockResolvedValue({ ok: true, json: async () => ({}) } as any)
      await service.updateUserInformation(secret, { displayName: name })
      expect(Bun.inspect(logger.info.mock.calls)).not.toContain(secret)
      expect(Bun.inspect(logger.info.mock.calls)).not.toContain(name)
    })
    it('sends displayName only if no avatarUrl', async () => {
      spyOn(service, 'makeRequestWithAdminToken')
        .mockResolvedValue({ ok: true, json: async () => ({}) } as any)

      await service.updateUserInformation('user1', { displayName: 'Alice' })

      expect(logger.info).toHaveBeenCalledWith('Updating user profile')
    })

    it('sends displayName and avatar_url if avatarUrl provided', async () => {
      const mxc = 'mxc://avatar'
      spyOn(service as any, '_fetchAndUploadAvatar').mockResolvedValue(mxc)
      spyOn(service, 'makeRequestWithAdminToken')
        .mockResolvedValue({ ok: true, json: async () => ({}) } as any)

      await service.updateUserInformation('user1', {
        displayName: 'Alice',
        avatarUrl: 'http://avatar.url'
      })

      expect(logger.info).toHaveBeenCalledWith('Updating user profile')
    })

    it('throws if makeRequestWithAdminToken fails', async () => {
      spyOn(service, 'makeRequestWithAdminToken').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'ERR',
        json: async () => ({})
      } as any)

      await expect(
        service.updateUserInformation('user1', { displayName: 'Alice' })
      ).rejects.toThrow('Failed to update profile: 500 ERR')
    })
  })
})
