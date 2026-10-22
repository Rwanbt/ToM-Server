const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const repositoryRoot = join(__dirname, '..')
const workflowsDirectory = join(repositoryRoot, '.github', 'workflows')

// A tag can move: the same workflow file then runs a different action on the
// next execution, which makes the pipeline unreproducible and lets a
// compromised tag take over every job of the repository. Every action this
// repository executes must therefore be pinned to an exact commit.
const actionReference = /^\s*-?\s*uses:\s*([^\s@]+)@([^\s#]+)/
const localReference = /^\s*-?\s*uses:\s*(\.\/|docker:\/\/)/

test('every action the workflows execute is pinned to an exact commit', () => {
  const workflowFiles = readdirSync(workflowsDirectory).filter((name) =>
    name.endsWith('.yml') || name.endsWith('.yaml')
  )
  assert.ok(workflowFiles.length > 0, 'no workflow file was found')

  const offenders = []
  let checked = 0

  for (const name of workflowFiles) {
    const content = readFileSync(join(workflowsDirectory, name), 'utf8')
    for (const line of content.split('\n')) {
      if (localReference.test(line)) continue
      // A commented out job is never executed.
      const trimmed = line.trim()
      if (trimmed.startsWith('#')) continue
      const match = actionReference.exec(line)
      if (!match) continue
      checked += 1
      const [, action, reference] = match
      if (!/^[0-9a-f]{40}$/.test(reference)) {
        offenders.push(`${name}: ${action}@${reference}`)
      }
    }
  }

  assert.ok(checked > 0, 'no action reference was found to check')
  assert.deepEqual(
    offenders,
    [],
    'these actions are not pinned to an exact commit:\n' + offenders.join('\n')
  )
})
