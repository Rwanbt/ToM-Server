import { getServerNameFromMatrixId } from './utils'
import { describe, expect, it, test } from 'bun:test'

describe('the getServerNameFromMatrixId helper', () => {
  it('should extract the server name correctly', () => {
    const firstServer = getServerNameFromMatrixId('@test:example.com')
    const secondServer = getServerNameFromMatrixId('@support:linagora.com')

    expect(firstServer).toEqual('example.com')
    expect(secondServer).toEqual('linagora.com')
  })

  it('does not invent a server for a malformed Matrix ID', () => {
    expect(getServerNameFromMatrixId('not-a-matrix-id')).toBe('')
  })
})
