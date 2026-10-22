import { type TwakeLogger } from '../logger/index'
import { type Request, type Response } from 'express'
import type http from 'http'
import { type tokenContent } from './account/register'
import type IdentityServerDb from './db'
import { errMsg, send } from '../utils/index'

export type AuthenticationFunction = (
  req: Request | http.IncomingMessage,
  res: Response | http.ServerResponse,
  callback: (data: tokenContent, id: string | null) => void,
  requiresTerms?: boolean
) => void

/**
 * Payload stored in place of a session when its bearer credential is revoked.
 *
 * A revoked credential is kept as a marker instead of being removed: the
 * marker carries no subject, so every authentication path rejects it, and no
 * cached identity can take its place.
 */
export const REVOKED_TOKEN_MARKER: string = JSON.stringify({ revoked: true })

/**
 * Tells whether a stored session payload is a revocation marker.
 *
 * @param data - The raw payload of the session row.
 * @returns `true` when the credential has been revoked.
 */
export const isRevokedToken = (data: unknown): boolean => {
  if (typeof data !== "string") {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(data)
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "revoked" in parsed &&
      (parsed as { revoked?: unknown }).revoked === true
    )
  } catch {
    return false
  }
}

export const Authenticate = <T extends string = never>(
  db: IdentityServerDb<T>,
  logger: TwakeLogger
): AuthenticationFunction => {
  const tokenRe = /^Bearer (\S+)$/
  return (req, res, callback, requiresTerms = true) => {
    let token: string | null = null
    if (req.headers.authorization != null) {
      token = tokenRe.exec(req.headers.authorization)?.[1] ?? null
    } else if ('query' in req && req.query && typeof req.query === 'object') {
      // Express may parse repeated/nested access_token parameters into arrays
      // or objects. Never forward those untrusted types to the token store.
      // Do not fall back to a query token when an Authorization header exists.
      const queryToken = Object.prototype.hasOwnProperty.call(req.query, 'access_token')
        ? (req.query as Record<string, unknown>).access_token
        : undefined
      if (typeof queryToken === 'string' && /^\S+$/.test(queryToken)) {
        token = queryToken
      }
    }
    if (token != null) {
      db.get('accessTokens', ['data'], { id: token })
        .then((rows) => {
          const stored = rows?.[0]
          if (!stored || typeof stored.data !== 'string') {
            // Never log a bearer token, including tokens that are unknown to us.
            logger.error(`${req.socket.remoteAddress as string} sent an inexistent token`)
            send(res, 401, errMsg('unAuthorized'))
          } else {
            let parsed: unknown
            try {
              parsed = JSON.parse(stored.data)
            } catch {
              send(res, 401, errMsg('unAuthorized'))
              return
            }
            if (!parsed || typeof parsed !== 'object' || !('sub' in parsed) ||
                typeof parsed.sub !== 'string' || parsed.sub.length === 0) {
              send(res, 401, errMsg('unAuthorized'))
              return
            }
            const content = parsed as tokenContent
            if (requiresTerms) {
              db.get('userPolicies', ['policy_name', 'accepted'], {
                user_id: content.sub
              })
                .then((policies) => {
                  if (policies.length === 0) {
                    callback(content, token)
                    // If there are no policies to accept. This assumes that for each policy we add to the config, we update the database and add the corresponding policy with accepted = 0 for all users
                    return
                  }
                  const notAcceptedTerms = policies.find(
                    (row) => row.accepted === 0
                  ) // We assume the terms database contains all policies. If we update the policies we must also update the database and add the corresponding policy with accepted = 0 for all users
                  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                  if (notAcceptedTerms) {
                    logger.error(
                      `Please accept our updated terms of service before continuing.`
                    )
                    send(res, 403, errMsg('termsNotSigned'))
                  } else {
                    callback(content, token)
                  }
                })
                .catch((e) => {
                  // Policy DB exceptions can include bearer-token lookup keys.
                  logger.error('Could not check current terms of service')
                  send(res, 403, errMsg('termsNotSigned'))
                })
            } else {
              callback(content, token)
            }
          }
        })
        .catch(() => {
          // Database errors may contain the lookup key (the full bearer token).
          // Do not pass untrusted exception objects into an application logger.
          logger.error(`${req.socket.remoteAddress as string} sent an invalid token`)
          send(res, 401, errMsg('unAuthorized'))
        })
    } else {
      logger.error(
        `${req.socket.remoteAddress as string} tried to access without token`
      )
      send(res, 401, errMsg('unAuthorized'))
    }
  }
}

/**
 * Builds a URL from a base URL and a path
 *
 * @param {string} base - Base URL
 * @param {string} path - Path
 * @returns {string} - Combined URL
 */
export const buildUrl = (base: string, path: string): string => {
  let formattedUrl = base

  if (
    !formattedUrl.startsWith('https://') &&
    !formattedUrl.startsWith('http://')
  ) {
    formattedUrl = `https://${formattedUrl}`
  }

  const baseUrl = new URL(formattedUrl)

  if (!baseUrl.pathname.endsWith('/')) {
    baseUrl.pathname += '/'
  }

  const processedPath = path.startsWith('/') ? path.slice(1) : path
  const finalUrl = new URL(processedPath, baseUrl.href)

  return finalUrl.toString()
}

/**
 * Extracts the server name from a Matrix ID
 *
 * @param {string} mxid
 * @return {string}
 */
export const getServerNameFromMatrixId = (mxid: string): string => {
  return mxid.split(':')[1] ?? ''
}
