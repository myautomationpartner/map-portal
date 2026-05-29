import { commentNeedsReply, selectPrivateMessageConversations } from './inboxClassification.js'

const BASE_SUMMARY = {
  needsHuman: 6,
  readyToApprove: 11,
  openContent: 4,
  publishRisks: 2,
  clearTimeMinutes: 18,
}

const TODAY_QUEUE_ITEMS = [
  {
    id: 'mary',
    priority: 'P0',
    minutes: '8m',
    title: 'Reply to Mary Johnson',
    description: 'Beginner class question',
    source: 'Inbox',
    sourceDetail: 'Website',
    due: 'Now',
    actionLabel: 'Reply',
    targetHref: '/inbox?section=messages&partner=1',
    kind: 'Customer reply',
    tone: 'danger',
    confidence: '92%',
    steps: '3',
    risk: 'Low',
    why: 'Mary asks whether beginner classes are safe for a nervous seven-year-old. The answer should be warm, direct, and include the next available trial option.',
    suggestedAction: 'Send a warm, reassuring reply and offer the next trial class time. Keep it short and clear.',
    chips: ['Lead likely', 'Inbox', 'Trial class', 'Reply tone: warm'],
    trace: ['Reply sent to Mary Johnson', 'Conversation updated', 'Marked as complete'],
  },
  {
    id: 'approve',
    priority: 'P1',
    minutes: '3m',
    title: 'Approve Saturday post',
    description: 'Recital behind-the-scenes recap',
    source: 'Posts',
    sourceDetail: 'Publisher',
    due: 'Today',
    actionLabel: 'Approve',
    targetHref: '/calendar?view=approval',
    kind: 'Publisher approval',
    tone: 'warning',
    confidence: '89%',
    steps: '2',
    risk: 'Low',
    why: 'A recital behind-the-scenes post is drafted for Saturday morning. Media is attached and the caption is ready for owner approval before scheduling.',
    suggestedAction: 'Approve as written and schedule it for Saturday 9:10 AM on Facebook and Instagram.',
    chips: ['Publisher', 'Media attached', 'Facebook', 'Instagram'],
    trace: ['Post approved', 'Scheduled for Saturday 9:10 AM', 'Calendar updated'],
  },
  {
    id: 'campaign',
    priority: 'P1',
    minutes: '9m',
    title: 'Schedule summer campaign',
    description: 'Five-post plan is ready',
    source: 'Campaign',
    sourceDetail: 'Launch',
    due: '4:00 PM',
    actionLabel: 'Schedule',
    targetHref: '/campaigns',
    kind: 'Campaign plan',
    tone: 'warning',
    confidence: '86%',
    steps: '3',
    risk: 'Medium',
    why: 'Campaign Partner generated a five-post summer launch plan. Three posts are ready and two need image choices.',
    suggestedAction: "Place the launch post into Tuesday's open slot, then schedule the parent FAQ two days later.",
    chips: ['Campaign Partner', '5 posts', 'Open slots'],
    trace: ['Launch post scheduled', 'FAQ post queued', 'Campaign status updated'],
  },
  {
    id: 'failed',
    priority: 'P0',
    minutes: '6m',
    title: 'Fix failed Instagram publish',
    description: 'Partial publish. Do not duplicate',
    source: 'System',
    sourceDetail: 'Zernio',
    due: 'Now',
    actionLabel: 'Fix',
    targetHref: '/settings',
    kind: 'Publish risk',
    tone: 'danger',
    confidence: '94%',
    steps: '3',
    risk: 'Low',
    why: 'A scheduled Instagram variant did not publish because the connected account needs attention. Facebook succeeded.',
    suggestedAction: 'Leave Facebook posted, reconnect Instagram, then retry only the failed platform variant.',
    chips: ['No duplicate', 'Instagram', 'Reconnect', 'Retry'],
    trace: ['Facebook post confirmed published', 'Instagram account reconnected', 'Instagram variant retry successful'],
  },
  {
    id: 'file',
    priority: 'P2',
    minutes: '7m',
    title: 'Use new screenshot folder',
    description: '30 screenshots available',
    source: 'Files',
    sourceDetail: 'Vault',
    due: 'Fri',
    actionLabel: 'Tag',
    targetHref: '/documents',
    kind: 'File to content',
    tone: 'info',
    confidence: '81%',
    steps: '3',
    risk: 'Low',
    why: 'A folder of current product screenshots was uploaded and can support product launch assets.',
    suggestedAction: 'Tag the strongest desktop and mobile screenshots, then attach them to the product launch campaign.',
    chips: ['Files', 'Campaign assets', 'Screenshots'],
    trace: ['Screenshots tagged', 'Campaign asset folder linked', 'Drafts refreshed'],
  },
  {
    id: 'alex',
    priority: 'P2',
    minutes: '5m',
    title: 'Answer Alex reschedule request',
    description: 'Customer asks about a makeup slot',
    source: 'Inbox',
    sourceDetail: 'Email',
    due: 'Today',
    actionLabel: 'Reply',
    targetHref: '/inbox?section=messages',
    kind: 'Customer reply',
    tone: 'info',
    confidence: '88%',
    steps: '2',
    risk: 'Low',
    why: 'Alex asked for a makeup slot and the calendar has two available options this week.',
    suggestedAction: 'Offer the Thursday 4:30 PM slot first, then Friday 10:00 AM as backup.',
    chips: ['Inbox', 'Calendar', 'Reply tone: helpful'],
    trace: ['Reply drafted', 'Calendar options attached', 'Conversation updated'],
  },
  {
    id: 'review',
    priority: 'P2',
    minutes: '4m',
    title: 'Respond to new Google review',
    description: 'Five-star review mentions recital',
    source: 'Reviews',
    sourceDetail: 'Google',
    due: 'Today',
    actionLabel: 'Reply',
    targetHref: '/inbox?section=reviews',
    kind: 'Review response',
    tone: 'info',
    confidence: '84%',
    steps: '2',
    risk: 'Low',
    why: 'A positive review is fresh and visible. A short owner reply helps reinforce reputation.',
    suggestedAction: 'Post a warm thank-you that mentions the recital without adding a promotion.',
    chips: ['Review', 'Google', 'Reputation'],
    trace: ['Reply posted', 'Review marked handled'],
  },
  {
    id: 'ideas',
    priority: 'P3',
    minutes: '4m',
    title: 'Draft open-day post',
    description: 'Open calendar day with details',
    source: 'Idea',
    sourceDetail: 'Partner',
    due: 'Thu',
    actionLabel: 'Draft',
    targetHref: '/post',
    kind: 'Partner idea',
    tone: 'success',
    confidence: '78%',
    steps: '2',
    risk: 'Low',
    why: 'Thursday has no scheduled post and recent customer questions point to a useful trial-class FAQ angle.',
    suggestedAction: 'Create a short trial-class FAQ post and schedule it for Thursday afternoon. Use a direct answer, not a promotional caption.',
    chips: ['Open day', 'Partner idea', 'FAQ'],
    trace: ['Draft created', 'Open Thursday slot selected', 'Post awaits approval'],
  },
  {
    id: 'weekly',
    priority: 'P3',
    minutes: '6m',
    title: 'Review weekly post ideas',
    description: 'Three AI-suggested posts are ready',
    source: 'Partner',
    sourceDetail: 'Ideas',
    due: 'Fri',
    actionLabel: 'Review',
    targetHref: '/calendar?view=suggested',
    kind: 'Weekly ideas',
    tone: 'success',
    confidence: '80%',
    steps: '3',
    risk: 'Low',
    why: 'The weekly suggestion cycle produced three post ideas from recent customer questions and campaign gaps.',
    suggestedAction: 'Approve the trial-class FAQ idea, hold the recital recap, and reject the generic reminder.',
    chips: ['Weekly ideas', 'AI suggestions', 'Content calendar'],
    trace: ['FAQ idea approved', 'Recital recap held', 'Generic reminder rejected'],
  },
  {
    id: 'done',
    priority: 'Done',
    minutes: '2m',
    title: 'Welcome email to new lead',
    description: 'Sent and opened',
    source: 'Automation',
    sourceDetail: 'Email',
    due: '-',
    actionLabel: 'Done',
    targetHref: '/',
    kind: 'Completed',
    tone: 'success',
    confidence: '100%',
    steps: '0',
    risk: 'None',
    why: 'The welcome email already sent and was opened by the new lead.',
    suggestedAction: 'No action needed.',
    chips: ['Done', 'Automation', 'Email'],
    trace: ['Email sent', 'Opened by lead'],
    completed: true,
  },
]

