import { supportedHashes } from '../../crypto/index'
import type MatrixIdentityServer from '..'
import { errMsg, send, type expressAppHandler } from '../../utils/index'

const hashDetails = <T extends string = never>(
  idServer: MatrixIdentityServer<T>
): expressAppHandler => {
  return (req, res) => {
    idServer.authenticate(req, res, (tokenContent, id) => {
      idServer.db
        .get('keys', ['data'], { name: 'pepper' })
        .then((rows) => {
          const pepper = rows?.[0]?.data
          if (typeof pepper !== 'string' || !pepper) {
            send(res, 500, errMsg('unknown'))
            return
          }
          send(res, 200, {
            algorithms: supportedHashes,
            lookup_pepper: pepper
          })
        })
        .catch(() => {
          /* istanbul ignore next */
          send(res, 500, errMsg('unknown'))
        })
    })
  }
}

export default hashDetails
