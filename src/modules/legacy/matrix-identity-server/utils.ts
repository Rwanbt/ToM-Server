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

export const Authenticate = <T extends string = never>(
  db: IdentityServerDb<T>,
  logger: TwakeLogger
): AuthenticationFunction => {
  const tokenRe = /^Bearer (\S+)$/
  return (req, res, callback, requiresTerms = true) => {
    let token: string | null = null
    if (req.headers.authorization != null) {
      const re = req.headers.authorization.match(tokenRe)
      if (re != null) {
        token = re[1] ?? null
      }
      // @ts-expect-error req.query exists
    } else if (req.query && Object.keys(req.query).length > 0) {
      // @ts-expect-error req.query.access_token may be null
      token = req.query.access_token
    }
    if (token != null) {
      const authenticatedToken = token
      db.get('accessTokens', ['data'], { id: token })
        .then((rows) => {
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          const tokenRow = rows?.[0]
          if (!tokenRow || typeof tokenRow.data !== 'string') {
            // Never log a bearer token, including tokens that are unknown to us.
            logger.error(`${req.socket.remoteAddress as string} sent an inexistent token`)
            send(res, 401, errMsg('unAuthorized'))
          } else {
            if (requiresTerms) {
              db.get('userPolicies', ['policy_name', 'accepted'], {
                user_id: JSON.parse(tokenRow.data).sub
              })
                .then((policies) => {
                  if (policies.length === 0) {
                    callback(JSON.parse(tokenRow.data), authenticatedToken)
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
                    callback(JSON.parse(tokenRow.data), authenticatedToken)
                  }
                })
                .catch((e) => {
                  logger.error(
                    `Please accept our updated terms of service before continuing.`,
                    e
                  )
                  send(res, 403, errMsg('termsNotSigned'))
                })
            } else {
              callback(JSON.parse(tokenRow.data), token)
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
  const server = mxid.split(':')[1]
  if (!server) throw new Error('Invalid Matrix ID: missing server name')
  return server
}
