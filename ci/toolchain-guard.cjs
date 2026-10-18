const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const read = name => readFileSync(join(__dirname, '..', '.github', 'workflows', name), 'utf8')
const security = read('ci-auth-security.yml')
const checks = read('checks.yml')
const pr = read('pr.yml')

test('all required Bun jobs use one exact, independently proven version', () => {
  assert.equal((security.match(/bun-version: '1\.4\.3'/g) ?? []).length, 3)
  for (const workflow of [checks, pr]) {
    assert.match(workflow, /bun-version: '1\.4\.3'/)
    assert.doesNotMatch(workflow, /bun-version:\s*(?:latest|canary|1\.3\.11)/)
  }
})

test('the PR builds never execute mutable setup tags or preserve checkout credentials', () => {
  for (const workflow of [checks, pr, security]) {
    const actions = [...workflow.matchAll(/^\s*- uses: (actions\/checkout|oven-sh\/setup-bun)@([^\s]+)/gm)]
    assert.ok(actions.length >= 2)
    for (const [, , revision] of actions) assert.match(revision, /^[0-9a-f]{40}$/)
    assert.doesNotMatch(workflow, /persist-credentials: true/)
  }
})

test('Biome violations cannot be converted to passing GitHub status', () => {
  const lint = read('linters.yml')
  assert.match(lint, /biome ci \. /)
  assert.doesNotMatch(lint, /continue-on-error:\s*true/)
})