function formatCount(value) {
  return String(Math.max(0, value)).padStart(2, '0')
}

function parseMinutes(value) {
  const minutes = Number(String(value || '').match(/\d+/)?.[0] || 0)
  return Number.isFinite(minutes) ? minutes : 0
}

function plainText(value, fallback = '') {
  return String(value || '').replace(/\s+/g, ' ').trim() || fallback
}

function truncate(value, max = 92) {
  const text = plainText(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}…`
}

function titleCase(value) {
  return plainText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function platformLabel(platform) {
  const label = titleCase(platform)
  return label || 'Social'
}

function formatMinutesFromTimestamp(value) {
  const timestamp = Number(value || 0)
  if (!timestamp) return '5m'
  const ageMinutes = Math.max(1, Math.round((Date.now() - timestamp * 1000) / 60000))
  return `${Math.min(ageMinutes, 99)}m`
}

function formatDue(value, fallback = 'Today') {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return fallback
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function parseTime(value) {
  const time = Date.parse(value || '')
  return Number.isFinite(time) ? time : 0
}

function startOfLocalDay(value) {
  const date = new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return startOfLocalDay(Date.now())
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function endOfLocalDay(value) {
  return startOfLocalDay(value) + 24 * 60 * 60 * 1000
}

function isTodayTime(value, options = {}) {
  const time = parseTime(value)
  if (!time) return false
  const todayStart = startOfLocalDay(options.now)
  return time >= todayStart && time < endOfLocalDay(options.now)
}

function isTodayDate(value, options = {}) {
  if (!value) return false
  return startOfLocalDay(value) === startOfLocalDay(options.now)
}

function draftTouchedTime(draft) {
  return parseTime(draft?.updated_at) || parseTime(draft?.created_at)
}

function conversationTitle(conversation) {
  const sender = conversation?.meta?.sender || {}
  return plainText(sender.name || sender.email || sender.phone_number, `Conversation #${conversation?.id}`)
}

