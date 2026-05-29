function firstString(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
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

export function isPublicCommentConversation(conversation, inboxes = []) {
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

  return /\b(comment|comments|commenter|commented)\b/.test(conversationSearchText(conversation, inboxes))
}

export function isPrivateMessageConversation(conversation, inboxes = []) {
  return !isMyPartnerConversation(conversation) && !isPublicCommentConversation(conversation, inboxes)
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

export function selectPrivateMessageConversations(conversations = [], inboxes = []) {
  const selected = []
  const seen = new Map()

  conversations
    .filter((conversation) => isPrivateMessageConversation(conversation, inboxes))
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
  return comment?.canReply !== false && Number(comment?.replyCount || 0) === 0
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
