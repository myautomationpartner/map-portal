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

export function commentNeedsReply(comment) {
  return comment?.noReplyNeeded !== true && comment?.canReply !== false && Number(comment?.replyCount || 0) === 0
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

export function countCommentsNeedingReply(comments = []) {
  return comments.filter(commentNeedsReply).length
}

export function countCommentBundlesNeedingReply(commentBundles = []) {
  return commentBundles.reduce((total, bundle) => (
    total + countCommentsNeedingReply(Array.isArray(bundle?.comments) ? bundle.comments : [])
  ), 0)
}

export function countPrivateMessagesNeedingReply(privateConversations = []) {
  return privateConversations.filter((conversation) => ['open', 'pending'].includes(String(conversation?.status || 'open').toLowerCase())).length
}

export function summarizeInboxNotifications({ privateConversations = [], commentBundles = [] } = {}) {
  const messages = countPrivateMessagesNeedingReply(privateConversations)
  const comments = countCommentBundlesNeedingReply(commentBundles)
  return {
    messages,
    comments,
    total: messages + comments,
  }
}
