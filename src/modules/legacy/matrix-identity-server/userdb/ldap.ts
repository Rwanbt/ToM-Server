/* istanbul ignore file */
import { type TwakeLogger } from '../../logger/index'
import { type Client, type SearchOptions } from 'ldapts'
import * as ldapts from 'ldapts'
import { type Config, type DbGetResult } from '../types'
import { type UserDBBackend } from './index'
import _ from 'lodash'

/** Escape RFC 4515 assertion metacharacters in untrusted directory values.
 * Only `get` intentionally supports LDAP wildcard patterns; `match` treats
 * the user's search text as a literal substring bounded by our own `*`. */
export function escapeLDAPFilterValue(value: string, allowWildcard = false): string {
  return value
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, allowWildcard ? '*' : '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00')
}

function checkedAttribute(value: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(value)) {
    throw new Error('Invalid LDAP search attribute')
  }
  return value
}

class UserDBLDAP implements UserDBBackend {
  base: string
  filter: string
  ready: Promise<void>
  ldap: () => Promise<Client>

  constructor(conf: Config, private readonly logger: TwakeLogger) {
    this.logger = logger
    this.base = conf.ldap_base != null ? conf.ldap_base : ''
    this.filter =
      conf.ldap_filter != null ? conf.ldap_filter : '(objectClass=*)'
    const ldaptsOpts = conf.ldapts_opts != null ? conf.ldapts_opts : {}

    this.logger.silly(
      `[UserDBLDAP][constructor] Initializing with base: ${this.base}, filter: ${this.filter}`
    )
    this.logger.debug(
      `[UserDBLDAP][constructor] LDAP URI: ${conf.ldap_uri ?? 'undefined'}`
    )

    this.ldap = (): Promise<Client> => {
      this.logger.silly('[UserDBLDAP][ldap] Creating new LDAP client instance')
      const client = new ldapts.Client({
        ...ldaptsOpts,
        url: conf.ldap_uri != null ? conf.ldap_uri : ''
      })
      return new Promise((resolve, reject) => {
        if (
          conf.ldap_user != null &&
          conf.ldap_user.length > 0 &&
          conf.ldap_password != null
        ) {
          this.logger.debug(
            `[UserDBLDAP][ldap] Attempting authenticated bind as: ${conf.ldap_user}`
          )
          client
            .bind(conf.ldap_user, conf.ldap_password)
            .then(() => {
              this.logger.info(
                `[UserDBLDAP][ldap] Successfully bound to LDAP server as: ${conf.ldap_user}`
              )
              resolve(client)
            })
            .catch((e) => {
              this.logger.error(
                '[UserDBLDAP][ldap] Failed to bind to LDAP server: credentials withheld'
              )
              reject(e)
            })
        } else {
          this.logger.debug(
            '[UserDBLDAP][ldap] Using anonymous LDAP connection'
          )
          resolve(client)
        }
      })
    }

    this.ready = new Promise((resolve, reject) => {
      this.logger.debug(
        '[UserDBLDAP][constructor] Testing LDAP connection readiness'
      )
      this.ldap()
        .then((cli) => {
          this.logger.silly(
            '[UserDBLDAP][constructor] Connection test successful, unbinding test client'
          )
          cli.unbind().catch((e) => {
            this.logger.warn(
              '[UserDBLDAP][constructor] Failed to unbind test client'
            )
          })
          this.logger.info(
            '[UserDBLDAP][constructor] LDAP backend initialized and ready'
          )
          resolve()
        })
        .catch((e) => {
          this.logger.error(
            '[UserDBLDAP][constructor] LDAP connection test failed'
          )
          this.logger.error(
            `[UserDBLDAP][constructor] Configuration - URI: ${
              conf.ldap_uri ?? 'undefined'
            }, Base: ${this.base}`
          )
          resolve()
        })
    })
  }

