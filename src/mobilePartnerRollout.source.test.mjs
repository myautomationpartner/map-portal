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
  assert.match(homeSource, /state: \{ recentPhotos: files, preselectedPlatforms: selectedPlatforms \}/)
  assert.match(homeSource, /navigate\('\/post', \{ state: \{ preselectedPlatforms: selectedPlatforms \} \}\)/)
  assert.match(homeSource, /Nothing posts without review\./)
})

test('rollout navigation uses the three approved top-level conversation modes', () => {
  assert.match(topBarSource, /label: 'Inbox', to: '\/inbox'/)
  assert.match(topBarSource, /label: 'Post', to: '\/'/)
  assert.match(topBarSource, /label: 'Scheduled', to: '\/post\/scheduled'/)
  assert.match(topBarSource, /aria-label="My Partner workspaces"/)
  assert.match(homeSource, /<MobilePartnerTopBar activeMode="post"/)
  assert.match(scheduledSource, /<MobilePartnerTopBar activeMode="scheduled"/)
  assert.match(navSource, /if \(partnerRollout\) return null/)
})

test('voice and recent-photo controls are present throughout the mobile core flow', () => {
  assert.match(homeSource, /<MobileVoiceComposer/)
  assert.match(partnerSource, /<MobileVoiceComposer/)
  assert.match(createSource, /<MobileVoiceComposer/)
  assert.match(attentionSource, /<MobileVoiceComposer/)
  assert.match(scheduledSource, /<MobileVoiceComposer/)
  assert.doesNotMatch(voiceComposerSource, /<form/)
  assert.match(voiceComposerSource, /type="button"[\s\S]{0,180}onClick=\{handleSubmit\}/)
})

test('mobile Publisher defaults to the three first-pass platforms and still requires final approval', () => {
  assert.match(createSource, /facebook: mobilePartnerRollout/)
  assert.match(createSource, /instagram: mobilePartnerRollout/)
  assert.match(createSource, /twitter: mobilePartnerRollout/)
  assert.match(createSource, /\['facebook', 'instagram', 'twitter'\]\.includes\(platform\.id\)/)
  assert.match(createSource, /useState\(mobilePartnerRollout \? 'now' : 'slot'\)/)
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
