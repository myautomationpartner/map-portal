function firstString(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

export const NO_REPLY_NEEDED_STORAGE_KEY = 'map:inbox:no-reply-needed-comments:v1'
export const NO_REPLY_NEEDED_POST_STORAGE_KEY = 'map:inbox:no-reply-needed-comment-posts:v1'

function normalizeComparableName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function messageList(conversation) {
  return Array.isArray(conversation?.messages) ? conversation.messages : []
}

export function conversationTitle(conversation) {
  const sender = conversation?.meta?.sender || {}
  return firstString(
    sender.name,
    sender.email,
    sender.phone_number,
    conversation?.additional_attributes?.contact_name,
    conversation?.custom_attributes?.contact_name,
    `Conversation ${conversation?.id || ''}`,
  )
}

export function conversationPreview(conversation, fallback = 'No message preview yet.') {
  const lastMessage = [...messageList(conversation)].reverse().find((message) => message?.content)
  return firstString(lastMessage?.content, conversation?.additional_attributes?.browser?.device_name, fallback)
}

export function inboxName(conversation, inboxes = [], fallback = 'Direct message') {
  const id = conversation?.inbox_id || conversation?.inbox?.id
  const match = inboxes.find((inbox) => String(inbox.id) === String(id))
  return firstString(match?.name, conversation?.inbox?.name, fallback)
}

export function conversationSubtitle(conversation) {
  const sender = conversation?.meta?.sender || {}
  return firstString(sender.email, sender.phone_number, conversation?.channel, 'Customer')
}

function searchableConversationValues(conversation, inboxes = []) {
  return [
    conversationTitle(conversation),
    conversationPreview(conversation),
    conversationSubtitle(conversation),
    inboxName(conversation, inboxes),
    conversation?.channel,
  ]
}

export function conversationSearchText(conversation, inboxes = []) {
  return searchableConversationValues(conversation, inboxes)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function businessNameCandidates(input = {}) {
  const client = input?.clients || input?.client || input || {}
  return [
    client.business_name,
    client.display_name,
    client.name,
    client.slug,
    input?.displayName,
    input?.businessName,
  ]
    .map((value) => String(value || '').replace(/[_-]+/g, ' ').trim())
    .filter(Boolean)
}

export function isMyPartnerConversation(conversation) {
  const title = conversationTitle(conversation).trim().toLowerCase()
  const sender = conversation?.meta?.sender || {}
  const senderText = [
    sender.name,
    sender.email,
    sender.identifier,
    sender.additional_attributes?.identifier,
    conversation?.custom_attributes?.map_content_partner_conversation,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return title === 'my partner' || senderText.includes('map-content-partner')
}

function collectMarkerStrings(value, markerStrings, depth = 0) {
  if (value == null || depth > 4) return

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    markerStrings.push(String(value))
    return
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectMarkerStrings(entry, markerStrings, depth + 1))
    return
  }

  if (typeof value !== 'object') return

  Object.entries(value).forEach(([key, entry]) => {
    markerStrings.push(key)
    collectMarkerStrings(entry, markerStrings, depth + 1)
  })
}

function hasCommentMetadata(value) {
  const markerStrings = []
  collectMarkerStrings(value, markerStrings)
  const haystack = markerStrings.join(' ').toLowerCase()

  return [
    'zernio_event comment.received',
    'comment.received',
    'zernio_comment_id',
    'zernio_comment_post_id',
    'zernio_comments_poll',
    'facebook_comment',
    'instagram_comment',
    'public_comment',
    'comment_id',
    'commentid',
  ].some((marker) => haystack.includes(marker))
}

function isBusinessOwnedSocialConversation(conversation, inboxes = [], options = {}) {
  const inbox = inboxName(conversation, inboxes)
  const searchText = conversationSearchText(conversation, inboxes)
  const looksLikeSystemMirror = /\b(system reopened|conversation was marked resolved|assigned to admin by default policy)\b/.test(searchText)
  if (!/\bsocial\b/i.test(inbox) && !looksLikeSystemMirror) return false

  const title = normalizeComparableName(conversationTitle(conversation))
  if (!title) return false

  const businessNames = Array.isArray(options?.businessNames) ? options.businessNames : []
  return businessNames
    .map(normalizeComparableName)
    .filter((name) => name.length >= 4)
    .some((name) => title === name || title.includes(name) || name.includes(title))
}

export function isPublicCommentConversation(conversation, inboxes = [], options = {}) {
  if (hasCommentMetadata({
    additional_attributes: conversation?.additional_attributes,
    custom_attributes: conversation?.custom_attributes,
    meta: conversation?.meta,
    messages: messageList(conversation).map((message) => ({
      source_id: message?.source_id,
      content_attributes: message?.content_attributes,
      additional_attributes: message?.additional_attributes,
    })),
  })) {
    return true
  }

  if (isBusinessOwnedSocialConversation(conversation, inboxes, options)) return true

  return /\b(comment|comments|commenter|commented)\b/.test(conversationSearchText(conversation, inboxes))
}

export function isPrivateMessageConversation(conversation, inboxes = [], options = {}) {
  return !isMyPartnerConversation(conversation) && !isPublicCommentConversation(conversation, inboxes, options)
}

function toTimestamp(value) {
  const numeric = Number(value || 0)
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1000000000000 ? Math.round(numeric / 1000) : numeric
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? Math.round(parsed / 1000) : 0
}

function conversationSignature(conversation, inboxes = []) {
  return [
    conversationTitle(conversation).toLowerCase(),
    conversationPreview(conversation).toLowerCase(),
    inboxName(conversation, inboxes).toLowerCase(),
    String(conversation?.status || '').toLowerCase(),
  ].join('|')
}

export function selectPrivateMessageConversations(conversations = [], inboxes = [], options = {}) {
  const selected = []
  const seen = new Map()

  conversations
    .filter((conversation) => isPrivateMessageConversation(conversation, inboxes, options))
    .forEach((conversation) => {
      const signature = conversationSignature(conversation, inboxes)
      const activity = toTimestamp(conversation?.last_activity_at || conversation?.updated_at)
      const previous = seen.get(signature)
      if (previous && Math.abs(previous.activity - activity) <= 10 * 60) return

      seen.set(signature, { activity })
      selected.push(conversation)
    })

  return selected
}

export const STALE_SOCIAL_PRAISE_AFTER_MS = 14 * 24 * 60 * 60 * 1000
export const INBOX_SYNC_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

const SOCIAL_PRAISE_RE = /\b(congratulat(?:ions|ion)?|congrats|so proud(?: of (?:you|her|him|them))?|love this|love it|love these|so cute|so pretty|so beautiful|beautiful|gorgeous|amazing|awesome|wonderful|fantastic|well done|way to go|you (?:go|guys)? rock|looks? (?:great|amazing|beautiful|perfect)|stunning|adorable|precious|perfect)\b|[🎉🎊🥳❤️❤💕💖👏🙌✨]/iu
const ACTION_QUESTION_RE = /\?|\b(?:who|what|when|where|why|how|which|can you|could you|would you|will you|do you|does|did you|is there|are there|any (?:info|details|spots|openings|room)|please (?:send|share|tell|help|call|dm|message)|need(?:s)? (?:info|help|details))\b/i

export function commentCreatedAtMs(comment) {
  const raw = comment?.createdTime || comment?.created_at || comment?.createdAt || comment?.timestamp || comment?.date
  if (raw == null || raw === '') return 0
  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1000000000000 ? Math.round(numeric) : Math.round(numeric * 1000)
  }
  const parsed = Date.parse(String(raw))
  return Number.isFinite(parsed) ? parsed : 0
}