  _get(
    table: string,
    filter: string,
    fields?: string[],
    order?: string
  ): Promise<DbGetResult> {
    this.logger.silly(
      `[UserDBLDAP][_get] Internal get method invoked - table: ${table}, order: ${
        order ?? 'none'
      }`
    )
    this.logger.debug('[UserDBLDAP][_get] Search filter prepared (values withheld)')
    this.logger.silly(
      `[UserDBLDAP][_get] Requested fields: ${fields?.join(', ') ?? 'all'}`
    )

    return new Promise((resolve, reject) => {
      const opts: SearchOptions = {
        filter: filter,
        scope: 'sub'
      }

      if (fields != null && fields.length > 0) {
        opts.attributes = fields
        this.logger.silly(
          `[UserDBLDAP][_get] Limiting attributes to: ${fields.join(', ')}`
        )
      } else {
        this.logger.silly(
          '[UserDBLDAP][_get] No attribute filter, retrieving all fields'
        )
      }

      this.ldap()
        .then((client) => {
          this.logger.debug(
            `[UserDBLDAP][_get] Executing LDAP search - base: ${this.base}`
          )
          this.logger.silly('[UserDBLDAP][_get] Search options prepared (values withheld)')

          client
            .search(this.base, opts)
            .then(({ searchEntries, searchReferences }) => {
              this.logger.silly(
                `[UserDBLDAP][_get] Raw LDAP response received - ${searchEntries.length} entries, ${searchReferences.length} references`
              )

              const entries: Array<Record<string, string | string[] | number>> =
                []

              searchEntries.forEach((entry, index) => {
                this.logger.silly(
                  `[UserDBLDAP][_get] Processing entry ${index + 1}/${
                    searchEntries.length
                  }`
                )
                this.logger.silly(
                  '[UserDBLDAP][_get] Entry received (attributes withheld from logs)'
                )

                const res: Record<string, string | string[] | number> = {}

                if (fields != null && fields.length > 0) {
                  fields.forEach((k) => {
                    const rawValue = entry[k]
                    if (rawValue == null) return
                    const decoded = _.isBuffer(rawValue)
                      ? rawValue.toString()
                      : Array.isArray(rawValue)
                        ? rawValue[0]
                        : rawValue
                    if (decoded !== undefined) res[k] = decoded as string
                  })
                } else {
                  Object.keys(entry).forEach((k) => {
                    if (k !== 'controls') {
                      const rawValue = entry[k]
                      if (rawValue == null) return
                      const decoded = _.isBuffer(rawValue)
                        ? rawValue.toString()
                        : Array.isArray(rawValue)
                          ? rawValue[0]
                          : rawValue
                      if (decoded !== undefined) res[k] = decoded as string
                    }
                  })
                }

                const realEntry = Object.values(res).some((v) => v != null)
                if (realEntry) {
                  entries.push(res)
                  this.logger.debug(
                    `[UserDBLDAP][_get] Entry ${index + 1} processed and added`
                  )
                } else {
                  this.logger.silly(
                    `[UserDBLDAP][_get] Entry ${
                      index + 1
                    } skipped - all fields null`
                  )
                }
              })

              if (entries.length > 0 && order != null) {
                this.logger.debug(
                  `[UserDBLDAP][_get] Sorting ${entries.length} entries by field: ${order}`
                )
                entries.sort((a, b) => {
                  if (a[order] == null) return b[order] == null ? 0 : -1
                  if (b[order] == null) return 1
                  if (a[order] > b[order]) return 1
                  if (a[order] < b[order]) return -1
                  return 0
                })
                this.logger.silly('[UserDBLDAP][_get] Sorting completed')
              }

              client.unbind().catch((e) => {
                this.logger.warn(
                  '[UserDBLDAP][_get] Failed to unbind client after search'
                )
              })

              this.logger.info(
                `[UserDBLDAP][_get] Search completed successfully - ${entries.length} entries returned`
              )
              resolve(entries)
            })
            .catch((e) => {
              this.logger.error(
                '[UserDBLDAP][_get] LDAP search operation failed'
              )
              this.logger.error(
                '[UserDBLDAP][_get] Failed search parameters (filter withheld)'
              )
              reject(e)
            })
        })
        .catch((e) => {
          this.logger.error(
            '[UserDBLDAP][_get] Failed to obtain LDAP client'
          )
          reject(e)
        })
    })
  }

