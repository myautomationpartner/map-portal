import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  isMobilePartnerRolloutTenant,
  mobilePartnerRolloutTenants,
} from './lib/mobilePartnerRollout.js'

const homeSource = await readFile(new URL('./components/MobilePartnerHome.jsx', import.meta.url), 'utf8')
const navSource = await readFile(new URL('./components/BottomNav.jsx', import.meta.url), 'utf8')
const topBarSource = await readFile(new URL('./components/MobilePartnerTopBar.jsx', import.meta.url), 'utf8')
const scheduledSource = await readFile(new URL('./components/MobileScheduledPartner.jsx', import.meta.url), 'utf8')
const partnerSource = await readFile(new URL('./components/PortalPartner.jsx', import.meta.url), 'utf8')
const createSource = await readFile(new URL('./pages/CreatePost.jsx', import.meta.url), 'utf8')
const attentionSource = await readFile(new URL('./pages/Attention.jsx', import.meta.url), 'utf8')
const portalApiSource = await readFile(new URL('./lib/portalApi.js', import.meta.url), 'utf8')
const voiceComposerSource = await readFile(new URL('./components/MobileVoiceComposer.jsx', import.meta.url), 'utf8')
const mobileChatSource = await readFile(new URL('./components/MobilePartnerChat.jsx', import.meta.url), 'utf8')
const appHtmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const imageAssistSource = await readFile(new URL('./lib/imageAssist.js', import.meta.url), 'utf8')
const pwaSource = await readFile(new URL('./lib/pwa.js', import.meta.url), 'utf8')
const serviceWorkerSource = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const workerSource = await readFile(new URL('../worker.js', import.meta.url), 'utf8')
const deploySource = await readFile(new URL('../scripts/deploy-portal-update.mjs', import.meta.url), 'utf8')

test('mobile Partner rollout is limited to the two approved first customers', () => {
  assert.deepEqual(
    mobilePartnerRolloutTenants().sort(),
    ['dancescapes-performing-arts-llc', 'my-automation-partner'],
  )
  assert.equal(isMobilePartnerRolloutTenant({ clientSlug: 'DANCESCAPES-PERFORMING-ARTS-LLC' }), true)
  assert.equal(isMobilePartnerRolloutTenant({ clientSlug: 'my-automation-partner' }), true)
  assert.equal(isMobilePartnerRolloutTenant({ clientSlug: 'another-customer' }), false)
})

test('mobile home reuses Publisher and carries Facebook, Instagram, and X choices forward', () => {
  assert.match(homeSource, /useState\(\['facebook', 'instagram', 'twitter'\]\)/)
  assert.match(homeSource, /recentPhotos: files/)
  assert.match(homeSource, /preselectedPlatforms: selectedPlatforms/)
  assert.match(homeSource, /initialCaption: options\.caption/)
  assert.match(homeSource, /navigate\('\/post', \{ state: \{ preselectedPlatforms: selectedPlatforms \} \}\)/)
  assert.match(homeSource, /Nothing posts without review\./)
})

test('rollout navigation uses the three approved top-level conversation modes', () => {
  assert.match(topBarSource, /label: 'Inbox', to: '\/inbox'/)
  assert.match(topBarSource, /label: 'Post', to: '\/'/)
  assert.match(topBarSource, /label: 'Scheduled', to: '\/post\/scheduled'/)
  assert.match(topBarSource, /aria-label="My Partner workspaces"/)
  assert.match(topBarSource, /resetWorkspaceScroll/)
  assert.match(homeSource, /<MobilePartnerTopBar activeMode="post"/)
  assert.match(scheduledSource, /<MobilePartnerTopBar activeMode="scheduled"/)
  assert.match(navSource, /if \(partnerRollout\) return null/)
})

