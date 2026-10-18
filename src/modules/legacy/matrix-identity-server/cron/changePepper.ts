/**
 * Change pepper and update hashes
 */

import { randomBytes } from 'node:crypto'
import { type TwakeLogger } from '../../logger/index'
import type IdentityServerDb from '../db'
import updateHash, { type UpdatableFields } from '../lookup/updateHash'
import MatrixDB from '../matrixDb'
import { type Config, type DbGetResult } from '../types'
import type UserDB from '../userdb'
import { toMatrixId } from '../../utils/index'

export const dbFieldsToHash = ['mobile', 'mail'] as const

// If Matrix DB is available, this function filter inactive users
export const filter = async (
  rows: DbGetResult,
  conf: Config,
  logger: TwakeLogger
): Promise<DbGetResult> => {
  const isMatrixDbAvailable =
    Boolean(conf.matrix_database_host) && Boolean(conf.matrix_database_engine)

  if (isMatrixDbAvailable) {
    const matrixDb = new MatrixDB(conf, logger)
    await matrixDb.ready
    const entries = await matrixDb.getAll('users', ['name']).catch((e) => {
      /* istanbul ignore next */
      if (/relation "users" does not exist/.test(e)) {
        logger.debug('Matrix DB seems not ready')
      } else {
        logger.error('Unable to query Matrix DB', e)
      }
    })
    matrixDb.close()
    /* istanbul ignore if */
    if (entries == null || entries.length === 0) {
      return (conf.federated_identity_services == null ||
        conf.federated_identity_services.length === 0) &&
        !conf.is_federated_identity_service
        ? rows
        : []
    }
    const names: string[] = []
    entries.forEach((row) => {
      if (typeof row.name === 'string') {
        names.push(row.name.replace(/^@(.*?):(?:.*)$/, '$1'))
      }
    })
    if (
      (conf.federated_identity_services != null &&
        conf.federated_identity_services.length > 0) ||
      conf.is_federated_identity_service
    ) {
      rows = rows
        .filter((row) => names.includes(row.uid as string))
        .map((row) => {
          row.active = 1
          return row
        })
    } else {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row && names.includes(row.uid as string)) row.active = 1
      }
    }
  }
  return rows
}

// eslint-disable-next-line @typescript-eslint/promise-function-async
const updateHashes = <T extends string = never>(
  conf: Config,
  db: IdentityServerDb<T>,
  userDB: UserDB,
  logger: TwakeLogger
): Promise<void> => {
  const isMatrixDbAvailable =
    Boolean(conf.matrix_database_host) && Boolean(conf.matrix_database_engine)

  return new Promise((resolve, reject) => {
    const logAndReject = (msg: string) => {
      return (e: any) => {
        /* istanbul ignore next */
        logger.error(msg, e)
        /* istanbul ignore next */
        reject(e)
      }
    }
    /**
     * Step 1:
     *  - drop old-old hashes
     *  - get current pepper
     */
    db.get('keys', ['data'], { name: 'previousPepper' })
      .then((rows) => {
        if (rows == null || !Array.isArray(rows) || rows.length === 0) {
          /* istanbul ignore next */
          throw Error('No previousPepper found')
        }
        const previousPepper = rows[0]?.data
        if (typeof previousPepper !== 'string' || previousPepper.length !== 32) {
          throw Error('previousPepper value is not valid')
        }
        db.deleteEqual('hashes', 'pepper', previousPepper).catch(
          (e) => {
            /* istanbul ignore next */
            logger.error('Unable to clean old hashes', e)
          }
        )
      })
      .catch((e) => {
        // Previous value may not exist
      })
    db.get('keys', ['data'], { name: 'pepper' })
      .then((values: DbGetResult) => {
        const currentPepper = values[0]?.data
        if (typeof currentPepper !== 'string') {
          throw new Error('Current hashing pepper record is missing')
        }
        /**
         * Step 2:
         *  - generate new pepper
         *  - set previousPepper to current value
         *  - calculate new hashes and populate hashes database
         */
        // 24 CSPRNG bytes produce exactly 32 base64url characters (192 bits).
        // Math.random() is not suitable for a secret used to derive identity hashes.
        const newPepper = randomBytes(24).toString('base64url')
        Promise.all([
          // move current pepper to 'previousPepper'
          db.update(
            'keys',
            { data: currentPepper },
            'name',
            'previousPepper'
          ),
          // New hashes
          new Promise((_resolve, _reject) => {
            userDB
              .getAll('users', [...dbFieldsToHash, 'uid'])
              // eslint-disable-next-line @typescript-eslint/promise-function-async
              .then((rows) => filter(rows, conf, logger))
              .then((rows: DbGetResult) => {
                const init: UpdatableFields = {}
                updateHash(
                  db,
                  logger,
                  rows.reduce((res, row) => {
                    res[toMatrixId(row.uid as string, conf.server_name)] = {
                      email: row.mail as string,
                      phone: row.mobile as string,
                      active: isMatrixDbAvailable ? (row.active as number) : 1
                    }
                    return res
                  }, init) as unknown as UpdatableFields,
                  newPepper
                )
                  .then(_resolve)
                  .catch(_reject)
              })
              .catch(logAndReject('Unable to parse user DB'))
          })
        ])
          .then(() => {
            db.update('keys', { data: newPepper }, 'name', 'pepper')
              .then(() => {
                logger.debug('Identity server: new pepper published')
                resolve()
              })
              .catch(logAndReject('Unable to publish new pepper'))
          })
          .catch(logAndReject('Update hashes failed'))
      })
      .catch(logAndReject('Update hashes failed'))
  })
}

export default updateHashes