export function commentText(comment) {
  return firstString(comment?.text, comment?.content, comment?.message, comment?.body)
}

export function isNonQuestionSocialPraise(text) {
  const normalized = String(text || '').trim()
  if (!normalized) return false
  if (ACTION_QUESTION_RE.test(normalized)) return false
  return SOCIAL_PRAISE_RE.test(normalized)
}

export function isStaleSocialPraiseComment(comment, now = Date.now()) {
  if (!isNonQuestionSocialPraise(commentText(comment))) return false
  const created = commentCreatedAtMs(comment)
  if (!created) return true
  return now - created >= STALE_SOCIAL_PRAISE_AFTER_MS
}

export function commentNeedsReply(comment, now = Date.now()) {
  if (comment?.noReplyNeeded === true || comment?.canReply === false || Number(comment?.replyCount || 0) !== 0) {
    return false
  }
  if (isStaleSocialPraiseComment(comment, now)) return false
  return true
}

export function formatInboxSyncTimestamp(ms) {
  const date = new Date(Number(ms) || 0)
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isFacebookPlatform(value) {
  return String(value || '').toLowerCase().includes('facebook')
}

export function resolveInboxSyncState({
  commentPosts = [],
  commentBundles = [],
  conversations = [],
  commentsFetchOk = null,
  now = Date.now(),
} = {}) {
  const facebookTimes = []
  const commentTimes = []

  commentPosts.forEach((post) => {
    const created = commentCreatedAtMs(post)
    if (!created) return
    commentTimes.push(created)
    if (isFacebookPlatform(post?.platform)) facebookTimes.push(created)
  })

  commentBundles.forEach((bundle) => {
    const postPlatform = bundle?.post?.platform
    if (isFacebookPlatform(postPlatform)) {
      const postCreated = commentCreatedAtMs(bundle.post)
      if (postCreated) facebookTimes.push(postCreated)
    }
    ;(Array.isArray(bundle?.comments) ? bundle.comments : []).forEach((comment) => {
      const created = commentCreatedAtMs(comment)
      if (!created) return
      commentTimes.push(created)
      if (isFacebookPlatform(comment?.platform) || isFacebookPlatform(postPlatform)) {
        facebookTimes.push(created)
      }
    })
  })

  const conversationTimes = conversations
    .map((conversation) => toTimestamp(conversation?.last_activity_at || conversation?.updated_at) * 1000)
    .filter((ms) => ms > 0)

  const facebookCommentsLastSyncedAt = facebookTimes.length ? Math.max(...facebookTimes) : 0
  const commentsLastSyncedAt = commentTimes.length ? Math.max(...commentTimes) : facebookCommentsLastSyncedAt
  const messagesLastActivityAt = conversationTimes.length ? Math.max(...conversationTimes) : 0
  const commentsStale = commentsLastSyncedAt > 0 && now - commentsLastSyncedAt >= INBOX_SYNC_STALE_AFTER_MS
  const sourceMs = facebookCommentsLastSyncedAt || commentsLastSyncedAt
  const dateLabel = formatInboxSyncTimestamp(sourceMs)
  let label = 'Comment sync time unavailable'
  if (commentsFetchOk === false) {
    label = facebookCommentsLastSyncedAt || commentsLastSyncedAt
      ? `Facebook comments could not be refreshed`
      : 'Facebook comments could not be refreshed'
  } else if (facebookCommentsLastSyncedAt && dateLabel) {
    // Zernio comments are a live pull. An old newest comment is not a stalled ingest.
    label = `Newest Facebook comment ${dateLabel}`
  } else if (commentsLastSyncedAt && dateLabel) {
    label = `Newest comment ${dateLabel}`
  } else if (commentsFetchOk === true) {
    label = 'Facebook comments are live'
  }

  return {
    facebookCommentsLastSyncedAt,
    commentsLastSyncedAt,
    messagesLastActivityAt,
    commentsStale,
    label,
  }
}

export function normalizeDismissalKeySet(keys) {
  if (keys instanceof Set) return new Set([...keys].filter(Boolean))
  if (Array.isArray(keys)) return new Set(keys.filter(Boolean))
  return new Set()
}

function readDismissalKeySet(storageKey) {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    return normalizeDismissalKeySet(stored)
  } catch {
    return new Set()
  }
}

