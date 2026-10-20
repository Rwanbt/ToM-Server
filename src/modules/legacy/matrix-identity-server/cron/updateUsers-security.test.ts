import { describe, expect, it, mock } from 'bun:test'
import updateUsers from './updateUsers'

describe('Matrix directory user synchronization fails closed', () => {
  it('refuses a malformed directory snapshot before any account deactivation', async () => {
    const db = {
      getAll: mock(async () => [{ value: '@alice:example.org', active: 1 }]),
      get: mock(async () => []),
      update: mock(async () => {}),
      insert: mock(async () => {})
    }
    const userDb = { getAll: mock(async () => [{ mail: 'missing-uid@example.org' }]) }
    const logger = { info: mock(), warn: mock(), error: mock() }
    const conf = { server_name: 'example.org', federated_identity_services: [] }

    await expect(updateUsers(conf as never, db as never, userDb as never, logger as never))
      .rejects.toThrow('without a valid uid')
    expect(db.update).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })
})
