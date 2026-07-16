import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const notificationsSource = fs.readFileSync(new URL('./Notifications.jsx', import.meta.url), 'utf8')
const topBarSource = fs.readFileSync(new URL('../components/MobilePartnerTopBar.jsx', import.meta.url), 'utf8')
const createPostSource = fs.readFileSync(new URL('./CreatePost.jsx', import.meta.url), 'utf8')
const workerSource = fs.readFileSync(new URL('../../worker.js', import.meta.url), 'utf8')
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

test('content opportunities persist in the mobile notification center after a push is ignored', () => {
  assert.match(topBarSource, /navigate\('\/notifications'\)/)
  assert.match(notificationsSource, /fetchOpportunityRadar\(clientId\)/)
  assert.match(notificationsSource, /Content ideas stay review-only until you approve them/)
  assert.match(notificationsSource, /Create this post/)
  assert.match(appSource, /'\/notifications'/)
})

test('content opportunity push taps create the complete review-first post', () => {
  assert.match(workerSource, /type: 'content_opportunity'/)
  assert.match(workerSource, /content-opportunity:\$\{suggestion\.id\}/)
  assert.match(workerSource, /post\?opportunityId=.*suggestionId=.*create=1/)
  assert.match(workerSource, /test-content-opportunity:\$\{contentOpportunity\.suggestion\.id\}/)
  assert.match(createPostSource, /fetchOpportunityRadar\(clientId\)/)
  assert.match(createPostSource, /void handleGenerateImage\(\{ prompt: imagePrompt, caption, platforms: selected \}\)/)
  assert.match(createPostSource, /Nothing will post until you approve it/)
})

test('social connection loss stays visible and reconnects in the same mobile window', () => {
  assert.match(workerSource, /\/api\/social-connections\/health/)
  assert.match(workerSource, /type: 'social_connection_down'/)
  assert.match(workerSource, /social-connection-down:/)
  assert.match(notificationsSource, /fetchSocialConnectionHealth/)
  assert.match(notificationsSource, /Connection needs attention/)
  assert.match(notificationsSource, /window\.location\.assign\(result\.authUrl\)/)
  assert.match(notificationsSource, /Reconnect \{connection\.label\}/)
})
