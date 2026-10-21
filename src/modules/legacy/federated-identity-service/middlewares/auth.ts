import { type TwakeLogger } from '../../logger/index'
import { errMsg, send } from '../../utils/index'
import { Utils, type tokenContent } from '../../matrix-identity-server/index'
import { type NextFunction, type Response } from 'express'
import { type AuthRequest, type FdServerDb } from '../types'
import { convertToIPv6 } from '../utils/ip-address'

const tokenTrustedServer = 'TOKEN_TRUSTED_SERVER'

export const Authenticate = (
  db: FdServerDb,
  trustedServersList: string[],
  trustXForwardedForHeader: boolean,
  logger: TwakeLogger
): Utils.AuthenticationFunction => {
  const trustedServersListAsIPv6 = trustedServersList.map((ip) =>
    convertToIPv6(ip)
  )
  const tokenRe = /^Bearer (\S+)$/
  return (req, res, callbackMethod) => {
    const request = req as AuthRequest
    // Matrix permits access_token in the query. Never include that query in
    // structured request logs, even on an authorization failure.
    const safeEndpointPath = request.originalUrl?.split('?')[0] ?? ''
    // Keep an IPv6 address intact: splitting on ':' discards most of it.
    // Only a deployment explicitly trusting its reverse proxy may inspect
    // X-Forwarded-For, and the originating hop is the first comma-separated IP.
    const forwarded = trustXForwardedForHeader ? request.headers['x-forwarded-for'] : undefined
    const originalRequesterIPAddress = (
      typeof forwarded === 'string' && forwarded.trim()
        ? forwarded.split(',')[0]?.trim()
        : request.socket.remoteAddress
    ) ?? ''

    logger.info('', {
      ip: originalRequesterIPAddress,
      httpMethod: request.method,
      endpointPath: safeEndpointPath
    })
    try {
      const requesterIPAddress = convertToIPv6(originalRequesterIPAddress)
      logger.debug(`Authenticated request from ${originalRequesterIPAddress}`)
      // istanbul ignore if
      if (trustedServersListAsIPv6.some(ip => ip.correctForm() === requesterIPAddress.correctForm())) {
        logger.debug('IP is in list')
        callbackMethod({ sub: '', epoch: 0 }, tokenTrustedServer)
      } else if (
        trustedServersListAsIPv6.some((ip) => {
          const res = requesterIPAddress.isInSubnet(ip)
          if (res) logger.debug(`IP is in ${ip.address}`)
          return res
        })
      ) {
        callbackMethod({ sub: '', epoch: 0 }, tokenTrustedServer)
      } else {
        logger.debug(`${originalRequesterIPAddress} isn't in white list`)
        let token: string | null = null
        if (req.headers.authorization != null) {
          const re = req.headers.authorization.match(tokenRe)
          if (re != null) {
            token = re[1] ?? null
          }
        } else {
          const query = (req as unknown as { query?: { access_token?: unknown } }).query
          if (query && Object.prototype.hasOwnProperty.call(query, 'access_token') &&
        typeof query.access_token === 'string' && /^\S+$/.test(query.access_token)) {
            token = query.access_token
          }
        }
        if (token != null) {
          db.get('accessTokens', ['data'], { id: token })
            .then((rows) => {
              const stored = rows?.[0]?.data
              if (typeof stored !== 'string') {
                send(res, 401, errMsg('unAuthorized'))
                return
              }
              const parsed: unknown = JSON.parse(stored)
              if (!parsed || typeof parsed !== 'object' || !('sub' in parsed) ||
                typeof parsed.sub !== 'string' || !parsed.sub) {
                send(res, 401, errMsg('unAuthorized'))
                return
              }
              callbackMethod(parsed as tokenContent, token)
            })
            .catch((e) => {
              send(res, 401, errMsg('unAuthorized'))
            })
        } else {
          send(res, 401, errMsg('unAuthorized'))
        }
      }
    } catch {
      logger.debug('Unable to authorize federated identity request')
      logger.error(`Unauthorized`, {
        ip: originalRequesterIPAddress,
        httpMethod: request.method,
        endpointPath: safeEndpointPath
      })
      send(res, 401, errMsg('unAuthorized'))
    }
  }
}

export const auth = (authenticator: Utils.AuthenticationFunction) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    authenticator(req, res, (data: tokenContent, token: string | null) => {
      if (token === tokenTrustedServer) {
        next()
        return
      }
      /* istanbul ignore if */
      if (data.sub === undefined) {
        throw new Error('Invalid data')
      }
      req.userId = data.sub
      if (token != null) {
        req.accessToken = token
      }
      next()
    })
  }
}
