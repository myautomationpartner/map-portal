import test from 'node:test'
import assert from 'node:assert/strict'
import { canHideInboxThread } from './inboxThreadActions.js'

test('allows customer inbox hide action for Chatwoot-backed DM threads', () => {
  assert.equal(canHideInboxThread({ kind: 'dm', conversation: { id: 123 } }), true)
  assert.equal(canHideInboxThread({ kind: 'partner', conversation: { id: 456 } }), true)
})

test('does not expose customer hide action for public comment threads', () => {
  assert.equal(canHideInboxThread({ kind: 'comments', post: { id: 'post-1' } }), false)
  assert.equal(canHideInboxThread({ kind: 'dm', conversation: null }), false)
})
