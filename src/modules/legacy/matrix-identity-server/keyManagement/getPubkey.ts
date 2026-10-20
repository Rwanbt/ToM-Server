import { type Request } from 'express'
import type IdentityServerDB from '../db'
import { errMsg, send, type expressAppHandler } from '../../utils/index'

const getPubkey = <T extends string = never>(
  idServer: IdentityServerDB<T>
): expressAppHandler => {
  return (req, res) => {
    const keyID = (req as Request).params.keyId
    if (typeof keyID !== 'string' || !keyID) {
      send(res, 400, errMsg('invalidParam', 'keyId is required'))
      return
    }

    idServer.db
      .get('shortTermKeypairs', ['public'], { keyID })
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      .then((rows) => {
        const key = rows.length === 1 ? rows[0] : undefined
        if (key && typeof key.public === 'string') {
          send(res, 200, { public_key: key.public })
        } else {
          return idServer.db
            .get('longTermKeypairs', ['public'], { keyID })
            .then((rows) => {
              const key = rows[0]
              if (!key || typeof key.public !== 'string') {
                send(
                  res,
                  404,
                  errMsg('notFound', 'The public key was not found')
                )
              } else {
                send(res, 200, { public_key: key.public })
              }
            })
        }
      })
      .catch(() => {
        // DB exception text can include credentials: never echo it in logs or HTTP.
        /* istanbul ignore next */
        send(res, 500, errMsg('unknown'))
      })
  }
}

export default getPubkey
