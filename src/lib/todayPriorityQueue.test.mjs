import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyTodayQueueState,
  buildTodayPriorityQueue,
  buildTodayPriorityQueueFromPortalData,
  completeTodayQueueItem,
  filterTodayPriorityQueue,
  updateTodayQueueState,
  summarizeTodayPriorityQueue,
} from './todayPriorityQueue.js'

test('today priority queue starts with a dense actionable work list', () => {
  const queue = buildTodayPriorityQueue()

  assert.equal(queue.length, 10)
  assert.deepEqual(
    queue.slice(0, 5).map((item) => item.id),
    ['mary', 'approve', 'campaign', 'failed', 'file'],
  )
  assert.equal(queue[0].priority, 'P0')
  assert.equal(queue[0].source, 'Inbox')
  assert.equal(queue[0].actionLabel, 'Reply')
})

test('today priority queue can be built from live portal source data', () => {
  const queue = buildTodayPriorityQueueFromPortalData({
    now: '2026-05-29T13:00:00.000Z',
    conversations: [
      {
        id: 41,
        status: 'open',
        last_activity_at: Math.floor(Date.now() / 1000) - 300,
        meta: { sender: { name: 'Jordan Lee', email: 'jordan@example.com' } },
        messages: [{ content: 'Can I book a trial class this week?' }],
      },
    ],
    socialDrafts: [
      {
        id: 'draft-1',
        source_workflow: 'campaign_partner',
        draft_title: 'Summer enrollment launch',
        draft_caption: 'Open enrollment starts next week.',
        review_state: 'draft_created',
        scheduled_for: '2026-05-29T20:00:00.000Z',
      },
    ],
    calendarPosts: [
      {
        id: 'post-1',
        content: 'Reminder post',
        status: 'scheduled',
        scheduled_for: '2026-05-29T19:00:00.000Z',
        platforms: ['facebook', 'instagram'],
      },
    ],
    opportunities: [
      {
        id: 'opp-1',
        title: 'Parent FAQ content gap',
        why_it_matters: 'Recent questions point to confusion about beginner options.',
        urgency_score: 81,
        client_opportunity_suggestions: [
          {
            id: 'suggestion-1',
            title: 'Trial class FAQ',
            caption_starter: 'A short answer for parents wondering where to start.',
            review_state: 'new',
            recommended_publish_at: '2026-05-29T18:00:00.000Z',
          },
        ],
      },
    ],
    documents: [
      {
        id: 'doc-1',
        file_name: 'New Portal Screenshots.zip',
        category: 'Campaign assets',
        created_at: '2026-05-29T11:00:00.000Z',
      },
    ],
  })

  assert.deepEqual(
    queue.slice(0, 5).map((item) => item.id),
    ['inbox:41', 'draft:draft-1', 'post:post-1', 'opportunity:suggestion-1', 'file:doc-1'],
  )
  assert.equal(queue[0].source, 'Inbox')
  assert.equal(queue[0].targetHref, '/inbox?section=messages&conversation=41')
  assert.equal(queue[1].targetHref, '/post?draftId=draft-1')
  assert.equal(queue[3].source, 'Idea')
})

test('today priority queue does not surface stale past scheduled drafts', () => {
  const queue = buildTodayPriorityQueueFromPortalData({
    now: '2026-05-29T13:00:00.000Z',
    socialDrafts: [
      {
        id: 'may-8',
        source_workflow: 'chatwoot_content_partner',
        draft_title: 'Old test message draft',
        draft_caption: 'This should not show in Today.',
        review_state: 'draft_created',
        slot_date_local: '2026-05-08',
        scheduled_for: '2026-05-08T15:00:00.000Z',
        updated_at: '2026-05-08T12:00:00.000Z',
      },
      {
        id: 'today',
        source_workflow: 'campaign_partner',
        draft_title: 'Inbox Without the Chaos',
        draft_caption: 'This is current work.',
        review_state: 'draft_created',
        slot_date_local: '2026-05-29',
        scheduled_for: '2026-05-29T15:30:00.000Z',
        updated_at: '2026-05-28T15:24:25.000Z',
      },
      {
        id: 'future',
        source_workflow: 'campaign_partner',
        draft_title: 'Launch Reminder',
        draft_caption: 'This is upcoming work.',
        review_state: 'draft_created',
        slot_date_local: '2026-06-01',
        scheduled_for: '2026-06-01T13:30:00.000Z',
        updated_at: '2026-05-28T15:24:25.000Z',
      },
    ],
  })

  assert.deepEqual(queue.map((item) => item.id), ['draft:today'])
})