function writeDismissalKeySet(storageKey, keys) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey, JSON.stringify([...normalizeDismissalKeySet(keys)]))
}

export function readNoReplyNeededCommentKeys() {
  return readDismissalKeySet(NO_REPLY_NEEDED_STORAGE_KEY)
}

export function writeNoReplyNeededCommentKeys(keys) {
  writeDismissalKeySet(NO_REPLY_NEEDED_STORAGE_KEY, keys)
}

export function readNoReplyNeededPostKeys() {
  return readDismissalKeySet(NO_REPLY_NEEDED_POST_STORAGE_KEY)
}

export function writeNoReplyNeededPostKeys(keys) {
  writeDismissalKeySet(NO_REPLY_NEEDED_POST_STORAGE_KEY, keys)
}

export function postKey(post) {
  return `${post?.accountId || ''}:${post?.id || ''}`
}

export function postDismissalKey(post) {
  return postKey(post)
}

export function commentDismissalKey(post, comment) {
  const accountId = post?.accountId || 'account'
  const postId = post?.id || 'post'
  const commentId = comment?.id || comment?.commentId || comment?.createdTime || comment?.text || 'comment'
  return `${accountId}:${postId}:${commentId}`
}

export function withCommentDismissals(bundle, dismissedCommentKeys) {
  const dismissalKeys = normalizeDismissalKeySet(dismissedCommentKeys)
  return {
    ...bundle,
    comments: (Array.isArray(bundle?.comments) ? bundle.comments : []).map((comment) => ({
      ...comment,
      noReplyNeeded: dismissalKeys.has(commentDismissalKey(bundle.post, comment)),
    })),
  }
}

export function applyCommentBundleDismissals(commentBundles = [], dismissedCommentKeys, dismissedPostKeys) {
  const postDismissals = normalizeDismissalKeySet(dismissedPostKeys)
  return commentBundles
    .map((bundle) => withCommentDismissals(bundle, dismissedCommentKeys))
    .filter((bundle) => !postDismissals.has(postDismissalKey(bundle.post)))
}

export function countCommentsNeedingReply(comments = [], now = Date.now()) {
  return comments.filter((comment) => commentNeedsReply(comment, now)).length
}

export function countCommentBundlesNeedingReply(commentBundles = [], now = Date.now()) {
  return commentBundles.reduce((total, bundle) => (
    total + countCommentsNeedingReply(Array.isArray(bundle?.comments) ? bundle.comments : [], now)
  ), 0)
}

export function countCommentPostsNeedingReply(commentBundles = [], now = Date.now()) {
  return commentBundles.filter((bundle) => (
    countCommentsNeedingReply(Array.isArray(bundle?.comments) ? bundle.comments : [], now) > 0
  )).length
}

export function countPrivateMessagesNeedingReply(privateConversations = []) {
  return privateConversations.filter((conversation) => String(conversation?.status || 'open').toLowerCase() === 'open').length
}

export function summarizeInboxNotifications({ privateConversations = [], commentBundles = [], now = Date.now() } = {}) {
  const messages = countPrivateMessagesNeedingReply(privateConversations)
  const comments = countCommentPostsNeedingReply(commentBundles, now)
  return {
    messages,
    comments,
    total: messages + comments,
  }
}
