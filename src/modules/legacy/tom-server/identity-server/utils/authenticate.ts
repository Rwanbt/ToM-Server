import { type TwakeLogger } from '../../../logger/index'
import { type tokenContent } from '../../../matrix-identity-server/index'
import { Authenticate as RemoteAuthenticate } from '../../../matrix-identity-server/index'
import { isRevokedToken } from '../../../matrix-identity-server/utils'
import { epoch, errMsg, send } from '../../../utils/index'
import fetch from 'node-fetch'
import type { AuthenticationFunction, Config, TwakeDB } from '../../types'

export interface WhoAmIResponse {
  user_id?: string
  is_guest?: string
  device_id?: string
}

const Authenticate = (
  db: TwakeDB,
  conf: Config,
  logger: TwakeLogger,
  fetchWhoAmI: typeof fetch = fetch
): AuthenticationFunction => {
  const tokenRe = /^Bearer (\S+)$/
  // Local Matrix identity caching is a performance optimization, not a
  // permanent grant. Old credentials must be checked with the homeserver so
  // revoked devices do not stay authenticated indefinitely.
  const maxCachedTokenAgeMs = 5 * 60 * 1000
  const validMatrixUserId = (value: unknown): value is string =>
    typeof value === 'string' && /^@[^:\s]+:[^\s]+$/.test(value)
  const remoteAuth = RemoteAuthenticate(db, logger)
  return (req, res, callback) => {
    let token: string | null = null
    if (req.headers?.authorization != null) {
      const re = req.headers.authorization.match(tokenRe)
      if (re != null) {
        token = re[1] ?? null
      }
    } else {
      const query = (req as unknown as { query?: { access_token?: unknown } }).query
      // Express parsers can supply arrays and objects for repeated or nested
      // query keys; only a single, nonempty bearer credential is valid.
      if (query && Object.prototype.hasOwnProperty.call(query, 'access_token') &&
        typeof query.access_token === 'string' && /^\S+$/.test(query.access_token)) {
        token = query.access_token
      }
    }
    if (token != null) {
      let hasCachedToken = false
      // The revocation marker lives in the session store: it must be read
      // before the identity cache, otherwise a revoked credential would keep
      // authenticating from the cache.
      db.get('accessTokens', ['data'], { id: token })
        .then((rows) => {
          const stored = rows?.[0]?.data
          if (isRevokedToken(stored)) {
            // A revoked credential must not authenticate, even when a cached
            // homeserver identity still exists for it.
            send(res, 401, errMsg('unAuthorized'))
            return undefined
          }
          if (typeof stored === 'string') {
            // Registration-issued ToM grants must use the identity server's terms-aware local authorizer.
            let localSession: unknown
            try {
              localSession = JSON.parse(stored)
            } catch {
              send(res, 401, errMsg('unAuthorized'))
              return undefined
            }
            if (!localSession || typeof localSession !== 'object' || !('sub' in localSession) ||
                !validMatrixUserId(localSession.sub) || !('epoch' in localSession) ||
                typeof localSession.epoch !== 'number' || !Number.isFinite(localSession.epoch) ||
                localSession.epoch > epoch()) {
              send(res, 401, errMsg('unAuthorized'))
              return undefined
            }
            remoteAuth(req, res, callback)
            return undefined
          }
          return db.get('matrixTokens', ['data'], { id: token })
        })
        .then((rows) => {
          if (rows === undefined) {
            return
          }
          const stored = rows?.[0]?.data
          hasCachedToken = typeof stored === 'string'
          if (typeof stored !== 'string') {
            throw Error()
          }
          const data: unknown = JSON.parse(stored)
          if (!data || typeof data !== 'object' || !('sub' in data) ||
              !validMatrixUserId(data.sub) || !('epoch' in data) ||
              typeof data.epoch !== 'number' || !Number.isFinite(data.epoch) ||
              data.epoch > epoch() || epoch() - data.epoch > maxCachedTokenAgeMs) {
            throw new Error('Token subject is invalid')
          }
          callback(data as tokenContent, token)
        })
        .catch((e) => {
          // Try to get token from matrix
          fetchWhoAmI(
            `https://${conf.matrix_server}/_matrix/client/r0/account/whoami`,
            {
              headers: {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                Authorization: `Bearer ${token}`
              }
            }
          )
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            .then((res) => {
              if (!res.ok) throw new Error('Matrix whoami failed')
              return res.json()
            })
            .then((userInfo) => {
              const uid = (userInfo as WhoAmIResponse | null)?.user_id
              /* istanbul ignore else */
              // A successful HTTP response without a Matrix user ID must not
              // become an authenticated local session.
              if (validMatrixUserId(uid)) {
                const data: tokenContent = {
                  sub: uid,
                  epoch: epoch()
                }
                // Replace an expired cached identity after authoritative
                // revalidation; inserting a duplicate would leave it expired
                // and force every subsequent request back to the homeserver.
                const persistence = hasCachedToken
                  ? db.update('matrixTokens', { data: JSON.stringify(data) }, 'id', token)
                  : db.insert('matrixTokens', { id: token, data: JSON.stringify(data) })
                persistence.catch(() => {
                  /* istanbul ignore next */
                  logger.error('Unable to insert a token')
                })
                // eslint-disable-next-line n/no-callback-literal
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
                // @ts-ignore token is defined
                callback(data, token)
              } else {
                logger.info('Bad local token, trying remote')
                remoteAuth(req, res, (...args) => {
                  logger.info(
                    '[From Remote]: Token that locally failed was validated'
                  )
                  callback(...args)
                })
              }
            })
            .catch(() => {
              /* istanbul ignore next */
              logger.debug('Fetch error')
              /* istanbul ignore next */
              send(res, 401, errMsg('unAuthorized'))
            })
        })
    } else {
      // Headers can contain cookies or Authorization secrets from other schemes.
      logger.warn('Access tried without token')
      send(res, 401, errMsg('unAuthorized'))
    }
  }
}

export default Authenticate
