/* eslint-disable prefer-promise-reject-errors */
import { type TwakeLogger } from '../../logger/index'
import { MatrixResolve } from '../../matrix-resolve/index'
import fetch from 'node-fetch'

const hostnameRe =
  /^((([a-zA-Z0-9][-a-zA-Z0-9]*)?[a-zA-Z0-9])[.])*([a-zA-Z][-a-zA-Z0-9]*[a-zA-Z0-9]|[a-zA-Z])(:(\d+))?$/

interface userInfoResponse {
  sub: string
}

const matrixResolve = new MatrixResolve({
  cache: 'toad-cache'
})

const validateMatrixToken = (logger: TwakeLogger) => {
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  return (matrixServer: string, accessToken: string): Promise<string> => {
    /* istanbul ignore if */
    if (!hostnameRe.test(matrixServer))
      return Promise.reject('Bad matrix_server_name')
    return new Promise((resolve, reject) => {
      matrixResolve
        .resolve(matrixServer)
        .then((baseUrl: string | string[]) => {
          if (Array.isArray(baseUrl)) baseUrl = baseUrl[0] ?? ''
          if (!baseUrl) {
            reject(new Error('Matrix resolver returned no endpoint'))
            return
          }
          // Treat the token as a single parameter. encodeURI() does not
          // escape '&', '#', '?' and can change the request's meaning.
          let endpoint: URL
          try {
            endpoint = new URL('_matrix/federation/v1/openid/userinfo', baseUrl)
            const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
            if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) ||
                endpoint.username || endpoint.password || endpoint.hash) {
              reject('Invalid server')
              return
            }
            endpoint.searchParams.set('access_token', accessToken)
          } catch {
            reject('Invalid server')
            return
          }
          fetch(endpoint.toString(), {
            // Never forward a bearer-token URL to a redirect destination.
            redirect: 'error',
            timeout: 15000
          })
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            .then((res) => {
              if (!res.ok) throw new Error('OpenID verification rejected')
              return res.json()
            })
            .then((userInfo) => {
              if ((userInfo as userInfoResponse).sub != null) {
                const cmp = (userInfo as userInfoResponse).sub.match(
                  /^@(.+?):[^:]+$/
                )
                if (cmp != null) {
                  resolve((userInfo as userInfoResponse).sub)
                } else {
                  reject('Invalid response from Matrix Server')
                }
              } else {
                logger.warn(
                  `The Matrix homeserver ${matrixServer} did not include 'sub' in its response`
                )
                reject('Invalid server')
              }
            })
            // istanbul ignore next
            .catch(() => {
              // HTTP client exceptions can embed the access_token query string.
              logger.warn('Token rejected')
              reject('Token rejected')
            })
        })
        // istanbul ignore next
        .catch((e) => {
          logger.warn(`Unable to resolve matrix server ${matrixServer}`, e)
          reject('Invalid server')
        })
    })
  }
}

export default validateMatrixToken
