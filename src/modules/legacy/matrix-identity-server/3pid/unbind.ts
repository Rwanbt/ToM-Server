import type MatrixIdentityServer from '..'
import {
  errMsg,
  jsonContent,
  send,
  validateParameters,
  type expressAppHandler
} from '../../utils/index'

const clientSecretRe = /^[0-9a-zA-Z.=_-]{6,255}$/
const mxidRe = /^@[0-9a-zA-Z._=-]+:[0-9a-zA-Z.-]+$/
const sidRe = /^[0-9a-zA-Z.=_-]{1,255}$/

interface RequestTokenArgs {
  client_secret: string
  mxid: string
  sid: string
  threepid: {
    address: string
    medium: string
  }
}

const schema = {
  client_secret: false,
  mxid: true,
  sid: false,
  threepid: true
}

const unbind = <T extends string = never>(
  idServer: MatrixIdentityServer<T>
): expressAppHandler => {
  return (req, res) => {
    idServer.authenticate(req, res, (data, id) => {
      jsonContent(req, res, idServer.logger, (obj) => {
        validateParameters(res, schema, obj, idServer.logger, (obj) => {
          if (
            (obj as RequestTokenArgs).client_secret != null &&
            (obj as RequestTokenArgs).sid != null
          ) {
            const clientSecret = (obj as RequestTokenArgs).client_secret
            const mxid = (obj as RequestTokenArgs).mxid
            const sid = (obj as RequestTokenArgs).sid
            if (!clientSecretRe.test(clientSecret)) {
              send(res, 400, errMsg('invalidParam', 'invalid client_secret'))
            } else if (!mxidRe.test(mxid)) {
              send(res, 400, errMsg('invalidParam', 'invalid Matrix user ID'))
            } else if (!sidRe.test(sid)) {
              // istanbul ignore next
              send(res, 400, errMsg('invalidParam', 'invalid session ID'))
            } else {
              idServer.db
                .get('mappings', ['address'], {
                  session_id: sid,
                  client_secret: clientSecret
                })
                .then((rows) => {
                  const mapping = rows[0]
                  if (!mapping) {
                    send(
                      res,
                      403,
                      errMsg(
                        'invalidParam',
                        'invalid session ID or client_secret'
                      )
                    )
                  } else {
                    if (
                      (obj as RequestTokenArgs).threepid.address !==
                      mapping.address
                    ) {
                      send(res, 403, errMsg('invalidParam', 'invalid address'))
                    } else {
                      idServer.db
                        .deleteEqual('hashes', 'value', mxid)
                        .then(() => {
                          send(res, 200, {})
                        })
                        .catch(() => {
                          // istanbul ignore next
                          // Database errors can echo the client secret or sid.
                          idServer.logger.error('Error deleting 3pid association')
                          send(res, 500, errMsg('unknown'))
                        })
                    }
                  }
                })
                .catch(() => {
                  // istanbul ignore next
                  idServer.logger.error(
                    'Error finding 3pid associated with this session_id or client_secret'
                  )
                  send(res, 500, errMsg('unknown'))
                })
            }
          } else {
            // Signed unbind is not implemented. Do not leave a request open,
            // or treat an unauthenticated omission as authorization.
            send(res, 400, errMsg('invalidParam', 'client_secret and sid required'))
          }
        })
      })
    })
  }
}

export default unbind
