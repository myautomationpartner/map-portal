import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareReplyAssistMessages } from './inboxReplyAssist.js'

test('reply assist finds the actual latest inbound message regardless of API order', () => {
  const newestFirst = [
    { id: 4, created_at: 400, message_type: 'incoming', content: 'Can you come Tuesday afternoon?' },
    { id: 3, created_at: 300, message_type: 1, content: 'What day works best?' },
    { id: 2, created_at: 200, message_type: 0, content: 'I need an estimate for my backyard.' },
    { id: 1, created_at: 100, message_type: 1, content: 'How can we help?' },
  ]

  const prepared = prepareReplyAssistMessages(newestFirst)
  assert.equal(prepared.latestInboundMessage, 'Can you come Tuesday afternoon?')
  assert.deepEqual(prepared.recentContextLines, [
    'Business: How can we help?',
    'Customer: I need an estimate for my backyard.',
    'Business: What day works best?',
    'Customer: Can you come Tuesday afternoon?',
  ])
})

test('reply assist cache context changes when conversation context changes', () => {
  const before = prepareReplyAssistMessages([
    { id: 1, created_at: '2026-07-16T10:00:00Z', message_type: 0, content: 'Do you offer lessons?' },
  ])
  const after = prepareReplyAssistMessages([
    { id: 1, created_at: '2026-07-16T10:00:00Z', message_type: 0, content: 'Do you offer lessons?' },
    { id: 2, created_at: '2026-07-16T10:01:00Z', message_type: 1, content: 'Which age group?' },
  ])

  assert.notEqual(before.contextKey, after.contextKey)
})

test('reply assist represents attachment-only messages without reusing another preview', () => {
  const prepared = prepareReplyAssistMessages([
    { id: 1, created_at: 100, message_type: 0, content: '' },
  ])
  assert.equal(prepared.latestInboundMessage, '[Customer sent an attachment]')
})