test('today priority queue focuses on work due today instead of future backlog', () => {
  const queue = buildTodayPriorityQueueFromPortalData({
    now: '2026-05-29T13:00:00.000Z',
    conversations: [
      {
        id: 41,
        status: 'open',
        last_activity_at: Math.floor(Date.parse('2026-05-29T12:40:00.000Z') / 1000),
        meta: { sender: { name: 'Jordan Lee' } },
        messages: [{ content: 'Can I book a trial class today?' }],
      },
    ],
    socialDrafts: [
      {
        id: 'today-draft',
        source_workflow: 'campaign_partner',
        draft_title: 'Today follow-up',
        review_state: 'draft_created',
        slot_date_local: '2026-05-29',
        scheduled_for: '2026-05-29T20:00:00.000Z',
      },
      {
        id: 'future-draft',
        source_workflow: 'campaign_partner',
        draft_title: 'Next week launch',
        review_state: 'draft_created',
        slot_date_local: '2026-06-01',
        scheduled_for: '2026-06-01T13:30:00.000Z',
      },
    ],
    calendarPosts: [
      {
        id: 'today-post',
        status: 'scheduled',
        scheduled_for: '2026-05-29T22:00:00.000Z',
        content: 'Today scheduled post',
      },
      {
        id: 'future-post',
        status: 'scheduled',
        scheduled_for: '2026-05-30T15:00:00.000Z',
        content: 'Tomorrow scheduled post',
      },
    ],
    opportunities: [
      {
        id: 'today-opp',
        title: 'Same-day FAQ',
        urgency_score: 82,
        suggested_timing: '2026-05-29T18:00:00.000Z',
        client_opportunity_suggestions: [
          {
            id: 'today-suggestion',
            title: 'Answer today question',
            caption_starter: 'A question customers are asking today.',
            review_state: 'new',
            recommended_publish_at: '2026-05-29T18:00:00.000Z',
          },
        ],
      },
      {
        id: 'future-opp',
        title: 'Next week idea',
        urgency_score: 90,
        suggested_timing: '2026-06-01T14:00:00.000Z',
        client_opportunity_suggestions: [
          {
            id: 'future-suggestion',
            title: 'Schedule next week',
            caption_starter: 'A good idea, but not today.',
            review_state: 'new',
            recommended_publish_at: '2026-06-01T14:00:00.000Z',
          },
        ],
      },
    ],
    documents: [
      {
        id: 'today-doc',
        file_name: 'Today screenshots.zip',
        category: 'Campaign assets',
        created_at: '2026-05-29T11:00:00.000Z',
      },
      {
        id: 'old-doc',
        file_name: 'Old screenshots.zip',
        category: 'Campaign assets',
        created_at: '2026-05-27T11:00:00.000Z',
      },
    ],
  })

  assert.deepEqual(queue.map((item) => item.id), [
    'inbox:41',
    'draft:today-draft',
    'post:today-post',
    'opportunity:today-suggestion',
    'file:today-doc',
  ])
})

test('today priority queue excludes public comments mirrored into Chatwoot', () => {
  const queue = buildTodayPriorityQueueFromPortalData({
    now: '2026-05-29T13:00:00.000Z',
    conversations: [
      {
        id: 41,
        status: 'open',
        last_activity_at: Math.floor(Date.parse('2026-05-29T12:40:00.000Z') / 1000),
        meta: { sender: { name: 'Kenny Monico' } },
        messages: [
          {
            content: 'Inbox test',
            content_attributes: {
              zernio_event: 'comment.received',
              zernio_comment_id: 'fb-comment-1',
            },
          },
        ],
      },
      {
        id: 42,
        status: 'open',
        last_activity_at: Math.floor(Date.parse('2026-05-29T12:45:00.000Z') / 1000),
        meta: { sender: { name: 'Jordan Lee' } },
        messages: [{ content: 'Can I book a trial class today?' }],
      },
    ],
  })

  assert.deepEqual(queue.map((item) => item.id), ['inbox:42'])
})

