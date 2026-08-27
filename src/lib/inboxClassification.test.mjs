import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCommentBundleDismissals,
  commentDismissalKey,
  commentNeedsReply,
  countCommentsNeedingReply,
  countCommentPostsNeedingReply,
  isPrivateMessageConversation,
  isPublicCommentConversation,
  isStaleSocialPraiseComment,
  postDismissalKey,
  resolveInboxSyncState,
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
    messages: 1,
    comments: 1,
    total: 2,
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

test('old non-question social praise is not actionable, questions stay in Needs you', () => {
  const now = Date.parse('2026-08-27T16:00:00.000Z')
  const stalePraise = {
    id: 'congrats-old',
    text: 'Congratulations!',
    replyCount: 0,
    createdTime: '2026-06-01T15:00:00.000Z',
  }
  const recentPraise = {
    id: 'congrats-new',
    text: 'Congratulations!',
    replyCount: 0,
    createdTime: '2026-08-26T15:00:00.000Z',
  }
  const praiseWithQuestion = {
    id: 'congrats-question',
    text: 'Congratulations! What time is the recital?',
    replyCount: 0,
    createdTime: '2026-06-01T15:00:00.000Z',
  }

  assert.equal(isStaleSocialPraiseComment(stalePraise, now), true)
  assert.equal(commentNeedsReply(stalePraise, now), false)
  assert.equal(commentNeedsReply(recentPraise, now), true)
  assert.equal(commentNeedsReply(praiseWithQuestion, now), true)
})

test('needs-you badge counts open DMs plus comment threads, not every leftover praise comment', () => {
  const now = Date.parse('2026-08-27T16:00:00.000Z')
  const bundles = [
    {
      post: { id: 'post-1', platform: 'facebook' },
      comments: [
        { id: 'c1', text: 'Congratulations!', replyCount: 0, createdTime: '2026-06-01T12:00:00.000Z' },
        { id: 'c2', text: 'Can we still register?', replyCount: 0, createdTime: '2026-06-01T13:00:00.000Z' },
      ],
    },
    {
      post: { id: 'post-2', platform: 'facebook' },
      comments: [
        { id: 'c3', text: 'So cute!', replyCount: 0, createdTime: '2026-05-20T12:00:00.000Z' },
        { id: 'c4', text: 'Love this', replyCount: 0, createdTime: '2026-05-21T12:00:00.000Z' },
      ],
    },
  ]

  assert.equal(countCommentsNeedingReply(bundles[0].comments, now), 1)
  assert.equal(countCommentPostsNeedingReply(bundles, now), 1)
  assert.deepEqual(summarizeInboxNotifications({
    privateConversations: [
      { id: 1, status: 'open' },
      { id: 2, status: 'pending' },
    ],
    commentBundles: bundles,
    now,
  }), {
    messages: 1,
    comments: 1,
    total: 2,
  })
})

test('inbox sync label stays honest about stale Facebook comments', () => {
  const now = Date.parse('2026-08-27T16:00:00.000Z')
  const state = resolveInboxSyncState({
    commentBundles: [{
      post: { id: 'post-1', platform: 'facebook', createdTime: '2026-06-01T12:00:00.000Z' },
      comments: [{ id: 'c1', text: 'Congratulations!', createdTime: '2026-06-01T15:22:00.000Z' }],
    }],
    now,
  })

  assert.match(state.label, /Facebook comments last synced Jun 1, 2026/)
  assert.match(state.label, /not a live feed/)
  assert.equal(state.commentsStale, true)
})