function conversationPreview(conversation) {
  const message = [...(conversation?.messages || [])].reverse().find((entry) => entry?.content)
  return truncate(message?.content || conversation?.additional_attributes?.browser?.device_name || 'Open customer conversation.')
}

function commentAuthor(comment, platform) {
  return plainText(comment?.authorName || comment?.from?.name || comment?.author?.name, `${platformLabel(platform)} commenter`)
}

function commentText(comment) {
  return truncate(comment?.text || comment?.message || comment?.content || 'Open public comment.')
}

function commentTime(comment, post) {
  return comment?.createdTime || comment?.created_at || comment?.timestamp || post?.createdTime || post?.created_at
}

function isVisibleDraft(draft, options = {}) {
  const state = String(draft?.review_state || '').trim().toLowerCase()
  if (['published', 'published_manually', 'archived', 'superseded'].includes(state)) return false

  if (draft?.scheduled_for) return isTodayTime(draft.scheduled_for, options)
  if (draft?.slot_date_local) return isTodayDate(`${draft.slot_date_local}T12:00:00`, options)

  const touchedTime = draftTouchedTime(draft)
  return touchedTime >= startOfLocalDay(options.now) && touchedTime < endOfLocalDay(options.now)
}

function isVisibleSuggestion(suggestion) {
  const state = String(suggestion?.review_state || '').trim().toLowerCase()
  return !['archived', 'dismissed', 'converted_to_draft'].includes(state) && !suggestion?.converted_draft_id
}

function buildInboxItems(conversations = []) {
  return selectPrivateMessageConversations(conversations)
    .filter((conversation) => conversation?.status !== 'resolved')
    .slice(0, 3)
    .map((conversation) => {
      const title = conversationTitle(conversation)
      return {
        id: `inbox:${conversation.id}`,
        priority: 'P0',
        minutes: formatMinutesFromTimestamp(conversation.last_activity_at),
        title: `Reply to ${title}`,
        description: conversationPreview(conversation),
        source: 'Inbox',
        sourceDetail: 'Customer',
        due: 'Now',
        actionLabel: 'Reply',
        targetHref: `/inbox?section=messages&conversation=${encodeURIComponent(conversation.id)}`,
        kind: 'Customer reply',
        tone: 'danger',
        confidence: 'Live',
        steps: '2',
        risk: 'Low',
        why: `${title} has an open customer conversation that may need a response.`,
        suggestedAction: 'Open the Inbox thread, review the context, and reply or ask My Partner for help.',
        chips: ['Inbox', 'Customer reply', 'Live'],
        trace: ['Opened from Chatwoot conversation queue'],
      }
    })
}

