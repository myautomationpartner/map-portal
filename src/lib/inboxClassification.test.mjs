import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCommentBundleDismissals,
  commentDismissalKey,
  countCommentsNeedingReply,
  isPrivateMessageConversation,
  isPublicCommentConversation,
  postDismissalKey,
  selectPrivateMessageConversations,
  summarizeInboxNotifications,
} from './inboxClassification.js'

const inboxes = [{ id: 4, name: 'Social Inbox' }]

test('classifies zernio mirrored comments by structured Chatwoot metadata', () => {
  const conversation = {
    id: 91,
    inbox_id: 4,
    status: 'open',
    meta: { sender: { name: 'Kenny Monico' } },
    messages: [
      {
        content: 'Inbox test',
        content_attributes: {
          zernio_event: 'comment.received',
          zernio_comment_id: 'fb-comment-1',
          zernio_comment_post_id: 'fb-post-1',
        },
      },
    ],
  }

  assert.equal(isPublicCommentConversation(conversation, inboxes), true)
  assert.equal(isPrivateMessageConversation(conversation, inboxes), false)
})

test('keeps ordinary social direct messages in the private message list', () => {
  const conversation = {
    id: 92,
    inbox_id: 4,
    status: 'open',
    meta: { sender: { name: 'Kenny Monico' } },
    messages: [{ content: 'Can you send class info?' }],
  }

  assert.equal(isPublicCommentConversation(conversation, inboxes), false)
  assert.equal(isPrivateMessageConversation(conversation, inboxes), true)
})

test('classifies business-page social inbox mirrors as public comments when metadata is missing', () => {
  const conversation = {
    id: 93,
    inbox_id: 4,
    status: 'open',
    meta: { sender: { name: 'My Automation Partner' } },
    messages: [
      { content: 'Conversation was marked resolved by Admin' },
      { content: 'Landed in both the portal inbox and the daily work queue. Works great!' },
      { content: 'System reopened the conversation due to a new incoming message.' },
    ],
  }
  const options = { businessNames: ['My Automation Partner'] }

  assert.equal(isPublicCommentConversation(conversation, inboxes, options), true)
  assert.equal(isPrivateMessageConversation(conversation, inboxes, options), false)
  assert.deepEqual(selectPrivateMessageConversations([conversation], inboxes, options), [])
})

test('dedupes repeated private message mirrors without removing distinct messages', () => {
  const duplicateBase = {
    status: 'open',
    inbox_id: 4,
    meta: { sender: { name: 'Kenny Monico' } },
  }
  const selected = selectPrivateMessageConversations([
    {
      ...duplicateBase,
      id: 101,
      last_activity_at: 1780052040,
      messages: [{ content: 'Inbox test' }],
    },
    {
      ...duplicateBase,
      id: 102,
      last_activity_at: 1780051980,
      messages: [{ content: 'Inbox test' }],
    },
    {
      ...duplicateBase,
      id: 103,
      last_activity_at: 1780052100,
      messages: [{ content: 'Different customer question' }],
    },
  ], inboxes)

  assert.deepEqual(selected.map((conversation) => conversation.id), [101, 103])
})

test('counts comment replies from reply state and combines notification totals', () => {
  const comments = [
    { id: 'needs-1', text: 'Inbox test', replyCount: 0 },
    { id: 'answered-1', text: 'Love this!', replyCount: 1 },
    { id: 'blocked-1', text: 'Cannot reply', replyCount: 0, canReply: false },
  ]
  const notifications = summarizeInboxNotifications({
    privateConversations: [
      { id: 201, status: 'open' },
      { id: 202, status: 'pending' },
      { id: 203, status: 'resolved' },
    ],
    commentBundles: [{ post: { id: 'post-1' }, comments }],
  })

  assert.equal(countCommentsNeedingReply(comments), 1)
  assert.deepEqual(notifications, {
    messages: 2,
    comments: 1,
    total: 3,
  })
})

test('does not count comments marked as no reply needed', () => {
  const comments = [
    { id: 'dismissed-1', text: 'Love this!', replyCount: 0, noReplyNeeded: true },
    { id: 'needs-1', text: 'Question here', replyCount: 0 },
  ]

  assert.equal(countCommentsNeedingReply(comments), 1)
})

test('applies comment and post dismissals before notification counts', () => {
  const post = { accountId: 'act_123', id: 'post-1' }
  const dismissedComment = { id: 'comment-1', text: 'Thanks!', replyCount: 0 }
  const activeComment = { id: 'comment-2', text: 'Can you help?', replyCount: 0 }
  const otherPost = { accountId: 'act_123', id: 'post-2' }

  const activeBundles = applyCommentBundleDismissals([
    { post, comments: [dismissedComment, activeComment] },
    { post: otherPost, comments: [{ id: 'comment-3', text: 'Clear this thread', replyCount: 0 }] },
  ], new Set([commentDismissalKey(post, dismissedComment)]), new Set([postDismissalKey(otherPost)]))

  assert.equal(activeBundles.length, 1)
  assert.deepEqual(summarizeInboxNotifications({ commentBundles: activeBundles }), {
    messages: 0,
    comments: 1,
    total: 1,
  })
})
