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

test('portal provisioning re-reads Zernio profiles when create response lacks an id', async () => {
  const script = await source('scripts/provision-client-portal.mjs')
  const helperStart = script.indexOf('async function ensureZernioCustomerProfile')
  const helperEnd = script.indexOf('async function persistProvisioningSummary', helperStart)
  const helperSource = script.slice(helperStart, helperEnd)

  assert.notEqual(helperStart, -1)
  assert.notEqual(helperEnd, -1)
  assert.match(helperSource, /if \(!resolveZernioProfileId\(profile\)\)/)
  assert.match(helperSource, /const refreshedProfiles = await listZernioProfilesForProvisioning\(\)/)
  assert.match(helperSource, /profile = findZernioProfileForClient\(client, refreshedProfiles\) \|\| profile/)
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

test('GitHub onboarding action passes shared-path provisioning controls into portal provisioning', async () => {
  const workflow = await source('.github/workflows/provision-client-portal.yml')

  assert.match(workflow, /CHATWOOT_WEBHOOK_BRIDGE_SECRET:\s*\$\{\{\s*secrets\.CHATWOOT_WEBHOOK_BRIDGE_SECRET\s*\}\}/)
  assert.match(workflow, /DEPLOYMENT_MODE:\s*\$\{\{\s*github\.event\.inputs\.deployment_mode\s*\|\|\s*github\.event\.client_payload\.deployment_mode\s*\|\|\s*'shared-path'\s*\}\}/)
  assert.match(workflow, /DEPLOY_SHARED_WORKER:\s*\$\{\{\s*github\.event\.inputs\.deploy_shared_worker\s*\|\|\s*github\.event\.client_payload\.deploy_shared_worker\s*\|\|\s*'false'\s*\}\}/)
  assert.match(workflow, /MAP_SHARED_PORTAL_HOST:\s*\$\{\{\s*vars\.MAP_SHARED_PORTAL_HOST\s*\|\|\s*'myautomationpartner\.com'\s*\}\}/)
  assert.match(workflow, /MAP_SHARED_PORTAL_PATH_PREFIX:\s*\$\{\{\s*vars\.MAP_SHARED_PORTAL_PATH_PREFIX\s*\|\|\s*'portal'\s*\}\}/)
  assert.match(workflow, /args\+=\(--shared-path\)/)
  assert.match(workflow, /args\+=\(--deploy-shared-worker\)/)
})

test('Chatwoot account lookup failures stop before creating a replacement account', async () => {
  const script = await source('scripts/provision-client-portal.mjs')
  const findStart = script.indexOf('async function findChatwootAccountForClient')
  const findEnd = script.indexOf('async function createOrUpdateChatwootAccount', findStart)
  const findSource = script.slice(findStart, findEnd)

  assert.notEqual(findStart, -1)
  assert.notEqual(findEnd, -1)
  assert.match(findSource, /Unable to verify existing Chatwoot account/)
  assert.match(findSource, /throw new Error/)
  assert.doesNotMatch(findSource, /creating a fresh account/)
})

test('Chatwoot account lookup failures verify the saved tenant account before failing', async () => {
  const script = await source('scripts/provision-client-portal.mjs')
  const savedSettingsIndex = script.indexOf('async function loadWebsiteChatSettingsForClient')
  const savedAccountIndex = script.indexOf('async function findChatwootAccountFromSavedSettings')
  const findStart = script.indexOf('async function findChatwootAccountForClient')
  const findEnd = script.indexOf('async function createOrUpdateChatwootAccount', findStart)
  const findSource = script.slice(findStart, findEnd)

  assert.notEqual(savedSettingsIndex, -1)
  assert.notEqual(savedAccountIndex, -1)
  assert.ok(savedSettingsIndex < findStart)
  assert.ok(savedAccountIndex < findStart)
  assert.match(script, /client_website_chat_settings\?select=chatwoot_account_id/)
  assert.match(script, /\/platform\/api\/v1\/accounts\/\$\{accountId\}/)
  assert.match(findSource, /findChatwootAccountFromSavedSettings\(client\)/)
  assert.match(findSource, /return savedAccount/)
  assert.match(findSource, /Using saved Chatwoot account/)
  assert.match(findSource, /Saved account fallback/)
})

test('Chatwoot account lookup prefers the saved tenant account before list matches', async () => {
  const script = await source('scripts/provision-client-portal.mjs')
  const findStart = script.indexOf('async function findChatwootAccountForClient')
  const findEnd = script.indexOf('async function createOrUpdateChatwootAccount', findStart)
  const findSource = script.slice(findStart, findEnd)
  const savedLookupIndex = findSource.indexOf('findChatwootAccountFromSavedSettings(client)')
  const listLookupIndex = findSource.indexOf('await listChatwootAccounts()')

  assert.notEqual(findStart, -1)
  assert.notEqual(findEnd, -1)
  assert.notEqual(savedLookupIndex, -1)
  assert.notEqual(listLookupIndex, -1)
  assert.ok(savedLookupIndex < listLookupIndex)
})
