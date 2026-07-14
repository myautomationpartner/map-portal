import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('./deploy-all-portal-updates.mjs', import.meta.url), 'utf8')

test('all-portal deploy runs portal regression guards before publishing worker bundles', () => {
  assert.match(source, /function runPortalRegressionGuards\(\)/)
  assert.match(source, /portalApi\.source\.test\.mjs/)
  assert.match(source, /spawnSync\(process\.execPath/)
  assert.match(source, /runPortalRegressionGuards\(\)/)
})