  get(
    table: string,
    fields?: string[],
    filterFields?: Record<string, string | number | string[]>,
    order?: string
  ): Promise<DbGetResult> {
    this.logger.debug(`[UserDBLDAP][get] Get method invoked - table: ${table}`)
    this.logger.silly(
      '[UserDBLDAP][get] Filter fields provided (values withheld)'
    )
    this.logger.silly(
      `[UserDBLDAP][get] Requested fields: ${fields?.join(', ') ?? 'all'}`
    )

    let specificFilter: string = ''

    if (filterFields == null || Object.keys(filterFields).length === 0) {
      specificFilter = '(objectClass=*)'
      this.logger.silly(
        '[UserDBLDAP][get] No filter criteria provided, using default (objectClass=*)'
      )
    } else {
      const individualFilters: string[] = []

      Object.keys(filterFields)
        .filter(
          (key) =>
            filterFields[key] != null &&
            filterFields[key].toString() !== [].toString()
        )
        .forEach((key) => {
          checkedAttribute(key)
          const value = filterFields[key]
          if (Array.isArray(value)) {
            this.logger.silly(
              `[UserDBLDAP][get] Building OR filter for field "${key}" with ${value.length} values`
            )
            const arrayValueFilters = value
              .map((val) => `(${key}=${escapeLDAPFilterValue(String(val), true)})`)
              .join('')
            individualFilters.push(`(|${arrayValueFilters})`)
          } else {
            this.logger.silly(
              `[UserDBLDAP][get] Building filter for field "${key}" (value withheld)`
            )
            if (value !== undefined) individualFilters.push(`(${key}=${escapeLDAPFilterValue(value.toString(), true)})`)
          }
        })

      if (individualFilters.length === 0) {
        specificFilter = '(objectClass=*)'
        this.logger.warn(
          '[UserDBLDAP][get] Filter fields provided but all values were null/empty, falling back to (objectClass=*)'
        )
      } else if (individualFilters.length === 1) {
        specificFilter = individualFilters[0] ?? '(objectClass=*)'
        this.logger.debug(
          '[UserDBLDAP][get] Single filter condition prepared (value withheld)'
        )
      } else {
        specificFilter = `(&${individualFilters.join('')})`
        this.logger.debug(
          `[UserDBLDAP][get] Combined ${individualFilters.length} filters with AND logic`
        )
      }
    }

    const finalFilter = `(&${this.filter}${specificFilter})`
    this.logger.info(
      '[UserDBLDAP][get] Executing get query (filter withheld)'
    )
    return this._get(table, finalFilter, fields, order)
  }

  match(
    table: string,
    fields: string[],
    searchFields: string[],
    value: string | number
  ): Promise<DbGetResult> {
    this.logger.debug(
      `[UserDBLDAP][match] Match method invoked - table: ${table}, value withheld`
    )
    this.logger.silly(
      `[UserDBLDAP][match] Search fields: ${
        Array.isArray(searchFields) ? searchFields.join(', ') : searchFields
      }`
    )
    this.logger.silly(`[UserDBLDAP][match] Return fields: ${fields.join(', ')}`)

    if (!Array.isArray(searchFields)) {
      searchFields = [searchFields]
      this.logger.silly('[UserDBLDAP][match] Normalized searchFields to array')
    }

    if (searchFields.length === 0) {
      this.logger.warn(
        '[UserDBLDAP][match] No search fields provided, returning empty result set'
      )
      return Promise.resolve([])
    }

    const escapedValue = escapeLDAPFilterValue(String(value))
    let specificFilter = searchFields.reduce((prev, current) => {
      return `${prev}(${checkedAttribute(current)}=${value ? `*${escapedValue}*` : '*'})`
    }, '')

    if (searchFields.length > 1) {
      specificFilter = `(|${specificFilter})`
      this.logger.debug(
        `[UserDBLDAP][match] Created OR filter for ${searchFields.length} fields with wildcard search`
      )
    } else {
      this.logger.debug(
        '[UserDBLDAP][match] Created single field wildcard filter (value withheld)'
      )
    }

    const finalFilter = `(&${this.filter}${specificFilter})`
    this.logger.info(
      '[UserDBLDAP][match] Executing match query (filter withheld)'
    )
    return this._get(table, finalFilter, fields)
  }

  getAll(
    table: string,
    fields: string[],
    order?: string
  ): Promise<DbGetResult> {
    this.logger.debug(
      `[UserDBLDAP][getAll] GetAll method invoked - table: ${table}`
    )
    this.logger.silly(
      `[UserDBLDAP][getAll] Fields: ${fields.join(', ')}, order: ${
        order ?? 'none'
      }`
    )
    this.logger.info(
      `[UserDBLDAP][getAll] Retrieving all entries with base filter: ${this.filter}`
    )
    return this._get(table, this.filter, fields, order)
  }

  close(): void {
    this.logger.info('[UserDBLDAP][close] Closing UserDBLDAP backend')
  }
}

export default UserDBLDAP
