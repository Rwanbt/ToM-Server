const { test } = require('node:test')
const assert = require('node:assert/strict')
const { compare } = require('./compare-typecheck.cjs')
const line = (code, text, at = 1) => 'src/lib/auth.ts(' + at + ',3): error ' + code + ': ' + text + '\n'

test('line changes and genuinely repaired baseline errors do not cause a false regression', () => {
  const base = line('TS2345', 'string not assignable', 4) + line('TS2322', 'unknown cannot assign', 5)
  const head = line('TS2345', 'string not assignable', 700)
  const result = compare(base, head)
  assert.equal(result.baseTotal, 2)
  assert.equal(result.headTotal, 1)
  assert.deepEqual(result.introduced, [])
})

test('new diagnostics fail even when total error count decreases', () => {
  const base = line('TS2345', 'unsafe type') + line('TS2322', 'other unsafe type')
  const head = line('TS2345', 'brand new unsafe type')
  assert.equal(compare(base, head).introduced.length, 1)
})

test('an extra occurrence of an existing error fails closed', () => {
  const base = line('TS2345', 'unsafe')
  const head = line('TS2345', 'unsafe') + line('TS2345', 'unsafe', 99)
  assert.equal(compare(base, head).introduced[0].count, 1)
})

test('a missing baseline report is an error, never an empty success', () => {
  assert.throws(() => compare('', line('TS2345', 'unsafe')), /Base TypeScript diagnostics missing/)
})