test('voice and recent-photo controls are present throughout the mobile core flow', () => {
  assert.match(homeSource, /<MobilePartnerChat/)
  assert.match(partnerSource, /<MobileVoiceComposer/)
  assert.match(createSource, /<MobileVoiceComposer/)
  assert.match(attentionSource, /<MobileVoiceComposer/)
  assert.match(scheduledSource, /<MobilePartnerChat/)
  assert.match(mobileChatSource, /<MobileVoiceComposer/)
  assert.doesNotMatch(voiceComposerSource, /<form/)
  assert.match(voiceComposerSource, /type="button"[\s\S]{0,180}onClick=\{handleSubmit\}/)
  assert.match(voiceComposerSource, /aria-label="Add a photo or file"/)
  assert.match(voiceComposerSource, /photoInputRef\.current\?\.click\(\)/)
  assert.doesNotMatch(voiceComposerSource, /mobile-voice-attachment-menu/)
  assert.doesNotMatch(voiceComposerSource, />Take Photo</)
  assert.match(mobileChatSource, /generatePublisherAssist\(/)
  assert.match(mobileChatSource, /image_data_urls: imageDataUrls/)
  assert.match(mobileChatSource, /Attachments ready for this post/)
  assert.match(mobileChatSource, /Ready-to-review social post/)
  assert.match(mobileChatSource, /reviewLabel = 'Review & post'/)
  assert.match(mobileChatSource, /resetLabel = 'Try another photo'/)
  assert.match(mobileChatSource, /setGeneratedPost/)
  assert.match(imageAssistSource, /canvas\.toDataURL\('image\/jpeg'/)
})

test('mobile Partner chat stays inline, supports multiline drafts, and opts into iPhone safe areas', () => {
  assert.match(homeSource, /<MobilePartnerChat/)
  assert.match(scheduledSource, /<MobilePartnerChat/)
  assert.doesNotMatch(homeSource, /map:open-portal-partner/)
  assert.doesNotMatch(scheduledSource, /map:open-portal-partner/)
  assert.match(mobileChatSource, /sendPortalPartnerMessage/)
  assert.match(mobileChatSource, /submitOnEnter=\{false\}/)
  assert.match(voiceComposerSource, /textarea\.scrollHeight/)
  assert.match(appHtmlSource, /viewport-fit=cover/)
})

test('installed phone portals refresh onto the current release instead of keeping stale attachment behavior', () => {
  assert.match(pwaSource, /VITE_PORTAL_RELEASE/)
  assert.match(pwaSource, /service-worker\.js\?release=/)
  assert.match(pwaSource, /updateViaCache: 'none'/)
  assert.match(pwaSource, /controllerchange/)
  assert.match(pwaSource, /window\.location\.pathname/)
  assert.match(pwaSource, /window\.location\.reload\(\)/)
  assert.match(serviceWorkerSource, /map-portal-shell-v2/)
  assert.match(workerSource, /assetNormalized\.url\.pathname !== '\/service-worker\.js'/)
  assert.match(workerSource, /headers\.set\('cache-control', 'no-store, max-age=0'\)/)
  assert.match(deploySource, /'run_worker_first = true'/)
})

test('mobile Publisher defaults to the three first-pass platforms and still requires final approval', () => {
  assert.match(createSource, /facebook: mobilePartnerRollout/)
  assert.match(createSource, /instagram: mobilePartnerRollout/)
  assert.match(createSource, /twitter: mobilePartnerRollout/)
  assert.match(createSource, /\['facebook', 'instagram', 'twitter'\]\.includes\(platform\.id\)/)
  assert.match(createSource, /useState\(mobilePartnerRollout \? 'now' : 'slot'\)/)
  assert.match(createSource, /MobilePublisherConversation/)
  assert.match(createSource, /Nothing posts until you approve it/)
  assert.match(createSource, /Final approval opens one last confirmation/)
  assert.match(createSource, /Ask for changes before approval/)
  assert.match(createSource, /Customer request during final review/)
  assert.match(createSource, /Type or speak an edit/)
  assert.match(createSource, /create-post-review-modal-partner/)
  assert.match(createSource, /Approve & Publish/)
})

test('Inbox AI drafts an editable reply but existing message bridges remain the only send path', () => {
  assert.match(portalApiSource, /export async function generateInboxReplyAssist\(input\)/)
  assert.match(attentionSource, /generateInboxReplyAssist\(/)
  assert.match(attentionSource, /setComposer\(activeReplySuggestion\.caption\)/)
  assert.match(attentionSource, />Use and edit</)
  assert.match(attentionSource, /mutationFn: sendDmReply/)
  assert.match(attentionSource, /mutationFn: sendCommentReply/)
  assert.match(attentionSource, /const \[, , conversationId\] = queryKey/)
  assert.doesNotMatch(attentionSource, /const \[, conversationId\] = queryKey/)
  assert.match(attentionSource, /queryKey: \['attention-messages', demoCaptureState \? 'demo' : 'live', conversationId\]/)
  assert.doesNotMatch(attentionSource, /queryKey: \['attention-messages', conversationId\]/)
  assert.doesNotMatch(attentionSource, /generateInboxReplyAssist[\s\S]{0,500}\.mutate\(/)
})
