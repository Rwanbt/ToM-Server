/* istanbul ignore file */
import { type Policies } from '.'
import type MatrixIdentityServer from '..'
import {
  errMsg,
  jsonContent,
  send,
  validateParameters,
  type expressAppHandler
} from '../../utils/index'
import computePolicy from './_computePolicies'

type UrlsFromPolicies = Record<string, string[]>

const getUrlsFromPolicies = (policies: Policies): UrlsFromPolicies => {
  const urlsFromPolicies: UrlsFromPolicies = {}
  Object.keys(policies).forEach((policyName) => {
    const policy = policies[policyName as 'privacy_policy' | 'terms_of_service']
    if (policy != null) {
      const newName = `${policyName} ${policy.version}`
      Object.keys(policy).forEach((lang: string) => {
        const entry = policy[lang]
        if (entry && typeof entry !== 'string' && typeof entry.url === 'string') {
          ;(urlsFromPolicies[newName] ??= []).push(entry.url)
        }
      })
    }
  })
  return urlsFromPolicies
}

export const fillPoliciesDB = (
  userId: string,
  idServer: MatrixIdentityServer,
  accepted: number
): void => {
  Object.keys(
    getUrlsFromPolicies(computePolicy(idServer.conf, idServer.logger))
  ).forEach((policyName) => {
    idServer.db
      .insert('userPolicies', {
        policy_name: policyName,
        user_id: userId,
        accepted
      })
      .then(() => {})
      .catch((e) => {
        /* istanbul ignore next */
        idServer.logger.error('Error inserting user policies', e)
      })
  })
}

const PostTerms = <T extends string = never>(
  idServer: MatrixIdentityServer<T>
): expressAppHandler => {
  const urlsFromPolicies = getUrlsFromPolicies(
    computePolicy(idServer.conf, idServer.logger)
  )
  return (req, res) => {
    idServer.authenticate(
      req,
      res,
      (authData) => {
        jsonContent(req, res, idServer.logger, (data) => {
          validateParameters(
            res,
            { user_accepts: true },
            data,
            idServer.logger,
            (data) => {
              const accepted = (data as { user_accepts?: unknown }).user_accepts
              const urls = typeof accepted === 'string' ? [accepted] : accepted
              if (!Array.isArray(urls) || !urls.every(url => typeof url === 'string')) {
                send(res, 400, errMsg('invalidParam', 'invalid user_accepts'))
                return
              }
              const done = Object.entries(urlsFromPolicies)
                .filter(([, knownUrls]) => urls.some(url => knownUrls.includes(url)))
                .map(([policyName]) => policyName)
              if (done.length > 0) {
                if (typeof authData.sub !== 'string' || !authData.sub) {
                  send(res, 401, errMsg('unAuthorized'))
                  return
                }
                Promise.all(done.map(policyName =>
                  idServer.db.updateAnd('userPolicies', { accepted: 1 },
                    { field: 'user_id', value: authData.sub },
                    { field: 'policy_name', value: policyName })
                ))
                  .then(() => send(res, 200, {}))
                  .catch(() => {
                    // DB exceptions can contain user/session identifiers or secrets.
                    idServer.logger.error('Error updating user policies')
                    send(res, 500, errMsg('unknown'))
                  })
              } else {
                send(res, 400, errMsg('unrecognized', 'Unknown policy'))
              }
            }
          )
        })
      },
      false
    )
    // send(res, 200, {})
  }
}

export default PostTerms
