import { Hash } from '../../crypto/index'
import { type TwakeLogger } from '../../logger/index'
import fetch, { type Response } from 'node-fetch'
import {
  fieldsToHash,
  type UpdatableFields,
  type ValueField
} from '../lookup/updateHash'
import { type Config } from '../types'
import type UserDB from '../userdb'
import { dbFieldsToHash, filter } from './changePepper'
import { toMatrixId } from '../../utils/index'

export function parseFederatedHashDetails(raw: unknown): {
  algorithm: 'sha256'
  peppers: string[]
} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  if (!Array.isArray(body.algorithms) || !body.algorithms.includes('sha256')) return null
  if (typeof body.lookup_pepper !== 'string' || body.lookup_pepper.length === 0 || body.lookup_pepper.length > 256) return null
  if (body.alt_lookup_peppers !== undefined &&
      (!Array.isArray(body.alt_lookup_peppers) || body.alt_lookup_peppers.length > 8 ||
       !body.alt_lookup_peppers.every((pepper: unknown) => typeof pepper === 'string' && pepper.length > 0 && pepper.length <= 256))) return null
  const alternatives = (body.alt_lookup_peppers ?? []) as string[]
  return { algorithm: 'sha256', peppers: [...new Set([body.lookup_pepper, ...alternatives])] }
}

interface LookupsDetail {
  address: string
  algorithm: string
  pepper: string
  updatedHashes: string[]
}

/** Never disclose directory hashes over cleartext or through redirect hops. */
export function isSecureFederationPeer(address: string): boolean {
  try {
    const url = new URL(address)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
      !url.username && !url.password && !url.hash && !url.search
  } catch {
    return false
  }
}
/**
 * update federated identity service hashes cron job.
 *
 * @param {MatrixIdentityServer} idServer - the matrix identity server instance.
 */
export default async (
  conf: Config,
  userDB: UserDB,
  logger: TwakeLogger
): Promise<void> => {
  const prefixErrorMessage = '[Update federated identity service hashes]'

  let federatedIdentityServicesAddresses =
    Array.isArray(conf.federated_identity_services)
      ? (conf.federated_identity_services as string[])
      : conf.federated_identity_services != null
      ? (conf.federated_identity_services as string).split(/[,\s]+/)
      : []

  federatedIdentityServicesAddresses = federatedIdentityServicesAddresses.filter(address => {
    if (isSecureFederationPeer(address)) return true
    logger.error('[Update federated identity service hashes] Invalid federation peer URL')
    return false
  })

  const serversIndexFail: number[] = []

  const responses = (
    await Promise.allSettled(
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      federatedIdentityServicesAddresses.map((address) =>
        fetch(encodeURI(`${address.replace(/\/+$/, '')}/_matrix/identity/v2/hash_details`), {
          redirect: 'error',
          signal: AbortSignal.timeout(15000)
        })
      )
    )
  )
    .filter((result, index) => {
      if (result.status === 'rejected') {
        logger.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${prefixErrorMessage} Request to get hash_details from federated identity service ${federatedIdentityServicesAddresses[index]} failed`
        )
        serversIndexFail.push(index)
        return false
      }
      return true
    })
    .map((result) => (result as PromiseFulfilledResult<Response>).value)

  federatedIdentityServicesAddresses =
    federatedIdentityServicesAddresses.filter(
      (_address, index) => !serversIndexFail.includes(index)
    )
  const settledBodies = (
    await Promise.allSettled(
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      responses.map((response) => response.json())
    )
  )
  const validServers: Array<{ address: string; algorithm: 'sha256'; peppers: string[] }> = []
  settledBodies.forEach((result, index) => {
    const address = federatedIdentityServicesAddresses[index]
    if (!address) return
    const details = result.status === 'fulfilled' ? parseFederatedHashDetails(result.value) : null
    if (!details) {
      logger.error(`${prefixErrorMessage} Invalid or unavailable hash_details from ${address}`)
      return
    }
    validServers.push({ address, ...details })
  })
  if (validServers.length === 0) return

  const isMatrixDbAvailable =
    Boolean(conf.matrix_database_host) && Boolean(conf.matrix_database_engine)

  const usersData = (
    await filter(
      await userDB.getAll('users', [...dbFieldsToHash, 'uid']),
      conf,
      logger
    )
  ).reduce<UpdatableFields>((acc, row) => {
    acc[toMatrixId(row.uid as string, conf.server_name)] = {
      email: row.mail as string,
      phone: row.mobile as string,
      active: isMatrixDbAvailable ? (row.active as number) : 1
    }
    return acc
  }, {})

  const hash = new Hash()
  await hash.ready

  const getUsersHashes = (pepper: string): string[] => {
    const result: string[] = []
    Object.keys(usersData).forEach((matrixAddress) => {
      const user = usersData[matrixAddress]
      if (!user || user.active !== 1) return
      fieldsToHash.forEach((field) => {
        const v = user[field as keyof ValueField]
        if (
          v != null &&
          v.toString().length > 0
        ) {
          let value = v.toString()
          let _field: string = field
          if (field === 'phone') {
            _field = 'msisdn'
            value = value.replace(/\s/g, '').replace(/^\+/, '')
          }
          // Never write unhashed directory emails or phone numbers to logs.
          logger.debug(`Prepare ${_field} federated hash`)
          result.push(
            hash.sha256(`${value} ${_field} ${pepper}`)
          )
        }
      })
    })
    return result
  }

  const lookupsRequestsDetails: LookupsDetail[] = validServers.flatMap(
    ({ address, algorithm, peppers }) => peppers.map((pepper) => ({
      address,
      algorithm,
      pepper,
      updatedHashes: getUsersHashes(pepper)
    }))
  )

  const { hostname, port } = new URL(conf.base_url)
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  const host = hostname.concat(':', port || '443')

  const pushResults = await Promise.allSettled(
    lookupsRequestsDetails.map(async (detail) => {
      const response = await fetch(encodeURI(`${detail.address.replace(/\/+$/, '')}/_matrix/identity/v2/lookups`), {
        method: 'post',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          algorithm: detail.algorithm,
          pepper: detail.pepper,
          mappings: { [host]: detail.updatedHashes }
        })
      })
      if (!response.ok) throw new Error('Remote hash upload was rejected')
      const body = await response.json()
      if (!body || typeof body !== 'object' || Array.isArray(body) || 'errcode' in body) {
        throw new Error('Remote hash upload returned an invalid response')
      }
    })
  )
  pushResults.forEach((result, index) => {
    const address = lookupsRequestsDetails[index]?.address
    if (result.status === 'rejected') {
      logger.error(`${prefixErrorMessage} Failed to update hashes on ${address}`)
    } else {
      logger.debug(`Hashes pushed to ${address}`)
    }
  })
}
