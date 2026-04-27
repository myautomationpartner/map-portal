import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  Clock3,
  ExternalLink,
  FileText,
  Inbox as InboxIcon,
  Loader2,
  MessageCircle,
  MonitorSmartphone,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  StickyNote,
  X,
  UserRound,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const DEFAULT_CHATWOOT_APP_URL = 'https://chatwoot.myautomationpartner.com/app'
const CHATWOOT_APP_URL = stripTrailingSlash(import.meta.env.VITE_CHATWOOT_APP_URL || DEFAULT_CHATWOOT_APP_URL)
const CHATWOOT_MOBILE_APPS_URL = import.meta.env.VITE_CHATWOOT_MOBILE_APPS_URL || 'https://www.chatwoot.com/mobile-apps'
const CHATWOOT_IOS_URL = import.meta.env.VITE_CHATWOOT_IOS_URL || 'https://apps.apple.com/us/app/chatwoot/id1495796682'
const CHATWOOT_ANDROID_URL = import.meta.env.VITE_CHATWOOT_ANDROID_URL || 'https://play.google.com/store/apps/details?id=com.chatwoot.app'

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
]

const STATUS_STYLES = {
  open: { color: '#2f8f57', background: 'rgba(31,169,113,0.1)', borderColor: 'rgba(31,169,113,0.22)' },
  pending: { color: '#8c6d1c', background: 'rgba(201,168,76,0.1)', borderColor: 'rgba(201,168,76,0.24)' },
  resolved: { color: '#64748b', background: 'rgba(100,116,139,0.1)', borderColor: 'rgba(100,116,139,0.18)' },
}

// Data fetching

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in again to use the inbox.')
  return token
}

async function chatwootPortalFetch(path, options = {}) {
  const token = await getAccessToken()
  const response = await fetch(`/api/chatwoot/${path.replace(/^\/+/, '')}`, {
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

async function fetchInboxes() {
  const payload = await chatwootPortalFetch('/inboxes')
  return Array.isArray(payload?.payload) ? payload.payload : []
}

async function websiteChatPortalFetch(path, options = {}) {
  const token = await getAccessToken()
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || `Website chat request failed (${response.status}).`)
  }

  return payload
}

function fetchWebsiteChatSettings() {
  return websiteChatPortalFetch('/api/website-chat/settings')
}

async function fetchConversations({ queryKey }) {
  const [, filters] = queryKey
  const params = new URLSearchParams({
    status: filters.status,
    assignee_type: 'all',
    page: '1',
  })
  if (filters.query) params.set('q', filters.query)
  if (filters.inboxId) params.set('inbox_id', String(filters.inboxId))

  const payload = await chatwootPortalFetch(`/conversations?${params.toString()}`)
  return normalizeConversationResponse(payload)
}

async function fetchMessages({ queryKey }) {
  const [, conversationId] = queryKey
  if (!conversationId) return []
  const payload = await chatwootPortalFetch(`/conversations/${conversationId}/messages`)
  return normalizeMessages(payload)
}

function sendReply({ conversationId, content, isPrivate }) {
  return chatwootPortalFetch(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, private: isPrivate }),
  })
}

function updateConversationStatus({ conversationId, status }) {
  return chatwootPortalFetch(`/conversations/${conversationId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

// Runtime helpers

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function mobileStoreUrl() {
  if (!isMobile()) return CHATWOOT_MOBILE_APPS_URL
  return isIOS() ? CHATWOOT_IOS_URL : CHATWOOT_ANDROID_URL
}

function normalizeConversationResponse(payload) {
  const data = payload?.data || payload || {}
  return {
    meta: data.meta || payload?.meta || {},
    conversations: Array.isArray(data.payload) ? data.payload : Array.isArray(payload?.payload) ? payload.payload : [],
  }
}

function normalizeMessages(payload) {
  if (Array.isArray(payload?.payload)) return payload.payload
  if (Array.isArray(payload)) return payload
  return []
}

function unixToDate(value) {
  if (!value) return null
  return new Date(Number(value) * 1000)
}

function formatRelativeTime(value) {
  const date = unixToDate(value)
  if (!date || Number.isNaN(date.getTime())) return 'No activity'
  const diffSeconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSeconds < 60) return 'Just now'
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function conversationTitle(conversation) {
  return conversation?.meta?.sender?.name
    || conversation?.meta?.sender?.email
    || conversation?.meta?.sender?.phone_number
    || `Conversation #${conversation?.id}`
}

function conversationSubtitle(conversation) {
  const sender = conversation?.meta?.sender || {}
  return sender.email || sender.phone_number || conversation?.channel || 'Customer'
}

function conversationPreview(conversation) {
  const lastMessage = [...(conversation?.messages || [])].reverse().find((message) => message.content)
  return lastMessage?.content || conversation?.additional_attributes?.browser?.device_name || 'No message preview yet.'
}

function senderName(message) {
  if (message?.sender?.name) return message.sender.name
  if (message?.sender_type === 'User') return 'Agent'
  if (message?.message_type === 1 || message?.message_type === 'outgoing') return 'Agent'
  return 'Customer'
}

function isOutgoing(message) {
  return message?.message_type === 1 || message?.message_type === 'outgoing'
}

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.open
}

