import { type TwakeLogger } from '../../../logger/index'
import { type tokenContent } from '../../../matrix-identity-server/index'
import { Authenticate as RemoteAuthenticate } from '../../../matrix-identity-server/index'
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
      if (typeof query?.access_token === 'string' && query.access_token.length > 0) {
        token = query.access_token
      }
    }
    if (token != null) {
      db.get('matrixTokens', ['data'], { id: token })
        .then((rows) => {
          const stored = rows?.[0]?.data
          if (typeof stored !== 'string') {
            throw Error()
          }
          const data: unknown = JSON.parse(stored)
          if (!data || typeof data !== 'object' || !('sub' in data) ||
              typeof data.sub !== 'string' || !data.sub) {
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
              if (typeof uid === 'string' && uid.length > 0) {
                const data: tokenContent = {
                  sub: uid,
                  epoch: epoch()
                }
                // STORE
                db.insert('matrixTokens', {
                  // eslint-disable-next-line n/no-callback-literal
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
                  // @ts-ignore token is defined
                  id: token,
                  data: JSON.stringify(data)
                }).catch(() => {
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
