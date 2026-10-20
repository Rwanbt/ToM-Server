#!/usr/bin/env node
// TypeScript 7 ships a native compiler without the historic TypeScript JS
// AST API. Use its *exact* TS1484 locations and conservatively validate each
// named import position before adding an explicit type-only modifier.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function applyTypeOnlyLocations(source, positions) {
  const offsets = []
  const starts = [0]
  for (let i = 0; i < source.length; ++i) if (source[i] === '\n') starts.push(i + 1)
  for (const { line, column, symbol } of positions) {
    const offset = starts[line - 1] + column - 1
    if (!Number.isInteger(offset) || !source.startsWith(symbol, offset)) {
      throw Error('TypeScript location/symbol mismatch: ' + line + ':' + column + ' ' + symbol)
    }
    // Only touch named import clauses, never object properties, runtime
    // values, default imports, import attributes, or arbitrary TS expressions.
    const imports = [...source.matchAll(/\bimport\s+(?:[\w$]+\s*,\s*)?\{[^}]*\}\s*from\s*['"][^'"]+['"]/g)]
    const parent = imports.find(m => m.index <= offset && offset < m.index + m[0].length)
    if (!parent) throw Error('Not a named import: ' + line + ':' + column + ' ' + symbol)
    const prefix = source.slice(parent.index, offset)
    if (!/(?:\{|,)\s*$/.test(prefix) || /\btype\s+$/.test(prefix)) {
      throw Error('Not an import specifier start: ' + line + ':' + column + ' ' + symbol)
    }
    offsets.push(offset)
  }
  let result = source
  for (const offset of [...new Set(offsets)].sort((a, b) => b - a)) {
    result = result.slice(0, offset) + 'type ' + result.slice(offset)
  }
  return result
}

function parseTypeOnlyDiagnostics(log) {
  const results = new Map()
  const regex = /^(src\/[^()]+)\((\d+),(\d+)\): error TS1484: '([^']+)' is a type and must be imported using a type-only import/gm
  for (const m of log.replace(/\r/g, '').matchAll(regex)) {
    const path = m[1]
    const locations = results.get(path) || []
    locations.push({ line: Number(m[2]), column: Number(m[3]), symbol: m[4] })
    results.set(path, locations)
  }
  return results
}

function run({ check = false } = {}) {
  const root = path.resolve(__dirname, '..')
  const logAt = process.argv.indexOf('--log')
  let log
  if (logAt !== -1) {
    if (!process.argv[logAt + 1]) throw Error('--log needs an existing diagnostic file')
    log = fs.readFileSync(path.resolve(process.argv[logAt + 1]), 'utf8')
  } else {
    const result = spawnSync('bun', ['run', 'type-check'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    if (result.error) throw result.error
    log = (result.stdout || '') + '\n' + (result.stderr || '')
  }
  const errors = parseTypeOnlyDiagnostics(log)
  if (!/error TS\d+:/.test(log)) throw Error('Missing compiler diagnostics; cannot assert repair')
  let count = 0
  const pending = []
  for (const [relative, positions] of errors) {
    const filename = path.resolve(root, relative)
    if (!filename.startsWith(path.join(root, 'src') + path.sep)) throw Error('Unsafe path: ' + relative)
    const original = fs.readFileSync(filename, 'utf8')
    const modified = applyTypeOnlyLocations(original, positions)
    pending.push({ filename, modified })
    count += positions.length
  }
  if (!check) for (const { filename, modified } of pending) fs.writeFileSync(filename, modified)
  console.log((check ? 'remaining' : 'repaired') + ' TS1484: ' + count)
  if (check && count) process.exitCode = 1
}

if (require.main === module) run({ check: process.argv.includes('--check') })
module.exports = { applyTypeOnlyLocations, parseTypeOnlyDiagnostics }
