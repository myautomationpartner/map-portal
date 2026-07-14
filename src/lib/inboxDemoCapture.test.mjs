import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInboxDemoCaptureState, isInboxDemoCaptureEnabled } from './inboxDemoCapture.js'

test('enables demo inbox only for launch asset capture requests', () => {
  assert.equal(isInboxDemoCaptureEnabled('?capture=launch-assets&demoInbox=1'), true)
  assert.equal(isInboxDemoCaptureEnabled('?capture=launch-assets&demoInbox=messages'), true)
  assert.equal(isInboxDemoCaptureEnabled('?capture=launch-assets'), false)
  assert.equal(isInboxDemoCaptureEnabled('?demoInbox=1'), false)
})

test('builds a populated message workflow for screenshot capture', () => {
  const state = buildInboxDemoCaptureState(1_800_000_000)
  const selected = state.conversations.find((conversation) => conversation.id === state.selectedConversationId)

  assert.equal(state.inboxes.length, 2)
  assert.equal(state.conversations.length, 2)
  assert.equal(selected.meta.sender.name, 'Sarah Lee')
  assert.equal(state.messagesByConversationId[state.selectedConversationId].length, 4)
  assert.match(state.messagesByConversationId[state.selectedConversationId][0].content, /promote the June 1 open house/)
  assert.equal(state.replySuggestions.length, 2)
  assert.match(state.replySuggestions[0].caption, /without registering first/)
  assert.equal(state.websiteChat.settings.install_status, 'detected')
})