test('today priority queue includes unreplied public comments from comment bundles once', () => {
  const queue = buildTodayPriorityQueueFromPortalData({
    now: '2026-05-29T13:00:00.000Z',
    conversations: [
      {
        id: 41,
        status: 'open',
        last_activity_at: Math.floor(Date.parse('2026-05-29T13:49:00.000Z') / 1000),
        meta: { sender: { name: 'Kenny Monico' } },
        messages: [
          {
            content: 'Inbox test',
            content_attributes: {
              zernio_event: 'comment.received',
              zernio_comment_id: 'fb-comment-1',
            },
          },
        ],
      },
    ],
    commentBundles: [
      {
        post: {
          id: 'post-1',
          accountId: 'account-1',
          platform: 'facebook',
          content: 'We are refreshing My Automation Partner for small business owners.',
        },
        comments: [
          {
            id: 'fb-comment-1',
            authorName: 'Kenny Monico',
            text: 'Inbox test',
            createdTime: '2026-05-29T13:49:00.000Z',
            replyCount: 0,
          },
          {
            id: 'answered',
            authorName: 'Facebook commenter',
            text: 'Love this!',
            createdTime: '2026-05-14T14:27:00.000Z',
            replyCount: 1,
          },
        ],
      },
    ],
  })

  assert.deepEqual(queue.map((item) => item.id), ['comment:fb-comment-1'])
  assert.equal(queue[0].source, 'Inbox')
  assert.equal(queue[0].sourceDetail, 'Comment')
  assert.equal(queue[0].targetHref, '/inbox?section=comments&post=account-1%3Apost-1')
})

test('today priority queue does not duplicate business-page comment mirrors as messages', () => {
  const queue = buildTodayPriorityQueueFromPortalData({
    now: '2026-05-29T13:00:00.000Z',
    businessNames: ['My Automation Partner'],
    inboxes: [{ id: 4, name: 'Social Inbox' }],
    conversations: [
      {
        id: 41,
        inbox_id: 4,
        status: 'open',
        last_activity_at: Math.floor(Date.parse('2026-05-29T14:59:00.000Z') / 1000),
        meta: { sender: { name: 'My Automation Partner' } },
        messages: [
          { content: 'Landed in both the portal inbox and the daily work queue. Works great!' },
          { content: 'System reopened the conversation due to a new incoming message.' },
        ],
      },
    ],
    commentBundles: [
      {
        post: {
          id: 'post-1',
          accountId: 'account-1',
          platform: 'facebook',
          content: 'We are refreshing My Automation Partner for small business owners.',
        },
        comments: [
          {
            id: 'fb-comment-1',
            authorName: 'Kenny Monico',
            text: 'Landed in both the portal inbox and the daily work queue. Works great!',
            createdTime: '2026-05-29T14:59:00.000Z',
            replyCount: 0,
          },
        ],
      },
    ],
  })

  assert.deepEqual(queue.map((item) => item.id), ['comment:fb-comment-1'])
})

test('today queue state persists done and snoozed items onto live queue rows', () => {
  const queue = buildTodayPriorityQueue().slice(0, 2)
  const state = updateTodayQueueState(
    updateTodayQueueState({}, 'mary', 'done', { now: '2026-05-28T12:00:00.000Z' }),
    'approve',
    'snoozed',
    { now: '2026-05-28T12:00:00.000Z' },
  )
  const applied = applyTodayQueueState(queue, state)

  assert.equal(applied.find((item) => item.id === 'mary')?.completed, true)
  assert.equal(applied.find((item) => item.id === 'mary')?.priority, 'Done')
  assert.equal(applied.find((item) => item.id === 'approve')?.snoozed, true)
  assert.equal(applied.find((item) => item.id === 'approve')?.due, 'Later')
  assert.equal(state.items.mary.status, 'done')
  assert.equal(state.items.approve.status, 'snoozed')
})

