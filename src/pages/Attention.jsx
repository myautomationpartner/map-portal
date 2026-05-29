import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Edit3,
  Inbox,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { portalPath } from '../lib/portalPath'
import { fetchScheduledPosts, fetchSocialDrafts } from '../lib/portalApi'
import { splitMessageLinks } from '../lib/messageLinks'
import { canHideInboxThread } from '../lib/inboxThreadActions'
import { getOpenReviewDrafts, getPartnerHelpOptions, resolvePartnerHelpHref, selectNextReviewDraft } from '../lib/partnerHelpMenu'
import {
  businessNameCandidates,
  commentNeedsReply,
  selectPrivateMessageConversations,
} from '../lib/inboxClassification'

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  { value: 'comments', label: 'Comments' },
  { value: 'dms', label: 'DMs' },
  { value: 'partner', label: 'My Partner' },
]

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in again to use Inbox.')
  return token
}

async function portalFetch(path, options = {}) {
  const token = await getAccessToken()
  const response = await fetch(portalPath(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || `Inbox request failed (${response.status}).`)
  }
  return payload
}

function chatwootPortalFetch(path, options = {}) {
  return portalFetch(`/api/chatwoot/${path.replace(/^\/+/, '')}`, options)
}

function zernioPortalFetch(path, options = {}) {
  return portalFetch(`/api/zernio/${path.replace(/^\/+/, '')}`, options)
}

async function fetchInboxes() {
  const payload = await chatwootPortalFetch('/inboxes')
  return Array.isArray(payload?.payload) ? payload.payload : []
}

function normalizeConversationResponse(payload) {
  const data = payload?.data || payload || {}
  return Array.isArray(data.payload) ? data.payload : Array.isArray(payload?.payload) ? payload.payload : []
}

async function fetchConversationsForStatus(status) {
  const params = new URLSearchParams({
    status,
    assignee_type: 'all',
    page: '1',
  })
  const payload = await chatwootPortalFetch(`/conversations?${params.toString()}`)
  return normalizeConversationResponse(payload)
}

async function fetchAttentionConversations() {
  const results = await Promise.allSettled([
    fetchConversationsForStatus('open'),
    fetchConversationsForStatus('pending'),
  ])

  const byId = new Map()
  results.forEach((result) => {
    if (result.status !== 'fulfilled') return
    result.value.forEach((conversation) => {
      if (conversation?.id) byId.set(String(conversation.id), conversation)
    })
  })
  return [...byId.values()]
}

async function fetchMessages({ queryKey }) {
  const [, conversationId] = queryKey
  if (!conversationId) return []
  const payload = await chatwootPortalFetch(`/conversations/${conversationId}/messages`)
  if (Array.isArray(payload?.payload)) return payload.payload
  if (Array.isArray(payload)) return payload
  return []
}

function sendDmReply({ conversationId, content }) {
  return chatwootPortalFetch(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, private: false }),
  })
}

