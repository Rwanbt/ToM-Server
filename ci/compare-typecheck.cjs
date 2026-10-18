const { readFileSync } = require('node:fs')

// Count diagnostics by stable identity, not source line: adding a harmless
// line must not be classified as a type regression.
function diagnostics(log) {
  const errors = new Map()
  for (const line of log.split(/\r?\n/)) {
    const m = line.match(/^(src\/[^()]+)\(\d+,\d+\): error (TS\d+):\s*(.*)$/)
    if (!m) continue
    const message = m[3]
      .replace(/\\/g, '/')
      .replace(/(?:[a-z]:\/|\/home\/runner\/work\/)[^'"\s]*\/node_modules\//gi, 'node_modules/')
    const key = m[1] + ' | ' + m[2] + ' | ' + message
    errors.set(key, (errors.get(key) || 0) + 1)
  }
  return errors
}

function compare(baseText, headText) {
  const base = diagnostics(baseText)
  const head = diagnostics(headText)
  if (base.size === 0) throw Error('Base TypeScript diagnostics missing: no valid comparison')
  const introduced = []
  for (const [key, count] of head) {
    const increment = count - (base.get(key) || 0)
    if (increment > 0) introduced.push({ diagnostic: key, count: increment })
  }
  return {
    baseTotal: [...base.values()].reduce((a, b) => a + b, 0),
    headTotal: [...head.values()].reduce((a, b) => a + b, 0),
    introduced
  }
}

if (require.main === module) {
  if (process.argv.length !== 4) {
    console.error('Usage: node ci/compare-typecheck.cjs base.log head.log')
    process.exit(2)
  }
  const result = compare(readFileSync(process.argv[2], 'utf8'), readFileSync(process.argv[3], 'utf8'))
  console.log('baseline TypeScript errors: ' + result.baseTotal)
  console.log('candidate TypeScript errors: ' + result.headTotal)
  if (result.introduced.length) {
    console.error('New diagnostics introduced: ' + result.introduced.length)
    for (const x of result.introduced.slice(0, 30)) console.error(x.count + 'x ' + x.diagnostic)
    process.exitCode = 1
  } else {
    console.log('No new diagnostic identities relative to pinned baseline')
  }
}

module.exports = { diagnostics, compare }
