import { describe, expect, it, mock } from 'bun:test'
import { hashDetails } from './controllers'

function fixture(current: unknown, previous: unknown = []) {
  const next = mock()
  const json = mock()
  const logger = { debug: mock(), error: mock() }
  const db = {
    get: mock(async (_table: string, _fields: string[], filter: { name: string }) =>
      filter.name === 'pepper' ? current : previous)
  }
  const handler = hashDetails(db as never, logger as never)
  const response = { json }
  return {
    next, json, logger, db,
    run: async () => {
      handler({} as never, response as never, next)
      // The controller uses promise chained DB reads; allow the real
      // implementation to settle without replacing the production handler.
      for (let i = 0; i < 8; i++) await Promise.resolve()
    }
  }
}

describe('federated hash_details fails closed on missing key material', () => {
  it('never publishes an undefined current lookup pepper', async () => {
    const app = fixture([])
    await app.run()
    expect(app.json).not.toHaveBeenCalled()
    expect(app.next).toHaveBeenCalledTimes(1)
  })

  it('returns only current valid and available previous pepper', async () => {
    const app = fixture([{ data: 'current-pepper' }], [{ data: 'previous-pepper' }])
    await app.run()
    expect(app.next).not.toHaveBeenCalled()
    expect(app.json).toHaveBeenCalledWith({
      algorithms: ['sha256'],
      lookup_pepper: 'current-pepper',
      alt_lookup_peppers: ['previous-pepper']
    })
  })

  it('omits a missing previous key instead of manufacturing a value', async () => {
    const app = fixture([{ data: 'current-pepper' }])
    await app.run()
    expect(app.next).not.toHaveBeenCalled()
    expect(app.json).toHaveBeenCalledWith({
      algorithms: ['sha256'],
      lookup_pepper: 'current-pepper'
    })
  })
})