function buildCommentItems(commentBundles = []) {
  const items = []

  for (const bundle of commentBundles) {
    const post = bundle?.post || {}
    const comments = Array.isArray(bundle?.comments) ? bundle.comments : []
    const platform = platformLabel(post.platform)
    const postKey = `${post.accountId || ''}:${post.id || ''}`
    const openHref = `/inbox?section=comments&post=${encodeURIComponent(postKey)}`

    comments
      .filter(commentNeedsReply)
      .sort((a, b) => parseTime(commentTime(b, post)) - parseTime(commentTime(a, post)))
      .forEach((comment) => {
        const author = commentAuthor(comment, post.platform)
        const fallbackId = `${postKey || 'post'}:${items.length}`

        items.push({
          id: `comment:${comment.id || fallbackId}`,
          priority: 'P0',
          minutes: formatMinutesFromTimestamp(Math.floor(parseTime(commentTime(comment, post)) / 1000)),
          title: `Reply to ${author}`,
          description: commentText(comment),
          source: 'Inbox',
          sourceDetail: 'Comment',
          due: 'Now',
          actionLabel: 'Reply',
          targetHref: openHref,
          kind: 'Public comment',
          tone: 'danger',
          confidence: 'Live',
          steps: '2',
          risk: 'Low',
          why: `${author} left a public ${platform} comment that still needs a reply.`,
          suggestedAction: 'Open Comments, review the public thread, and reply from the comment panel.',
          chips: ['Inbox', 'Comment', platform],
          trace: ['Loaded from Zernio comments'],
        })
      })
  }

  return items.slice(0, 3)
}

function buildDraftItems(socialDrafts = [], options = {}) {
  return socialDrafts
    .filter((draft) => isVisibleDraft(draft, options))
    .slice(0, 5)
    .map((draft) => {
      const isCampaign = draft.source_workflow === 'campaign_partner'
      const isPartner = draft.source_workflow === 'chatwoot_content_partner'
      const title = plainText(draft.draft_title || draft.post_type, 'Saved Publisher draft')
      return {
        id: `draft:${draft.id}`,
        priority: isCampaign ? 'P1' : 'P2',
        minutes: isCampaign ? '9m' : '4m',
        title: `${draft.scheduled_for ? 'Schedule' : 'Approve'} ${title}`,
        description: truncate(draft.draft_caption || draft.draft_body || draft.review_state || 'Draft needs review'),
        source: isCampaign ? 'Campaign' : isPartner ? 'Partner' : 'Posts',
        sourceDetail: isCampaign ? 'Launch' : isPartner ? 'My Partner' : 'Publisher',
        due: formatDue(draft.scheduled_for || draft.slot_date_local, draft.slot_start_local || 'Today'),
        actionLabel: draft.scheduled_for ? 'Schedule' : 'Approve',
        targetHref: `/post?draftId=${encodeURIComponent(draft.id)}`,
        kind: isCampaign ? 'Campaign draft' : 'Publisher approval',
        tone: isCampaign ? 'warning' : 'info',
        confidence: 'Live',
        steps: '2',
        risk: 'Low',
        why: `${title} is saved in Publisher and is waiting for owner review before it becomes scheduled content.`,
        suggestedAction: 'Open the draft in Publisher, review the caption and media, then schedule or publish from there.',
        chips: [isCampaign ? 'Campaign Partner' : 'Publisher', draft.review_state || 'Draft', 'Needs review'],
        trace: ['Loaded from social_drafts'],
      }
    })
}

function buildScheduledPostItems(calendarPosts = [], options = {}) {
  return calendarPosts
    .filter((post) => post?.status === 'scheduled' && isTodayTime(post.scheduled_for, options))
    .slice(0, 3)
    .map((post) => ({
      id: `post:${post.id}`,
      priority: 'P2',
      minutes: '3m',
      title: 'Review scheduled post',
      description: truncate(post.content || 'Scheduled post is ready.'),
      source: 'Posts',
      sourceDetail: (post.platforms || []).slice(0, 2).map(titleCase).join(', ') || 'Publisher',
      due: formatDue(post.scheduled_for, 'Scheduled'),
      actionLabel: 'Review',
      targetHref: `/post?editPost=${encodeURIComponent(post.id)}`,
      kind: 'Scheduled post',
      tone: 'info',
      confidence: 'Live',
      steps: '1',
      risk: 'Low',
      why: 'This post is scheduled and can still be reviewed before publish time.',
      suggestedAction: 'Open the scheduled post in Publisher if you want to adjust timing, caption, or media.',
      chips: ['Scheduled', 'Publisher', 'Calendar'],
      trace: ['Loaded from posts'],
    }))
}