test('today priority summary reflects active work before and after a UI-only completion', () => {
  const queue = buildTodayPriorityQueue()
  const initialSummary = summarizeTodayPriorityQueue(queue)

  assert.deepEqual(initialSummary, {
    needsHuman: '06',
    readyToApprove: '11',
    openContent: '04',
    publishRisks: '02',
    clearTime: '18m',
  })

  const completed = completeTodayQueueItem(queue, 'mary')
  const summary = summarizeTodayPriorityQueue(completed)

  assert.equal(completed.find((item) => item.id === 'mary')?.completed, true)
  assert.equal(completed.find((item) => item.id === 'mary')?.priority, 'Done')
  assert.deepEqual(summary, {
    needsHuman: '05',
    readyToApprove: '11',
    openContent: '04',
    publishRisks: '02',
    clearTime: '14m',
  })
})

test('today priority summary is computed from live queue rows', () => {
  const queue = [
    {
      id: 'inbox:41',
      priority: 'P0',
      source: 'Inbox',
      minutes: '8m',
      kind: 'Customer reply',
      tone: 'danger',
    },
    {
      id: 'draft:1',
      priority: 'P1',
      source: 'Posts',
      minutes: '3m',
      kind: 'Publisher approval',
      tone: 'warning',
    },
    {
      id: 'opportunity:2',
      priority: 'P3',
      source: 'Idea',
      minutes: '4m',
      kind: 'Weekly idea',
      tone: 'success',
    },
    {
      id: 'post:3',
      priority: 'P2',
      source: 'Posts',
      minutes: '2m',
      kind: 'Scheduled post',
      tone: 'info',
      completed: true,
    },
  ]

  assert.deepEqual(summarizeTodayPriorityQueue(queue), {
    needsHuman: '01',
    readyToApprove: '02',
    openContent: '02',
    publishRisks: '00',
    clearTime: '15m',
  })
})

test('today priority filters reduce the queue to actionable groups', () => {
  const queue = [
    {
      id: 'inbox:41',
      priority: 'P0',
      source: 'Inbox',
      kind: 'Customer reply',
      tone: 'danger',
    },
    {
      id: 'draft:1',
      priority: 'P1',
      source: 'Posts',
      kind: 'Publisher approval',
      tone: 'warning',
    },
    {
      id: 'post:3',
      priority: 'P2',
      source: 'Posts',
      kind: 'Scheduled post',
      tone: 'info',
    },
    {
      id: 'failed:4',
      priority: 'P0',
      source: 'System',
      kind: 'Publish risk',
      title: 'Fix failed Instagram publish',
      tone: 'danger',
    },
    {
      id: 'done:5',
      priority: 'Done',
      source: 'Automation',
      kind: 'Completed',
      completed: true,
    },
  ]

  assert.deepEqual(filterTodayPriorityQueue(queue, 'priority').map((item) => item.id), [
    'inbox:41',
    'draft:1',
    'post:3',
    'failed:4',
  ])
  assert.deepEqual(filterTodayPriorityQueue(queue, 'needs').map((item) => item.id), ['inbox:41', 'draft:1', 'failed:4'])
  assert.deepEqual(filterTodayPriorityQueue(queue, 'ready').map((item) => item.id), ['draft:1', 'post:3'])
  assert.deepEqual(filterTodayPriorityQueue(queue, 'risks').map((item) => item.id), ['failed:4'])
})

test('today priority view hides work after it is marked done', () => {
  const queue = completeTodayQueueItem([
    {
      id: 'inbox:41',
      priority: 'P0',
      source: 'Inbox',
      kind: 'Customer reply',
      tone: 'danger',
    },
    {
      id: 'draft:1',
      priority: 'P1',
      source: 'Posts',
      kind: 'Publisher approval',
      tone: 'warning',
    },
  ], 'inbox:41')

  assert.deepEqual(filterTodayPriorityQueue(queue, 'priority').map((item) => item.id), ['draft:1'])
  assert.deepEqual(filterTodayPriorityQueue(queue, 'needs').map((item) => item.id), ['draft:1'])
})
