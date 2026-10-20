import { describe, expect, it, mock } from 'bun:test'
import type { TwakeLogger } from '../../logger'
import type IdentityServerDb from '../db'
import type { Config } from '../types'
import type UserDB from '../userdb'
import updateHash from '../lookup/updateHash'
import changePepper from './changePepper'

const OLD_PEPPER = 'a'.repeat(32)

function fixture({ missingPepper = false } = {}) {
  const logger = { debug: mock(), info: mock(), warn: mock(), error: mock() }
  const db = {
    get: mock(async (_table: string, _fields: string[], filter: { name: string }) =>
      missingPepper && filter.name === 'pepper' ? [] : [{ data: OLD_PEPPER }]),
    update: mock(async (_table: string, _values: Record<string, string | number>, _field: string, _value: string | number) => []),
    insert: mock(async (_table: string, _values: Record<string, string | number>) => []),
    deleteEqual: mock(async (_table: string, _field: string, _value: string | number) => undefined)
  }
  const userDB = { getAll: mock(async () => []) }
  const config = {
    server_name: 'local.example.org',
    federated_identity_services: [],
    is_federated_identity_service: false
  } as unknown as Config
  return {
    db, logger, userDB, config,
    run: () => changePepper(config, db as unknown as IdentityServerDb, userDB as unknown as UserDB, logger as unknown as TwakeLogger)
  }
}

describe('real identity hash pepper rotation', () => {
  it('publishes a cryptographic base64url 32-character pepper without disclosing it', async () => {
    const { run, db, logger } = fixture()
    await run()
    const publication = db.update.mock.calls.find(call => call[3] === 'pepper')
    if (!publication || typeof publication[1].data !== 'string') {
      throw new Error('The DB did not receive a valid new pepper')
    }
    const newPepper = publication[1].data
    expect(newPepper).toMatch(/^[a-zA-Z0-9_-]{32}$/)
    const emittedLog = JSON.stringify([...logger.debug.mock.calls, ...logger.error.mock.calls])
    expect(emittedLog).not.toContain(newPepper)
    expect(emittedLog).not.toContain(OLD_PEPPER)
  })

  it('fails closed without writing a new pepper if its current DB record is absent', async () => {
    const { run, db } = fixture({ missingPepper: true })
    await expect(run()).rejects.toThrow('Current hashing pepper record is missing')
    expect(db.update).not.toHaveBeenCalled()
  })

  it('rejects hash writes when no valid pepper can be read from the key store', async () => {
    const { db, logger } = fixture({ missingPepper: true })
    await expect(updateHash(db as unknown as IdentityServerDb, logger as unknown as TwakeLogger, {
      '@person:local.example.org': { email: 'private@example.org', active: 1 }
    })).rejects.toThrow('No valid hashing pepper is configured')
    expect(db.insert).not.toHaveBeenCalled()
  })
})
