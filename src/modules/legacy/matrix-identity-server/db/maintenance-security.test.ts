import { expect, mock, test } from 'bun:test'
import IdentityServerDb from './index'

test('expired database grants are actually cleaned by the scheduled maintenance callback', async () => {
  const deleteExpired = mock(async () => [])
  const db = Object.assign(Object.create(IdentityServerDb.prototype), {
    cleanByExpires: ['oneTimeTokens', 'attempts'],
    deleteLowerThan: deleteExpired,
    logger: { error: mock() }
  }) as IdentityServerDb

  try {
    db.dbMaintenance(0.01)
    await new Promise(resolve => setTimeout(resolve, 45))
    expect(deleteExpired.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(deleteExpired).toHaveBeenCalledWith('oneTimeTokens', 'expires', expect.any(Number))
    expect(deleteExpired).toHaveBeenCalledWith('attempts', 'expires', expect.any(Number))
  } finally {
    clearTimeout(db.cleanJob)
  }
})

test('maintenance recovers after cleanup errors and does not restart after database close', async () => {
  let complete!: () => void
  const completed = new Promise<void>(resolve => { complete = resolve })
  const cleanup = mock(async () => {
    if (cleanup.mock.calls.length === 1) throw new Error('temporary database failure')
    complete()
    return []
  })
  const db = Object.assign(Object.create(IdentityServerDb.prototype), {
    cleanByExpires: ['oneTimeTokens'],
    deleteLowerThan: cleanup,
    logger: { error: mock() },
    db: { close: mock() }
  }) as IdentityServerDb

  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    db.dbMaintenance(0.01)
    await Promise.race([
      completed,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('maintenance did not retry')), 1000)
      })
    ])
    expect(cleanup).toHaveBeenCalledTimes(2)
    db.close()
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(cleanup).toHaveBeenCalledTimes(2)
  } finally {
    clearTimeout(timeout)
    clearTimeout(db.cleanJob)
  }
})