function buildOpportunityItems(opportunities = [], options = {}) {
  const items = []
  for (const opportunity of opportunities) {
    const suggestion = (opportunity.client_opportunity_suggestions || []).find(isVisibleSuggestion)
    if (!suggestion) continue
    const dueDate = suggestion.recommended_publish_at || opportunity.suggested_timing || opportunity.starts_at || opportunity.expires_at
    if (!isTodayTime(dueDate, options)) continue
    items.push({
      id: `opportunity:${suggestion.id}`,
      priority: Number(opportunity.urgency_score || 0) >= 80 ? 'P2' : 'P3',
      minutes: '4m',
      title: suggestion.title || opportunity.title || 'Review weekly post idea',
      description: truncate(suggestion.caption_starter || opportunity.summary || opportunity.why_it_matters || 'Partner suggestion is ready.'),
      source: 'Idea',
      sourceDetail: 'Partner',
      due: formatDue(dueDate, 'Today'),
      actionLabel: 'Draft',
      targetHref: '/calendar?view=suggested',
      kind: 'Weekly idea',
      tone: Number(opportunity.urgency_score || 0) >= 80 ? 'info' : 'success',
      confidence: opportunity.confidence_score ? `${opportunity.confidence_score}%` : 'Live',
      steps: '2',
      risk: 'Low',
      why: opportunity.why_it_matters || opportunity.local_context || 'My Partner found a relevant content opportunity from recent business context.',
      suggestedAction: 'Open Content Plan, turn the suggestion into a Publisher draft, then schedule it into an open day.',
      chips: ['Weekly ideas', 'AI suggestions', 'Content calendar'],
      trace: ['Loaded from Opportunity Radar'],
    })
    if (items.length >= 3) break
  }
  return items
}

function buildDocumentItems(documents = [], options = {}) {
  return documents
    .filter((document) => !document?.is_archived && isTodayTime(document?.updated_at || document?.created_at, options))
    .slice(0, 2)
    .map((document) => ({
      id: `file:${document.id}`,
      priority: 'P3',
      minutes: '3m',
      title: `Use ${plainText(document.file_name, 'new file')}`,
      description: document.category || 'New document is available',
      source: 'Files',
      sourceDetail: 'Documents',
      due: 'This week',
      actionLabel: 'Open',
      targetHref: `/documents?document=${encodeURIComponent(document.id)}`,
      kind: 'File to content',
      tone: 'success',
      confidence: 'Live',
      steps: '1',
      risk: 'Low',
      why: `${plainText(document.file_name, 'A recent file')} is available in Documents and may support current content or customer work.`,
      suggestedAction: 'Open the file, confirm whether it belongs in a campaign, and attach it where useful.',
      chips: ['Documents', 'Files', document.category || 'Asset'],
      trace: ['Loaded from secure_documents'],
    }))
}

export function buildTodayPriorityQueue() {
  return TODAY_QUEUE_ITEMS.map((item) => ({ ...item, chips: [...item.chips], trace: [...item.trace] }))
}

export function buildTodayPriorityQueueFromPortalData({
  now,
  conversations = [],
  commentBundles = [],
  socialDrafts = [],
  calendarPosts = [],
  opportunities = [],
  documents = [],
  fallbackQueue = buildTodayPriorityQueue(),
} = {}) {
  const liveItems = [
    ...buildInboxItems(conversations),
    ...buildCommentItems(commentBundles),
    ...buildDraftItems(socialDrafts, { now }),
    ...buildScheduledPostItems(calendarPosts, { now }),
    ...buildOpportunityItems(opportunities, { now }),
    ...buildDocumentItems(documents, { now }),
  ]

  const hasSourceData = [conversations, commentBundles, socialDrafts, calendarPosts, opportunities, documents]
    .some((source) => Array.isArray(source) && source.length > 0)
  if (!liveItems.length) return hasSourceData ? [] : fallbackQueue
  return liveItems.slice(0, 12)
}

export function completeTodayQueueItem(queue, itemId) {
  return queue.map((item) => (
    item.id === itemId
      ? {
          ...item,
          priority: 'Done',
          actionLabel: 'Done',
          tone: 'success',
          completed: true,
        }
      : item
  ))
}

export function normalizeTodayQueueState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { items: {} }
  const items = value.items && typeof value.items === 'object' && !Array.isArray(value.items) ? value.items : {}
  return { ...value, items }
}

