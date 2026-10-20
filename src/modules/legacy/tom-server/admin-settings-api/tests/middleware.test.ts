import { afterEach, beforeEach, describe, expect, it, mock, type Mock } from 'bun:test'
import AdminSettingsMiddleware from '../middlewares'
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

describe('AdminSettingsMiddleware', () => {
  let middleware: AdminSettingsMiddleware
  let logger: MockLogger
  let req: any
  let res: any
  let next: Mock<(...args: any[]) => any>

  beforeEach(() => {
    logger = makeLogger()
    middleware = new AdminSettingsMiddleware(conf as any, logger as any)

    req = {
      headers: {}
    }
    res = {
      status: mock().mockReturnThis(),
      json: mock()
    }
    next = mock()
  })

  afterEach(() => {
    mock.restore()
  })

  describe('checkAdminSettingsToken', () => {
    it('rejects a missing configured admin credential even if caller supplies Bearer empty', () => {
      const insecure = new AdminSettingsMiddleware(
        { ...conf, admin_access_token: '' } as any,
        logger as any
      )
      req.headers.authorization = 'Bearer '
      insecure.checkAdminSettingsToken(req, res, next)
      expect(res.status).toHaveBeenCalledWith(503)
      expect(next).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledWith('Admin authentication is not configured')
    })

    it('rejects short, malformed and whitespace-bearing tokens without calling next', () => {
      const configured = new AdminSettingsMiddleware(
        { ...conf, admin_access_token: 'some-secure-secret' } as any,
        logger as any
      )
      for (const value of ['Bearer some-secure-secre', 'Bearer some-secure-secret ', 'Bearer  some-secure-secret']) {
        res.status.mockClear()
        next.mockClear()
        req.headers.authorization = value
        configured.checkAdminSettingsToken(req, res, next)
        expect(res.status).toHaveBeenCalledWith(403)
        expect(next).not.toHaveBeenCalled()
      }
    })
    it('should return 401 if Authorization header is missing', () => {
      middleware.checkAdminSettingsToken(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing or invalid Authorization header'
      })
      expect(next).not.toHaveBeenCalled()
    })

    it('should return 401 if Authorization header is invalid', () => {
      req.headers.authorization = 'InvalidHeader token'
      middleware.checkAdminSettingsToken(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing or invalid Authorization header'
      })
      expect(next).not.toHaveBeenCalled()
    })

    it('should return 403 if token does not match', () => {
      req.headers.authorization = 'Bearer wrong-token'
      middleware.checkAdminSettingsToken(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: invalid token'
      })
      expect(next).not.toHaveBeenCalled()
    })

    it('should call next if token matches', () => {
      req.headers.authorization = `Bearer ${conf.admin_access_token}`

      middleware.checkAdminSettingsToken(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })
  })
})
