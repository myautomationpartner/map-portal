import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const appRoot = new URL('../../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, appRoot), 'utf8')
}

test('social connection polling refreshes the customer-scoped Zernio profile before reading Supabase', async () => {
  const settings = await source('src/pages/Settings.jsx')
  const pollIndex = settings.indexOf('const result = await checkConnectionStatus(normalizedPlatform')
  const refreshEndpointIndex = settings.indexOf("const SETTINGS_REFRESH_ENDPOINT = '/api/social-connections/refresh'")
  const refreshFunctionIndex = settings.indexOf('async function refreshSocialConnections(platform)')
  const refreshCallIndex = settings.indexOf('await refreshSocialConnections(normalizedPlatform)')
  const invalidateIndex = settings.indexOf('await queryClient.invalidateQueries({ queryKey: connectionQueryKey })')
  const fetchIndex = settings.indexOf('const latestConnections = await fetchConnections(clientId)', invalidateIndex)
  const cacheIndex = settings.indexOf('queryClient.setQueryData(connectionQueryKey, latestConnections)', fetchIndex)
  const refetchIntervalIndex = settings.indexOf('refetchInterval: connectingPlatform ? 2000 : false')
  const clearOnConnectionIndex = settings.indexOf('if (!connectingPlatform || !connectedMap[connectingPlatform]) return')

  assert.equal(settings.includes('syncZernioAccounts'), false)
  assert.equal(settings.includes('SETTINGS_SYNC_ENDPOINT'), false)
  assert.notEqual(refreshEndpointIndex, -1)
  assert.notEqual(refreshFunctionIndex, -1)
  assert.ok(refreshCallIndex > refreshFunctionIndex)
  assert.notEqual(pollIndex, -1)
  assert.ok(invalidateIndex > refreshCallIndex)
  assert.ok(fetchIndex > invalidateIndex)
  assert.ok(cacheIndex > fetchIndex)
  assert.notEqual(refetchIntervalIndex, -1)
  assert.notEqual(clearOnConnectionIndex, -1)
  assert.match(settings, /Zernio account event/)
})

test('social connection timeout copy explains X authorization failures', async () => {
  const settings = await source('src/pages/Settings.jsx')

  assert.match(settings, /function getConnectPendingTimeoutMessage/)
  assert.match(settings, /MAP did not receive a completed X \/ Twitter connection/)
  assert.match(settings, /If X showed "Something went wrong"/)
})
