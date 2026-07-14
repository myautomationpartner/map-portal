import test from 'node:test'
import assert from 'node:assert/strict'
import { commentThreadIdFromPostKey, mobileInboxRouteState } from './mobileInboxRouting.js'

test('mobile inbox routes Today public-comment links into the Comments thread', () => {
  assert.equal(commentThreadIdFromPostKey('account-1:post-1'), 'comments:post-1:account-1')
  assert.deepEqual(
    mobileInboxRouteState('?section=comments&post=account-1%3Apost-1'),
    {
      activeFilter: 'comments',
      selectedThreadId: 'comments:post-1:account-1',
      mobileThreadOpen: true,
    },
  )
})

test('mobile inbox routes Today customer-reply links into DMs', () => {
  assert.deepEqual(
    mobileInboxRouteState('?section=messages&conversation=41'),
    {
      activeFilter: 'dms',
      selectedThreadId: 'dm:41',
      mobileThreadOpen: true,
    },
  )
})

test('mobile inbox defaults to the open work list when no deep link is present', () => {
  assert.deepEqual(
    mobileInboxRouteState(''),
    {
      activeFilter: 'open',
      selectedThreadId: '',
      mobileThreadOpen: false,
    },
  )
})