export function updateTodayQueueState(state, itemId, status, options = {}) {
  const normalized = normalizeTodayQueueState(state)
  const now = options.now || new Date().toISOString()
  const items = { ...normalized.items }
  const previous = items[itemId] && typeof items[itemId] === 'object' ? items[itemId] : {}

  items[itemId] = {
    ...previous,
    status,
    updatedAt: now,
    ...(status === 'done' ? { completedAt: now } : {}),
    ...(status === 'snoozed' ? { snoozedAt: now, snoozedUntil: options.snoozedUntil || null } : {}),
  }

  return { ...normalized, items }
}

export function applyTodayQueueState(queue, state) {
  const items = normalizeTodayQueueState(state).items

  return queue.map((item) => {
    const itemState = items[item.id]
    if (!itemState || typeof itemState !== 'object') return item
    if (itemState.status === 'done') {
      return {
        ...item,
        priority: 'Done',
        actionLabel: 'Done',
        tone: 'success',
        completed: true,
        completedAt: itemState.completedAt || itemState.updatedAt || null,
      }
    }
    if (itemState.status === 'snoozed') {
      return {
        ...item,
        snoozed: true,
        snoozedUntil: itemState.snoozedUntil || null,
        due: 'Later',
      }
    }
    return item
  })
}

function isRiskItem(item) {
  return (
    item.kind === 'Publish risk' ||
    item.source === 'System' ||
    /publish|failed|risk|reconnect|duplicate/i.test(`${item.title || ''} ${item.description || ''}`)
  )
}

function isReadyItem(item) {
  const readyKinds = new Set(['Publisher approval', 'Campaign draft', 'Campaign plan', 'Partner idea', 'Weekly idea', 'Scheduled post'])
  const readySources = new Set(['Posts', 'Campaign', 'Idea', 'Partner'])
  return readyKinds.has(item.kind) || readySources.has(item.source)
}

function needsHumanItem(item) {
  const humanKinds = new Set(['Customer reply', 'Review response', 'Publisher approval', 'Campaign draft', 'Campaign plan'])
  return humanKinds.has(item.kind) || item.source === 'Inbox' || item.source === 'Reviews' || isRiskItem(item)
}

export function filterTodayPriorityQueue(queue, filter = 'priority') {
  if (filter === 'needs') return queue.filter((item) => !item.completed && !item.snoozed && needsHumanItem(item))
  if (filter === 'ready') return queue.filter((item) => !item.completed && !item.snoozed && isReadyItem(item) && !isRiskItem(item))
  if (filter === 'risks') return queue.filter((item) => !item.completed && !item.snoozed && isRiskItem(item))
  return queue.filter((item) => !item.completed && !item.snoozed)
}

export function summarizeTodayPriorityQueue(queue) {
  const isLiveQueue = queue.some((item) => String(item.id || '').includes(':'))
  if (isLiveQueue) {
    const active = queue.filter((item) => !item.completed && !item.snoozed)
    const contentSources = new Set(['Posts', 'Campaign', 'Idea', 'Partner'])
    const approvalKinds = new Set(['Publisher approval', 'Campaign draft', 'Campaign plan', 'Partner idea', 'Weekly idea'])
    const publishRiskItems = active.filter((item) => (
      item.kind === 'Publish risk' ||
      item.source === 'System' ||
      /publish|failed|risk|reconnect/i.test(`${item.title || ''} ${item.description || ''}`)
    ))

    return {
      needsHuman: formatCount(active.filter((item) => item.source === 'Inbox' || item.source === 'Reviews').length),
      readyToApprove: formatCount(active.filter((item) => approvalKinds.has(item.kind) || contentSources.has(item.source)).length),
      openContent: formatCount(active.filter((item) => contentSources.has(item.source)).length),
      publishRisks: formatCount(publishRiskItems.length),
      clearTime: `${active.reduce((total, item) => total + parseMinutes(item.minutes), 0)}m`,
    }
  }

  const completedIds = new Set(queue.filter((item) => item.completed).map((item) => item.id))

  return {
    needsHuman: formatCount(BASE_SUMMARY.needsHuman - (completedIds.has('mary') ? 1 : 0)),
    readyToApprove: formatCount(
      BASE_SUMMARY.readyToApprove -
      (completedIds.has('approve') ? 1 : 0) -
      (completedIds.has('campaign') ? 1 : 0) -
      (completedIds.has('ideas') ? 1 : 0),
    ),
    openContent: formatCount(BASE_SUMMARY.openContent),
    publishRisks: formatCount(BASE_SUMMARY.publishRisks - (completedIds.has('failed') ? 1 : 0)),
    clearTime: completedIds.size > 1 ? '14m' : '18m',
  }
}