function markConversationHandled(conversationId) {
  return chatwootPortalFetch(`/conversations/${conversationId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'resolved' }),
  })
}

function openContentPartnerConversation() {
  return portalFetch('/api/content-partner/conversation', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

function fetchCommentPosts() {
  const params = new URLSearchParams({ limit: '30', minComments: '1' })
  return zernioPortalFetch(`/comments?${params.toString()}`)
}

function fetchPostComments(post) {
  if (!post?.id || !post?.accountId) return Promise.resolve({ comments: [] })
  const params = new URLSearchParams({ accountId: post.accountId })
  return zernioPortalFetch(`/comments/${encodeURIComponent(post.id)}?${params.toString()}`)
}

async function fetchCommentBundles(posts) {
  const targets = posts.slice(0, 12)
  const results = await Promise.allSettled(targets.map((post) => fetchPostComments(post)))
  return targets.map((post, index) => ({
    post,
    comments: results[index]?.status === 'fulfilled' && Array.isArray(results[index].value?.comments)
      ? results[index].value.comments
      : [],
    error: results[index]?.status === 'rejected' ? results[index].reason?.message : '',
  }))
}

function sendCommentReply({ postId, accountId, commentId, message }) {
  return zernioPortalFetch(`/comments/${encodeURIComponent(postId)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ accountId, commentId, message }),
  })
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function toDate(value) {
  if (!value) return null
  if (typeof value === 'number') {
    const millis = value < 1000000000000 ? value * 1000 : value
    const date = new Date(millis)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric) && String(value).trim().length <= 13) {
    return toDate(numeric)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatRelativeTime(value) {
  const date = toDate(value)
  if (!date) return 'No activity'
  const diffSeconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSeconds < 60) return 'Just now'
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatDetailedTime(value) {
  const date = toDate(value)
  if (!date) return 'No date'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function conversationTitle(conversation) {
  return firstString(
    conversation?.meta?.sender?.name,
    conversation?.meta?.assignee?.name,
    conversation?.additional_attributes?.contact_name,
    conversation?.custom_attributes?.contact_name,
    `Conversation ${conversation?.id || ''}`,
  )
}

function conversationPreview(conversation) {
  const lastMessage = Array.isArray(conversation?.messages) ? conversation.messages.at(-1) : null
  return firstString(lastMessage?.content, conversation?.additional_attributes?.browser?.device_name, 'No message preview yet.')
}

function inboxName(conversation, inboxes) {
  const id = conversation?.inbox_id || conversation?.inbox?.id
  const match = inboxes.find((inbox) => String(inbox.id) === String(id))
  return firstString(match?.name, conversation?.inbox?.name, 'Direct message')
}

function isMyPartnerConversation(conversation) {
  const title = conversationTitle(conversation).trim().toLowerCase()
  const sender = conversation?.meta?.sender || {}
  const senderText = [
    sender.name,
    sender.email,
    sender.identifier,
    sender.additional_attributes?.identifier,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return title === 'my partner' || senderText.includes('map-content-partner')
}

function platformLabel(platform) {
  const normalized = String(platform || '').trim().toLowerCase()
  const labels = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    tiktok: 'TikTok',
    twitter: 'X',
  }
  return labels[normalized] || firstString(platform, 'Social')
}

function getCommentAuthor(comment, platform) {
  return firstString(comment?.authorName, `${platformLabel(platform)} commenter`)
}

function getCommentText(comment) {
  return firstString(comment?.text, comment?.content, comment?.message, '[No text]')
}

function getReplyText(reply) {
  return firstString(reply?.text, reply?.message, reply?.content, reply?.body)
}

function isOutgoingMessage(message) {
  return message?.message_type === 1 || message?.message_type === 'outgoing'
}

function messageContent(message) {
  return firstString(message?.content, '[Attachment or system message]')
}

function LinkedMessageText({ children }) {
  const parts = splitMessageLinks(children)
  return parts.map((part, index) => {
    if (part.type !== 'link') return <span key={`${part.type}-${index}`}>{part.value}</span>
    return (
      <a
        key={`${part.type}-${index}-${part.value}`}
        href={part.value}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
      >
        {part.value}
      </a>
    )
  })
}

function buildCommentThread(bundle) {
  const comments = Array.isArray(bundle.comments) ? bundle.comments : []
  const needs = comments.filter(commentNeedsReply)
  const latestComment = [...comments].sort((left, right) => {
    const leftTime = toDate(left.createdTime)?.getTime() || 0
    const rightTime = toDate(right.createdTime)?.getTime() || 0
    return rightTime - leftTime
  })[0]
  const target = needs[0] || latestComment || null
  const post = bundle.post

  return {
    id: `comments:${post.id}:${post.accountId}`,
    kind: 'comments',
    title: firstString(post.content, `${platformLabel(post.platform)} post`),
    subtitle: `${platformLabel(post.platform)} comments`,
    preview: target ? getCommentText(target) : `${post.commentCount || comments.length || 0} comments`,
    time: target?.createdTime || post.createdTime,
    badge: 'Comment',
    platform: post.platform,
    needsReply: needs.length > 0,
    count: comments.length || post.commentCount || 0,
    post,
    comments,
    needsCommentId: target?.id || '',
    sortTime: toDate(target?.createdTime || post.createdTime)?.getTime() || 0,
  }
}

function buildConversationThread(conversation, inboxes) {
  const partner = isMyPartnerConversation(conversation)
  return {
    id: `${partner ? 'partner' : 'dm'}:${conversation.id}`,
    kind: partner ? 'partner' : 'dm',
    title: partner ? 'My Partner' : conversationTitle(conversation),
    subtitle: partner ? 'Ask MAP for help' : inboxName(conversation, inboxes),
    preview: conversationPreview(conversation),
    time: conversation.last_activity_at || conversation.updated_at,
    badge: partner ? 'Partner' : 'DM',
    needsReply: conversation.status === 'open',
    conversation,
    sortTime: toDate(conversation.last_activity_at || conversation.updated_at)?.getTime() || 0,
  }
}

function filterThreads(threads, activeFilter) {
  if (activeFilter === 'open') return threads.filter((thread) => thread.needsReply)
  if (activeFilter === 'comments') return threads.filter((thread) => thread.kind === 'comments')
  if (activeFilter === 'dms') return threads.filter((thread) => thread.kind === 'dm')
  if (activeFilter === 'partner') return threads.filter((thread) => thread.kind === 'partner')
  return threads
}

function AttentionBadge({ children, tone = 'neutral' }) {
  return (
    <span className={`attention-badge attention-badge-${tone}`}>
      {children}
    </span>
  )
}

function LoadingBlock({ label }) {
  return (
    <div className="attention-empty">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  )
}

function PartnerShortcut({ onOpen, pending }) {
  return (
    <button type="button" className="attention-utility-item" onClick={onOpen} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold">My Partner</span>
        <span className="block truncate text-xs font-medium">Ask for help</span>
      </span>
      <ArrowUpRight className="h-4 w-4" />
    </button>
  )
}

function PublisherShortcuts({ drafts, scheduledPosts }) {
  const openDrafts = getOpenReviewDrafts(drafts)
  const nextDraft = selectNextReviewDraft(drafts)

  return (
    <section className="attention-utility-row" aria-label="Inbox shortcuts">
      <Link to={nextDraft ? `/post?draftId=${encodeURIComponent(nextDraft.id)}` : '/calendar'} className="attention-utility-item">
        <Edit3 className="h-4 w-4" />
        <span>
          <b>{openDrafts.length}</b>
          drafts
        </span>
      </Link>
      <Link to="/post/scheduled" className="attention-utility-item">
        <CalendarDays className="h-4 w-4" />
        <span>
          <b>{scheduledPosts.length}</b>
          scheduled
        </span>
      </Link>
      <Link to="/post" className="attention-utility-item">
        <Plus className="h-4 w-4" />
        <span>
          <b>New</b>
          post
        </span>
      </Link>
    </section>
  )
}

const PARTNER_HELP_ICONS = {
  create_post: Plus,
  review_drafts: Edit3,
  scheduled_posts: CalendarDays,
  ask_partner: MessageCircle,
}

function PartnerHelpMenu({ open, drafts, pending, onClose, onOpenPartner }) {
  const openDrafts = getOpenReviewDrafts(drafts)
  const nextDraft = selectNextReviewDraft(drafts)
  const options = getPartnerHelpOptions()
  if (!open) return null

  return (
    <div className="attention-partner-menu" role="dialog" aria-modal="true" aria-label="My Partner options">
      <button type="button" className="attention-partner-menu-backdrop" aria-label="Close My Partner options" onClick={onClose} />
      <section className="attention-partner-menu-sheet">
        <header>
          <div>
            <p className="attention-kicker">My Partner</p>
            <h2>What do you need?</h2>
          </div>
          <button type="button" className="attention-icon-button" onClick={onClose} aria-label="Close My Partner options">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="attention-partner-menu-options">
          {options.map((option) => {
            const Icon = PARTNER_HELP_ICONS[option.id] || MessageCircle
            const detail = option.id === 'review_drafts'
              ? `${openDrafts.length} draft${openDrafts.length === 1 ? '' : 's'} available`
              : option.description
            const href = resolvePartnerHelpHref(option.id, { firstDraftId: nextDraft?.id })
            if (option.id === 'ask_partner') {
              return (
                <button
                  key={option.id}
                  type="button"
                  className="attention-partner-menu-option"
                  onClick={onOpenPartner}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                  <span>
                    <strong>{option.label}</strong>
                    <small>{detail}</small>
                  </span>
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              )
            }
            return (
              <Link
                key={option.id}
                to={href}
                className="attention-partner-menu-option"
                onClick={onClose}
              >
                <Icon className="h-5 w-5" />
                <span>
                  <strong>{option.label}</strong>
                  <small>{detail}</small>
                </span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function ThreadListItem({ thread, active, onSelect }) {
  return (
    <button
      type="button"
      className="attention-thread-row"
      data-active={active ? 'true' : undefined}
      onClick={onSelect}
    >
      <span className={`attention-avatar attention-avatar-${thread.kind}`}>
        {thread.kind === 'partner' ? 'MP' : thread.kind === 'comments' ? platformLabel(thread.platform).slice(0, 2).toUpperCase() : 'DM'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="attention-thread-title-line">
          <span className="truncate">{thread.title}</span>
          <span className="shrink-0 text-xs font-semibold">{formatRelativeTime(thread.time)}</span>
        </span>
        <span className="attention-thread-meta-line">
          <AttentionBadge tone={thread.kind === 'comments' ? 'comment' : thread.kind === 'partner' ? 'partner' : 'dm'}>
            {thread.badge}
          </AttentionBadge>
          {thread.needsReply ? <span className="attention-dot">Open</span> : <span>Handled</span>}
        </span>
        <span className="attention-thread-preview">{thread.preview}</span>
      </span>
    </button>
  )
}

function CommentBubble({ comment, platform, selected, onSelect }) {
  const replies = Array.isArray(comment.replies) ? comment.replies : []
  return (
    <div className="attention-comment-block">
      <button
        type="button"
        className="attention-message-row attention-message-incoming"
        data-selected={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className="attention-message-author">{getCommentAuthor(comment, platform)}</span>
        <span className="attention-message-bubble"><LinkedMessageText>{getCommentText(comment)}</LinkedMessageText></span>
        <span className="attention-message-time">
          {formatDetailedTime(comment.createdTime)}
          {comment.replyCount > 0 ? ` · ${comment.replyCount} replies` : ''}
        </span>
      </button>
      {replies.map((reply, index) => {
        const text = getReplyText(reply)
        if (!text) return null
        return (
          <div key={reply.id || `${comment.id}-reply-${index}`} className="attention-message-row attention-message-outgoing">
            <span className="attention-message-bubble"><LinkedMessageText>{text}</LinkedMessageText></span>
            <span className="attention-message-time">{formatDetailedTime(reply.createdTime || reply.created_at || reply.timestamp)}</span>
          </div>
        )
      })}
    </div>
  )
}

function MessagesThread({ thread, messages, loading }) {
  if (loading) return <LoadingBlock label="Loading messages..." />

  if (!messages.length) {
    return (
      <div className="attention-empty">
        <MessageCircle className="h-5 w-5" />
        <span>No messages loaded yet.</span>
      </div>
    )
  }

  return (
    <div className="attention-message-stack">
      {messages.map((message) => {
        const outgoing = isOutgoingMessage(message)
        return (
          <div
            key={message.id || `${message.created_at}-${message.content}`}
            className={`attention-message-row ${outgoing ? 'attention-message-outgoing' : 'attention-message-incoming'}`}
          >
            <span className="attention-message-author">{outgoing ? 'MAP' : thread.title}</span>
            <span className="attention-message-bubble"><LinkedMessageText>{messageContent(message)}</LinkedMessageText></span>
            <span className="attention-message-time">{formatRelativeTime(message.created_at)}</span>
          </div>
        )
      })}
    </div>
  )
}

function ThreadHeader({ thread, onBack, onMarkHandled, markPending, onHideThread, hidePending, canHide }) {
  return (
    <header className="attention-thread-header">
      <button type="button" className="attention-icon-button md:hidden" onClick={onBack} aria-label="Back to Inbox list">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className={`attention-avatar attention-avatar-${thread.kind}`}>
        {thread.kind === 'partner' ? 'MP' : thread.kind === 'comments' ? platformLabel(thread.platform).slice(0, 2).toUpperCase() : 'DM'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-black">{thread.title}</span>
        <span className="block truncate text-xs font-semibold">{thread.subtitle}</span>
      </span>
      <AttentionBadge tone={thread.needsReply ? 'needs' : 'neutral'}>
        {thread.needsReply ? 'Open' : 'Handled'}
      </AttentionBadge>
      {thread.kind !== 'comments' ? (
        <button
          type="button"
          className="attention-header-action"
          onClick={onMarkHandled}
          disabled={markPending || hidePending}
        >
          {markPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          <span>Done</span>
        </button>
      ) : null}
      {canHide ? (
        <button
          type="button"
          className="attention-header-action attention-header-danger"
          onClick={onHideThread}
          disabled={hidePending || markPending}
        >
          {hidePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span>Delete</span>
        </button>
      ) : null}
    </header>
  )
}

export default function Attention() {
  const queryClient = useQueryClient()
  const outlet = useOutletContext() || {}
  const clientId = outlet.profile?.client_id
  const [activeFilter, setActiveFilter] = useState('open')
  const [selectedThreadId, setSelectedThreadId] = useState('')
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [composer, setComposer] = useState('')
  const [selectedCommentId, setSelectedCommentId] = useState('')
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(false)
  const threadEndRef = useRef(null)

  const inboxesQuery = useQuery({
    queryKey: ['attention-inboxes'],
    queryFn: fetchInboxes,
    staleTime: 5 * 60 * 1000,
  })

  const conversationsQuery = useQuery({
    queryKey: ['attention-conversations'],
    queryFn: fetchAttentionConversations,
    refetchInterval: 25_000,
  })

  const commentPostsQuery = useQuery({
    queryKey: ['attention-comment-posts'],
    queryFn: fetchCommentPosts,
    refetchInterval: 35_000,
  })

  const commentPosts = useMemo(() => (
    Array.isArray(commentPostsQuery.data?.posts) ? commentPostsQuery.data.posts : []
  ), [commentPostsQuery.data])

  const commentBundleKey = useMemo(() => (
    commentPosts.map((post) => `${post.id}:${post.accountId}:${post.commentCount}`).join('|')
  ), [commentPosts])

  const commentBundlesQuery = useQuery({
    queryKey: ['attention-comment-bundles', commentBundleKey],
    queryFn: () => fetchCommentBundles(commentPosts),
    enabled: commentPosts.length > 0,
    refetchInterval: 35_000,
  })

  const draftsQuery = useQuery({
    queryKey: ['social-drafts', clientId],
    queryFn: () => fetchSocialDrafts(clientId),
    enabled: !!clientId,
  })

  const scheduledQuery = useQuery({
    queryKey: ['scheduled-posts', clientId],
    queryFn: () => fetchScheduledPosts(clientId),
    enabled: !!clientId,
  })

  const inboxes = useMemo(() => inboxesQuery.data || [], [inboxesQuery.data])
  const conversations = useMemo(() => conversationsQuery.data || [], [conversationsQuery.data])
  const commentBundles = useMemo(() => commentBundlesQuery.data || [], [commentBundlesQuery.data])
  const inboxBusinessNames = useMemo(
    () => businessNameCandidates(outlet.profile),
    [outlet.profile],
  )

  const threads = useMemo(() => {
    const partnerThreads = conversations
      .filter(isMyPartnerConversation)
      .map((conversation) => buildConversationThread(conversation, inboxes))
    const dmThreads = selectPrivateMessageConversations(conversations, inboxes, { businessNames: inboxBusinessNames })
      .map((conversation) => buildConversationThread(conversation, inboxes))

    const commentThreads = commentBundles.map(buildCommentThread)

    return [...commentThreads, ...partnerThreads, ...dmThreads]
      .sort((left, right) => right.sortTime - left.sortTime)
  }, [commentBundles, conversations, inboxBusinessNames, inboxes])

  const filteredThreads = useMemo(() => filterThreads(threads, activeFilter), [threads, activeFilter])
  const selectedThread = filteredThreads.find((thread) => thread.id === selectedThreadId) || filteredThreads[0] || null

  const messagesQuery = useQuery({
    queryKey: ['attention-messages', selectedThread?.conversation?.id],
    queryFn: fetchMessages,
    enabled: Boolean(selectedThread?.conversation?.id),
    refetchInterval: selectedThread?.conversation?.id ? 20_000 : false,
  })

  const replyMutation = useMutation({
    mutationFn: sendDmReply,
    onSuccess: async () => {
      const conversationId = selectedThread?.conversation?.id
      setComposer('')
      if (conversationId) {
        await queryClient.invalidateQueries({ queryKey: ['attention-messages', conversationId] })
      }
      await queryClient.invalidateQueries({ queryKey: ['attention-conversations'] })
      await queryClient.invalidateQueries({ queryKey: ['inbox-notification-counts'] })
    },
  })

  const commentReplyMutation = useMutation({
    mutationFn: sendCommentReply,
    onSuccess: async () => {
      setComposer('')
      await queryClient.invalidateQueries({ queryKey: ['attention-comment-posts'] })
      await queryClient.invalidateQueries({ queryKey: ['attention-comment-bundles'] })
      await queryClient.invalidateQueries({ queryKey: ['inbox-notification-counts'] })
    },
  })

  const markHandledMutation = useMutation({
    mutationFn: markConversationHandled,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attention-conversations'] })
      await queryClient.invalidateQueries({ queryKey: ['inbox-notification-counts'] })
    },
  })

  const hideThreadMutation = useMutation({
    mutationFn: markConversationHandled,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attention-conversations'] })
      await queryClient.invalidateQueries({ queryKey: ['inbox-notification-counts'] })
      setSelectedThreadId('')
      setMobileThreadOpen(false)
      setComposer('')
    },
  })

  const partnerMutation = useMutation({
    mutationFn: openContentPartnerConversation,
    onSuccess: async (payload) => {
      setPartnerMenuOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['attention-conversations'] })
      if (payload?.conversationId) {
        setSelectedThreadId(`partner:${payload.conversationId}`)
        setMobileThreadOpen(true)
      }
    },
  })

  const loading = conversationsQuery.isLoading || commentPostsQuery.isLoading || commentBundlesQuery.isLoading
  const errorMessage = conversationsQuery.error?.message ||
    inboxesQuery.error?.message ||
    commentPostsQuery.error?.message ||
    commentBundlesQuery.error?.message ||
    draftsQuery.error?.message ||
    scheduledQuery.error?.message ||
    ''

  const selectedComment = selectedThread?.kind === 'comments'
    ? selectedThread.comments.find((comment) => comment.id === selectedCommentId) ||
      selectedThread.comments.find((comment) => comment.id === selectedThread.needsCommentId) ||
      selectedThread.comments[0] ||
      null
    : null

  const selectedThreadItemCount = selectedThread?.kind === 'comments'
    ? selectedThread.comments.reduce((count, comment) => count + 1 + (Array.isArray(comment.replies) ? comment.replies.length : 0), 0)
    : (messagesQuery.data || []).length
  const selectedThreadKey = selectedThread?.id || ''
  const canHideSelectedThread = canHideInboxThread(selectedThread)

  useEffect(() => {
    if (!selectedThreadKey || !mobileThreadOpen) return undefined
    const frame = window.requestAnimationFrame(() => {
      threadEndRef.current?.scrollIntoView({ block: 'end' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedThreadKey, selectedComment?.id, selectedThreadItemCount, messagesQuery.isLoading, mobileThreadOpen])

  function selectThread(thread) {
    setSelectedThreadId(thread.id)
    setMobileThreadOpen(true)
    setComposer('')
  }

  function handleFilterChange(filter) {
    setActiveFilter(filter)
    setSelectedThreadId('')
    setMobileThreadOpen(false)
    setComposer('')
    setPartnerMenuOpen(false)
  }

  function handleHideThread() {
    if (!canHideSelectedThread || !selectedThread?.conversation?.id) return
    const confirmed = window.confirm(
      'Delete this chat from your Inbox?\n\nThis hides it from the customer Inbox but keeps the support history for MAP.',
    )
    if (!confirmed) return
    hideThreadMutation.mutate(selectedThread.conversation.id)
  }

  function handleOpenPartnerFromMenu() {
    partnerMutation.mutate()
  }

  function handleSubmit(event) {
    event.preventDefault()
    const content = composer.trim()
    if (!content || !selectedThread) return

    if (selectedThread.kind === 'comments') {
      commentReplyMutation.mutate({
        postId: selectedThread.post.id,
        accountId: selectedThread.post.accountId,
        commentId: selectedComment?.id || selectedThread.needsCommentId || '',
        message: content,
      })
      return
    }

    if (selectedThread.conversation?.id) {
      replyMutation.mutate({
        conversationId: selectedThread.conversation.id,
        content,
      })
    }
  }

  return (
    <div className="attention-page">
      <div className="attention-mobile-shell">
        <section className={`attention-list-pane ${mobileThreadOpen ? 'attention-mobile-hidden' : ''}`}>
          <header className="attention-topbar">
            <div>
              <p className="attention-kicker">Messages</p>
              <h1>Inbox</h1>
            </div>
            <button
              type="button"
              className="attention-icon-button"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ['attention-conversations'] })
                void queryClient.invalidateQueries({ queryKey: ['attention-comment-posts'] })
                void queryClient.invalidateQueries({ queryKey: ['attention-comment-bundles'] })
              }}
              aria-label="Refresh Inbox"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </header>

          <div className="attention-filters" role="tablist" aria-label="Inbox filters">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.value}
                data-active={activeFilter === filter.value ? 'true' : undefined}
                onClick={() => handleFilterChange(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="attention-utility-strip">
            <PartnerShortcut onOpen={() => setPartnerMenuOpen(true)} pending={partnerMutation.isPending} />
            <PublisherShortcuts
              drafts={draftsQuery.data || []}
              scheduledPosts={scheduledQuery.data || []}
            />
          </div>
          <PartnerHelpMenu
            open={partnerMenuOpen}
            drafts={draftsQuery.data || []}
            pending={partnerMutation.isPending}
            onClose={() => setPartnerMenuOpen(false)}
            onOpenPartner={handleOpenPartnerFromMenu}
          />

          {errorMessage ? (
            <div className="attention-error">{errorMessage}</div>
          ) : null}

          <div className="attention-thread-list">
            {loading ? (
              <LoadingBlock label="Loading inbox..." />
            ) : filteredThreads.length === 0 ? (
              <div className="attention-empty">
                <Inbox className="h-5 w-5" />
                <span>No new messages right now.</span>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <ThreadListItem
                  key={thread.id}
                  thread={thread}
                  active={selectedThread?.id === thread.id}
                  onSelect={() => selectThread(thread)}
                />
              ))
            )}
          </div>
        </section>

        <section className={`attention-thread-pane ${mobileThreadOpen ? 'attention-mobile-open' : ''}`}>
          {selectedThread ? (
            <>
              <ThreadHeader
                thread={selectedThread}
                onBack={() => setMobileThreadOpen(false)}
                onMarkHandled={() => {
                  if (selectedThread.conversation?.id) markHandledMutation.mutate(selectedThread.conversation.id)
                }}
                markPending={markHandledMutation.isPending}
                onHideThread={handleHideThread}
                hidePending={hideThreadMutation.isPending}
                canHide={canHideSelectedThread}
              />

              <main className="attention-thread-body">
                {selectedThread.kind === 'comments' ? (
                  <>
                    <article className="attention-post-context">
                      {selectedThread.post.picture ? (
                        <img src={selectedThread.post.picture} alt="" />
                      ) : null}
                      <div>
                        <p>{selectedThread.post.content || `${platformLabel(selectedThread.platform)} post`}</p>
                        <span>
                          {selectedThread.count} comments
                          {selectedThread.post.permalink ? ' · ' : ''}
                          {selectedThread.post.permalink ? (
                            <a href={selectedThread.post.permalink} target="_blank" rel="noopener noreferrer">Open post</a>
                          ) : null}
                        </span>
                      </div>
                    </article>
                    <div className="attention-message-stack">
                      {selectedThread.comments.length === 0 ? (
                        <div className="attention-empty">
                          <StickyNote className="h-5 w-5" />
                          <span>No individual comments loaded for this post yet.</span>
                        </div>
                      ) : (
                        selectedThread.comments.map((comment) => (
                          <CommentBubble
                            key={comment.id || `${comment.createdTime}-${comment.text}`}
                            comment={comment}
                            platform={selectedThread.platform}
                            selected={selectedComment?.id === comment.id}
                            onSelect={() => setSelectedCommentId(comment.id)}
                          />
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <MessagesThread
                    thread={selectedThread}
                    messages={messagesQuery.data || []}
                    loading={messagesQuery.isLoading}
                  />
                )}
                <div ref={threadEndRef} className="attention-thread-bottom" aria-hidden="true" />
              </main>

              <form className="attention-composer" onSubmit={handleSubmit}>
                <div className="attention-composer-context">
                  {selectedThread.kind === 'comments' ? (
                    <span>
                      Replying to {selectedComment ? getCommentAuthor(selectedComment, selectedThread.platform) : 'the selected comment'}
                    </span>
                  ) : (
                    <span>Replying in {selectedThread.badge === 'Partner' ? 'My Partner' : 'regular DMs'}</span>
                  )}
                  {selectedThread.kind === 'comments' && selectedComment?.id ? (
                    <button type="button" onClick={() => setSelectedCommentId(selectedThread.needsCommentId || selectedThread.comments[0]?.id || '')}>
                      Use first open comment
                    </button>
                  ) : null}
                </div>
                <div className="attention-composer-shell">
                  <input
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder={selectedThread.kind === 'comments' ? 'Write a public reply...' : 'Type a message...'}
                  />
                  <button
                    type="submit"
                    disabled={!composer.trim() || replyMutation.isPending || commentReplyMutation.isPending}
                    aria-label="Send reply"
                  >
                    {replyMutation.isPending || commentReplyMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {(replyMutation.error || commentReplyMutation.error || markHandledMutation.error || hideThreadMutation.error) ? (
                  <p className="attention-form-error">
                    {replyMutation.error?.message || commentReplyMutation.error?.message || markHandledMutation.error?.message || hideThreadMutation.error?.message}
                  </p>
                ) : null}
              </form>
            </>
          ) : (
            <div className="attention-thread-placeholder">
              <Clock3 className="h-7 w-7" />
              <h2>No message selected.</h2>
              <p>New social comments, regular DMs, and MAP Partner activity will show here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
