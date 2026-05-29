import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('./portalApi.js', import.meta.url), 'utf8')
const campaignSource = await readFile(new URL('../pages/CampaignPartner.jsx', import.meta.url), 'utf8')

test('Campaign Partner delete removes future scheduled posts but preserves published history', () => {
  assert.match(source, /export function getLinkedCampaignPostIds\(drafts = \[\]\)/)
  assert.match(source, /export function isFutureCampaignCalendarPost\(post\)/)
  assert.match(source, /return post\.status === 'scheduled'/)
  assert.match(source, /const linkedPosts = await fetchCampaignLinkedPosts\(project\.client_id, linkedPostIds\)/)
  assert.match(source, /filter\(isFutureCampaignCalendarPost\)/)
  assert.match(source, /preservedPublishedPostCount: linkedPosts\.filter\(\(post\) => post\.status === 'published'\)\.length/)
  assert.doesNotMatch(source, /for \(const postId of linkedPostIds\)/)
  assert.match(campaignSource, /Already-posted social posts will stay in Publisher history\./)
})

test('workspace preferences persist today queue state without replacing workspace tools', () => {
  assert.match(source, /today_queue_state_json/)
  assert.match(source, /export async function saveTodayQueueState/)
  assert.match(source, /workspace_tools_json:\s*\[\]/)
  assert.match(source, /WORKSPACE_PREFERENCE_SELECT = 'id, client_id, user_id, workspace_tools_json, today_queue_state_json, updated_at'/)
  assert.match(source, /select\(WORKSPACE_PREFERENCE_SELECT\)/)
})
