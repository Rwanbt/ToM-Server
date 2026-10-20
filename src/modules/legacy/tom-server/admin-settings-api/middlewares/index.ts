import type { IAdminSettingsMiddleware } from '../types'
import type { Request, Response, NextFunction } from 'express'
import type { Config } from '../../types'
import type { TwakeLogger } from '../../../logger/index'
import { createHash, timingSafeEqual } from 'node:crypto'

export default class AdminSettingsMiddleware
  implements IAdminSettingsMiddleware
{
  constructor(
    private readonly config: Config,
    private readonly logger: TwakeLogger
  ) {}

  /**
   * Checks the access token for the admin settings
   *
   * @param {Request} req - the request
   * @param {Response} res - the response
   * @param {NextFunction} next - the next function
   */
  checkAdminSettingsToken = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const token = this.config.admin_access_token
    const authHeader = req.headers.authorization

    // An empty configuration must never authorize an empty Bearer credential.
    // Return a fixed error without printing configuration or request secrets.
    if (typeof token !== 'string' || token.trim().length === 0) {
      this.logger.error('Admin authentication is not configured')
      res.status(503).json({ error: 'Admin authentication unavailable' })
      return
    }

    if (authHeader == null || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' })
      return
    }

    const receivedToken = authHeader.slice(7) // remove "Bearer "
    const expectedDigest = createHash('sha256').update(token).digest()
    const receivedDigest = createHash('sha256').update(receivedToken).digest()
    if (!timingSafeEqual(receivedDigest, expectedDigest)) {
      res.status(403).json({ error: 'Forbidden: invalid token' })
      return
    }

    next()
  }
}
