const { test } = require('node:test')
const assert = require('node:assert/strict')
const { applyTypeOnlyLocations, parseTypeOnlyDiagnostics } = require('./fix-type-only-imports.cjs')

test('repairs only specified import specifiers including alias and multiline', () => {
  const text = "import { Config, make,\n  TwakeDB as Database } from './core'\nmake()\n"
  const result = applyTypeOnlyLocations(text, [
    { line: 1, column: 10, symbol: 'Config' },
    { line: 2, column: 3, symbol: 'TwakeDB' }
  ])
  assert.equal(result, "import { type Config, make,\n  type TwakeDB as Database } from './core'\nmake()\n")
  assert.equal(applyTypeOnlyLocations(result, []), result)
})

test('refuses incorrect line-column, symbol, or a runtime non-import token', () => {
  const source = "import { Config } from './core'\nConfig()\n"
  assert.throws(() => applyTypeOnlyLocations(source, [{ line: 2, column: 1, symbol: 'Config' }]), /Not a named import/)
  assert.throws(() => applyTypeOnlyLocations(source, [{ line: 1, column: 10, symbol: 'Wrong' }]), /mismatch/)
  assert.throws(() => applyTypeOnlyLocations(source, [{ line: 1, column: 18, symbol: 'from' }]), /mismatch|Not an import specifier start/)
})

test('only extracts compiler-reported TS1484 and rejects unrelated diagnostics', () => {
  const log = "src/foo.ts(1,10): error TS1484: 'Config' is a type and must be imported using a type-only import\nsrc/foo.ts(2,2): error TS2532: Possibly undefined"
  const found = parseTypeOnlyDiagnostics(log)
  assert.equal(found.size, 1)
  assert.deepEqual(found.get('src/foo.ts'), [{ line: 1, column: 10, symbol: 'Config' }])
})
