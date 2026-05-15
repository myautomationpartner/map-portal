import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('dashboard polls profile-scoped social state while a connection is finishing', async () => {
  const source = await readFile(new URL('./Dashboard.jsx', import.meta.url), 'utf8')
  const metricsQueryIndex = source.indexOf("queryKey: ['dashboard-social-metrics', clientId]")
  const connectionsQueryIndex = source.indexOf("queryKey: ['social_connections', clientId]")
  const connectSuccessIndex = source.indexOf('Finish connecting ${formatPlatformLabel(platform)}')
  const connectedEffectIndex = source.indexOf('connectedPlatformIds.has(connectingPlatform)')

  assert.notEqual(metricsQueryIndex, -1)
  assert.notEqual(connectionsQueryIndex, -1)
  assert.notEqual(connectSuccessIndex, -1)
  assert.notEqual(connectedEffectIndex, -1)
  assert.ok(source.indexOf('refetchInterval: connectingPlatform ? 2000 : false', metricsQueryIndex) > metricsQueryIndex)
  assert.ok(source.indexOf('refetchIntervalInBackground: true', metricsQueryIndex) > metricsQueryIndex)
  assert.ok(source.indexOf('refetchInterval: connectingPlatform ? 2000 : false', connectionsQueryIndex) > connectionsQueryIndex)
  assert.ok(source.indexOf('let keepPolling = false', connectSuccessIndex) < connectSuccessIndex)
  assert.ok(connectedEffectIndex > connectionsQueryIndex)
})
