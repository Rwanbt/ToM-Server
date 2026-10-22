import type MatrixIdentityServer from '..'
import { errMsg, send, type expressAppHandler } from '../../utils/index'
import { type tokenContent } from './register'

const Logout = <T extends string = never>(
  idServer: MatrixIdentityServer<T>
): expressAppHandler => {
  return (req, res) => {
    // @ts-expect-error id is defined here
    idServer.authenticate(req, res, (idToken: tokenContent, id: string) => {
      idServer.revokeToken(id)
        .then(() => {
          send(res, 200, {})
        })
        .catch(() => {
          /* istanbul ignore next */
          // Token identifiers are bearer credentials: never log the ID or a
          // database exception that may embed its value.
          idServer.logger.warn('Unable to delete access token')
          /* istanbul ignore next */
          send(res, 401, errMsg('unknownToken'))
        })
    })
  }
}

export default Logout
