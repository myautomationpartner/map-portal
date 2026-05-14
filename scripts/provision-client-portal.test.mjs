import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('portal provisioning ensures a Zernio customer profile before deployment summary sync', async () => {
  const script = await source('scripts/provision-client-portal.mjs')
  const helperIndex = script.indexOf('async function ensureZernioCustomerProfile')
  const callIndex = script.indexOf('const zernioProfile = await ensureZernioCustomerProfile')
  const secretEnvIndex = script.indexOf('const secretEnv = buildSecretEnv')
  const summaryIndex = script.indexOf('zernioProfile,', script.indexOf('persistProvisioningSummary({'))

  assert.notEqual(helperIndex, -1)
  assert.notEqual(callIndex, -1)
  assert.ok(callIndex < secretEnvIndex)
  assert.notEqual(summaryIndex, -1)
})

test('portal provisioning stores Zernio profile metadata on the client and run', async () => {
  const script = await source('scripts/provision-client-portal.mjs')
  const helperStart = script.indexOf('async function ensureZernioCustomerProfile')
  const helperEnd = script.indexOf('async function persistProvisioningSummary', helperStart)
  const helperSource = script.slice(helperStart, helperEnd)
  const summaryStart = script.indexOf('async function persistProvisioningSummary')
  const summaryEnd = script.indexOf('function shell', summaryStart)
  const summarySource = script.slice(summaryStart, summaryEnd)

  assert.notEqual(helperStart, -1)
  assert.notEqual(helperEnd, -1)
  assert.ok(helperSource.includes('zernio_profile_id: profileId'))
  assert.ok(helperSource.includes("const status = connectionReconciliation.needsReconnect.length ? 'needs_reconnect' : 'active'"))
  assert.ok(helperSource.includes('zernio_profile_status: status'))
  assert.ok(helperSource.includes('zernio_profile_metadata'))
  assert.ok(summarySource.includes('zernio_profile: zernioProfile || null'))
})

test('portal provisioning repairs existing social connections into the customer Zernio profile', async () => {
  const script = await source('scripts/provision-client-portal.mjs')
  const moveIndex = script.indexOf('async function moveZernioAccountToProfile')
  const repairIndex = script.indexOf('async function reconcileClientZernioConnections')
  const helperStart = script.indexOf('async function ensureZernioCustomerProfile')
  const helperEnd = script.indexOf('async function persistProvisioningSummary', helperStart)
  const helperSource = script.slice(helperStart, helperEnd)

  assert.notEqual(moveIndex, -1)
  assert.notEqual(repairIndex, -1)
  assert.ok(helperSource.includes('const connectionReconciliation = await reconcileClientZernioConnections'))
  assert.ok(script.includes('/rest/v1/social_connections?select=id,platform,zernio_account_id,zernio_profile_id,zernio_account_metadata'))
  assert.ok(script.includes('zernio_profile_id: repairedProfileId'))
})

test('GitHub onboarding action passes the Zernio API key into portal provisioning', async () => {
  const workflow = await source('.github/workflows/provision-client-portal.yml')

  assert.match(workflow, /ZERNIO_API_KEY:\s*\$\{\{\s*secrets\.ZERNIO_API_KEY\s*\}\}/)
})