function StatusPill({ status }) {
  const style = statusStyle(status)
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize"
      style={style}
    >
      {status || 'open'}
    </span>
  )
}

function MobileAppBanner() {
  if (!isMobile()) return null

  return (
    <div className="portal-status-info flex items-start gap-4 px-4 py-3">
      <Smartphone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--portal-primary)' }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
          Mobile customer service
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
          Use the Chatwoot mobile app with installation URL chatwoot.myautomationpartner.com.
        </p>
      </div>
      <a
        href={mobileStoreUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
        style={{ color: 'var(--portal-primary)' }}
      >
        Get App
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

function SetupChecklistItem({ done, title, detail }) {
  return (
    <div className="flex gap-3 rounded-2xl border p-3" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.76)' }}>
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
        style={{
          borderColor: done ? 'rgba(47,143,87,0.28)' : 'var(--portal-border)',
          background: done ? 'rgba(47,143,87,0.1)' : 'rgba(255,255,255,0.8)',
          color: done ? '#2f8f57' : 'var(--portal-text-soft)',
        }}
      >
        {done ? <Check className="h-4 w-4" /> : <Clock3 className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{title}</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>{detail}</p>
      </div>
    </div>
  )
}

function SetupInboxModal({ open, onClose, websiteChat, websiteChatLoading, userEmail }) {
  const [copied, setCopied] = useState('')
  if (!open) return null

  const settings = websiteChat?.settings || {}
  const snippet = websiteChat?.installSnippet || settings.install_snippet || ''
  const installed = settings.install_status === 'detected'
  const workspaceUrl = 'https://chatwoot.myautomationpartner.com'
  const loginEmail = userEmail || 'your MAP login email'

  async function copyText(label, value) {
    if (!value) return
    await navigator.clipboard?.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="portal-panel max-h-[92vh] w-full max-w-4xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b p-5 md:p-6" style={{ borderColor: 'var(--portal-border)' }}>
          <div>
            <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
              Inbox setup
            </span>
            <h2 className="mt-3 text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Set up customer messages
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              MAP keeps the main inbox here. Chatwoot powers the mobile app and website widget in the background.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="portal-button-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center"
            aria-label="Close setup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="portal-scroll max-h-[calc(92vh-110px)] overflow-y-auto p-5 md:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-4">
              <SetupChecklistItem
                done
                title="1. Use this portal for daily customer service"
                detail="Website chat and social messages land in this Inbox. Reply, add notes, and resolve conversations here on desktop."
              />
              <SetupChecklistItem
                done={Boolean(websiteChat?.settings?.chatwoot_website_token || websiteChat?.installSnippet)}
                title="2. Website chat widget is ready to install"
                detail={installed ? 'The widget was detected on your website.' : 'Copy the script below, send it to your web person, or request MAP to install it.'}
              />
              <SetupChecklistItem
                done
                title="3. Use Chatwoot only for mobile"
                detail="Install the Chatwoot app when you want phone notifications and quick replies away from your computer."
              />

              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.76)' }}>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Mobile app setup</p>
                </div>
                <div className="mt-4 grid gap-3 text-sm">
                  <div className="rounded-xl border p-3" style={{ borderColor: 'var(--portal-border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--portal-text-soft)' }}>App</p>
                    <p className="mt-1 font-semibold" style={{ color: 'var(--portal-text)' }}>Chatwoot</p>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: 'var(--portal-border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--portal-text-soft)' }}>Workspace URL</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="break-all font-semibold" style={{ color: 'var(--portal-text)' }}>{workspaceUrl}</p>
                      <button type="button" onClick={() => copyText('workspace', workspaceUrl)} className="portal-button-secondary inline-flex h-8 w-8 items-center justify-center">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: 'var(--portal-border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--portal-text-soft)' }}>Login email</p>
                    <p className="mt-1 break-all font-semibold" style={{ color: 'var(--portal-text)' }}>{loginEmail}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={CHATWOOT_IOS_URL} target="_blank" rel="noopener noreferrer" className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
                    iPhone app
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                  <a href={CHATWOOT_ANDROID_URL} target="_blank" rel="noopener noreferrer" className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
                    Android app
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.76)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Website chat setup</p>
                  </div>
                  <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={installed ? STATUS_STYLES.open : STATUS_STYLES.pending}>
                    {installed ? 'Installed' : websiteChatLoading ? 'Checking' : 'Not detected'}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                  Add this script before the closing body tag on your website. It is a public widget token, not a private API secret.
                </p>
                <textarea
                  readOnly
                  value={snippet || 'Website chat settings are still being prepared. Refresh this page in a moment.'}
                  className="portal-input mt-3 min-h-32 resize-none p-3 font-mono text-xs"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyText('script', snippet)}
                    disabled={!snippet}
                    className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy script
                  </button>
                  <a href="/settings" className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
                    <Settings className="h-3.5 w-3.5" />
                    Website Chat settings
                  </a>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl border p-4" style={{ borderColor: 'rgba(201,168,76,0.28)', background: 'rgba(201,168,76,0.08)' }}>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Readme</p>
              </div>
              <div className="mt-4 space-y-4 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--portal-text)' }}>What to use</p>
                  <p>Use MAP Inbox on your computer. Use Chatwoot mobile app only when you need phone notifications or fast replies away from your desk.</p>
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--portal-text)' }}>Mobile steps</p>
                  <p>Download Chatwoot, enter the workspace URL, then log in with your MAP email. If the password does not work, use the Chatwoot reset-password link.</p>
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--portal-text)' }}>Website steps</p>
                  <p>Install the widget script once. After that, website chats appear here automatically.</p>
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--portal-text)' }}>Social messages</p>
                  <p>Connect Facebook, Instagram, and TikTok in Settings. Messages appear here after the social account connection is approved.</p>
                </div>
              </div>
              {copied && (
                <p className="mt-4 rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'rgba(47,143,87,0.28)', background: 'rgba(47,143,87,0.1)', color: '#2f8f57' }}>
                  Copied.
                </p>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ title, detail }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.22)' }}
      >
        <InboxIcon className="h-6 w-6" style={{ color: 'var(--portal-primary)' }} />
      </div>
      <p className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
        {title}
      </p>
      <p className="mt-1 max-w-md text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
        {detail}
      </p>
    </div>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="portal-status-danger flex items-start gap-3 px-4 py-3 text-sm">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export default function Inbox() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [inboxId, setInboxId] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [composer, setComposer] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 260)
    return () => window.clearTimeout(timer)
  }, [query])

  const filters = useMemo(() => ({
    status,
    query: debouncedQuery,
    inboxId: inboxId || '',
  }), [debouncedQuery, inboxId, status])

  const inboxesQuery = useQuery({
    queryKey: ['chatwoot-inboxes'],
    queryFn: fetchInboxes,
    staleTime: 60_000,
  })

  const websiteChatQuery = useQuery({
    queryKey: ['website-chat-settings', 'inbox'],
    queryFn: fetchWebsiteChatSettings,
    staleTime: 60_000,
  })

  const userQuery = useQuery({
    queryKey: ['inbox-current-user'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error) throw error
      return data?.user || null
    },
    staleTime: 300_000,
  })

  const conversationsQuery = useQuery({
    queryKey: ['chatwoot-conversations', filters],
    queryFn: fetchConversations,
    refetchInterval: 30_000,
  })

  const conversations = useMemo(
    () => conversationsQuery.data?.conversations || [],
    [conversationsQuery.data],
  )
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || conversations[0] || null,
    [conversations, selectedId],
  )
  const activeConversationId = selectedConversation?.id || null

  const messagesQuery = useQuery({
    queryKey: ['chatwoot-messages', activeConversationId],
    queryFn: fetchMessages,
    enabled: Boolean(activeConversationId),
    refetchInterval: activeConversationId ? 20_000 : false,
  })

  const replyMutation = useMutation({
    mutationFn: sendReply,
    onSuccess: async () => {
      setComposer('')
      setIsPrivate(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chatwoot-conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['chatwoot-messages', activeConversationId] }),
      ])
    },
  })

  const statusMutation = useMutation({
    mutationFn: updateConversationStatus,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chatwoot-conversations'] })
      await queryClient.invalidateQueries({ queryKey: ['chatwoot-messages', activeConversationId] })
    },
  })

  const messages = messagesQuery.data || selectedConversation?.messages || []
  const meta = conversationsQuery.data?.meta || {}
  const totalCount = meta.all_count ?? conversations.length
  const openChatwootUrl = activeConversationId
    ? `${CHATWOOT_APP_URL}/accounts/1/conversations/${activeConversationId}`
    : CHATWOOT_APP_URL

  function handleSubmit(event) {
    event.preventDefault()
    const content = composer.trim()
    if (!activeConversationId || !content || replyMutation.isPending) return
    replyMutation.mutate({ conversationId: activeConversationId, content, isPrivate })
  }

  function handleSelect(conversationId) {
    setSelectedId(conversationId)
    setMobileThreadOpen(true)
  }

  return (
    <div className="portal-page mx-auto max-w-[1540px] space-y-5 md:p-6 xl:p-8">
      <section className="portal-surface p-5 md:p-6">
        <div className="portal-page-header">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Unified Inbox
              </span>
              <StatusPill status={status} />
            </div>
            <h1 className="portal-page-title font-display">Inbox</h1>
            <p className="portal-page-subtitle">
              Customer service for website chat, email, and connected social channels without leaving the MAP portal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="portal-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
            >
              <Settings className="h-4 w-4" />
              Setup inbox
            </button>
            <button
              type="button"
              onClick={() => conversationsQuery.refetch()}
              className="portal-button-secondary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
            >
              <RefreshCw className={`h-4 w-4 ${conversationsQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <a
              href={openChatwootUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-button-secondary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
            >
              Chatwoot
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <SetupInboxModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        websiteChat={websiteChatQuery.data}
        websiteChatLoading={websiteChatQuery.isLoading || websiteChatQuery.isFetching}
        userEmail={userQuery.data?.email || ''}
      />

      <MobileAppBanner />
      <ErrorBanner message={conversationsQuery.error?.message || inboxesQuery.error?.message || messagesQuery.error?.message} />

      <section className="portal-panel min-h-[680px] overflow-hidden">
        <div className="grid min-h-[680px] lg:grid-cols-[360px_minmax(0,1fr)_300px]">
          <aside className={`${mobileThreadOpen ? 'hidden lg:flex' : 'flex'} min-h-[680px] flex-col border-r`} style={{ borderColor: 'var(--portal-border)' }}>
            <div className="space-y-3 border-b p-4" style={{ borderColor: 'var(--portal-border)' }}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--portal-text-soft)' }} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search conversations"
                  className="portal-input h-11 pl-9 pr-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setStatus(option.value)
                      setSelectedId(null)
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${status === option.value ? '' : 'bg-white/70'}`}
                    style={status === option.value ? statusStyle(option.value) : { borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <select
                value={inboxId}
                onChange={(event) => {
                  setInboxId(event.target.value)
                  setSelectedId(null)
                }}
                className="portal-input h-11 px-3 text-sm"
              >
                <option value="">All inboxes</option>
                {(inboxesQuery.data || []).map((inbox) => (
                  <option key={inbox.id} value={inbox.id}>
                    {inbox.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between border-b px-4 py-3 text-xs" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
              <span>{totalCount} conversations</span>
              <span>{conversationsQuery.isFetching ? 'Syncing' : 'Live every 30s'}</span>
            </div>

            <div className="portal-scroll flex-1 overflow-y-auto">
              {conversationsQuery.isLoading ? (
                <div className="flex h-52 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
                </div>
              ) : conversations.length === 0 ? (
                <EmptyState title="No conversations here" detail="When customers write in, their conversations will appear in this queue." />
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelect(conversation.id)}
                    className="block w-full border-b p-4 text-left transition-colors hover:bg-white/70"
                    style={{
                      borderColor: 'var(--portal-border)',
                      background: activeConversationId === conversation.id ? 'rgba(201,168,76,0.09)' : 'transparent',
                    }}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                          {conversationTitle(conversation)}
                        </p>
                        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                          {conversationSubtitle(conversation)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px]" style={{ color: 'var(--portal-text-soft)' }}>
                        {formatRelativeTime(conversation.last_activity_at || conversation.updated_at)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                      {conversationPreview(conversation)}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <StatusPill status={conversation.status} />
                      {conversation.unread_count > 0 && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--portal-primary)', color: 'var(--portal-dark)' }}>
                          {conversation.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <main className={`${mobileThreadOpen ? 'flex' : 'hidden lg:flex'} min-h-[680px] flex-col`}>
            {selectedConversation ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-5" style={{ borderColor: 'var(--portal-border)' }}>
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMobileThreadOpen(false)}
                      className="portal-button-secondary inline-flex h-9 w-9 items-center justify-center lg:hidden"
                      aria-label="Back to conversations"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'rgba(201,168,76,0.1)' }}>
                      <UserRound className="h-5 w-5" style={{ color: 'var(--portal-primary)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                        {conversationTitle(selectedConversation)}
                      </p>
                      <p className="truncate text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                        {conversationSubtitle(selectedConversation)}
                      </p>
                    </div>
                  </div>
                  <StatusPill status={selectedConversation.status} />
                </div>

                <div className="portal-scroll flex-1 space-y-3 overflow-y-auto bg-white/35 p-4 md:p-5">
                  {messagesQuery.isLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
                    </div>
                  ) : messages.length === 0 ? (
                    <EmptyState title="No messages loaded" detail="This conversation is selected, but Chatwoot has not returned message history yet." />
                  ) : (
                    messages.map((message) => {
                      const outgoing = isOutgoing(message)
                      return (
                        <div key={message.id || `${message.created_at}-${message.content}`} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className="max-w-[82%] rounded-2xl border px-4 py-3"
                            style={{
                              borderColor: outgoing ? 'rgba(201,168,76,0.28)' : 'var(--portal-border)',
                              background: outgoing ? 'rgba(201,168,76,0.13)' : 'rgba(255,255,255,0.96)',
                              color: 'var(--portal-text)',
                            }}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold" style={{ color: 'var(--portal-text-muted)' }}>
                              <span>{senderName(message)}</span>
                              {message.private && (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: 'rgba(100,116,139,0.1)' }}>
                                  <StickyNote className="h-3 w-3" />
                                  Note
                                </span>
                              )}
                              <span>{formatRelativeTime(message.created_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {message.content || '[Attachment or system message]'}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <form onSubmit={handleSubmit} className="border-t p-4" style={{ borderColor: 'var(--portal-border)' }}>
                  <textarea
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder={isPrivate ? 'Write an internal note' : 'Write a reply'}
                    rows={3}
                    className="portal-input min-h-24 resize-none p-3 text-sm"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setIsPrivate((value) => !value)}
                      className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold"
                      style={isPrivate ? { borderColor: 'rgba(201,168,76,0.35)', background: 'rgba(201,168,76,0.1)' } : undefined}
                    >
                      <StickyNote className="h-4 w-4" />
                      Private note
                      {isPrivate && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="submit"
                      disabled={!composer.trim() || replyMutation.isPending}
                      className="portal-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </button>
                  </div>
                  <ErrorBanner message={replyMutation.error?.message} />
                </form>
              </>
            ) : (
              <EmptyState title="Select a conversation" detail="Choose a customer conversation to read history, reply, add a private note, or update status." />
            )}
          </main>

          <aside className="hidden min-h-[680px] border-l lg:block" style={{ borderColor: 'var(--portal-border)' }}>
            <div className="border-b p-5" style={{ borderColor: 'var(--portal-border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                Conversation
              </h2>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                Use the portal for daily triage. Open Chatwoot only for advanced inbox configuration.
              </p>
            </div>

            <div className="space-y-5 p-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--portal-text-soft)' }}>
                  Status
                </p>
                <div className="grid gap-2">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!activeConversationId || statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ conversationId: activeConversationId, status: option.value })}
                      className="portal-button-secondary inline-flex items-center justify-between px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{option.label}</span>
                      {selectedConversation?.status === option.value && <CheckCircle2 className="h-4 w-4" style={{ color: '#2f8f57' }} />}
                    </button>
                  ))}
                </div>
                <ErrorBanner message={statusMutation.error?.message} />
              </div>

              <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.72)' }}>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                    Channel
                  </p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                  {selectedConversation?.channel || selectedConversation?.inbox_id ? `Inbox #${selectedConversation?.inbox_id}` : 'Waiting for first customer message'}
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.72)' }}>
                <div className="flex items-center gap-2">
                  <MonitorSmartphone className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                    Mobile
                  </p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                  Agents can use the Chatwoot mobile app for notifications and quick replies.
                </p>
                <a
                  href={mobileStoreUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-semibold"
                  style={{ color: 'var(--portal-primary)' }}
                >
                  Mobile apps
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.72)' }}>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                    Activity
                  </p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                  Last activity: {formatRelativeTime(selectedConversation?.last_activity_at || selectedConversation?.updated_at)}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
