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
  Mail,
  MessageCircle,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
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
const CHATWOOT_WORKSPACE_URL = 'https://chatwoot.myautomationpartner.com'
const CHATWOOT_WORKSPACE_HOST = 'chatwoot.myautomationpartner.com'

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

function sendMobileSetupEmail() {
  return websiteChatPortalFetch('/api/inbox/mobile-setup-email', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

function openContentPartnerConversation() {
  return websiteChatPortalFetch('/api/content-partner/conversation', {
    method: 'POST',
    body: JSON.stringify({}),
  })
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

function mobileSetupUrl() {
  if (typeof window === 'undefined') return '/inbox?phoneSetup=1'
  return `${window.location.origin}/inbox?phoneSetup=1`
}

function qrImageUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(value)}`
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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isSafeContentPartnerPreviewUrl(value) {
  if (!value) return false
  try {
    const parsed = new URL(value, window.location.origin)
    return parsed.protocol === 'https:'
      && parsed.hostname.endsWith('.myautomationpartner.com')
      && parsed.pathname.startsWith('/api/content-partner/previews/')
      && /\.(svg|png)$/i.test(parsed.pathname)
      && parsed.searchParams.has('token')
  } catch {
    return false
  }
}

function extractContentPartnerPreviewUrl(message) {
  const direct = message?.content_attributes?.map_content_partner_preview_url
  if (isSafeContentPartnerPreviewUrl(direct)) return direct

  const content = String(message?.content || '')
  const match = content.match(/https:\/\/[^\s)]+\/api\/content-partner\/previews\/[^\s)]+\.(?:svg|png)\?token=[^\s)]+/i)
  const url = match?.[0]?.replace(/[.,;]+$/, '')
  return isSafeContentPartnerPreviewUrl(url) ? url : ''
}

function attachmentImageUrl(attachment) {
  return String(
    attachment?.data_url
    || attachment?.download_url
    || attachment?.file_url
    || attachment?.thumb_url
    || attachment?.thumbnail
    || attachment?.url
    || '',
  ).trim()
}

function imageAttachmentsForMessage(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  return attachments
    .map((attachment) => {
      const url = attachmentImageUrl(attachment)
      const fileType = String(attachment?.file_type || attachment?.content_type || '').toLowerCase()
      const name = String(attachment?.file_name || attachment?.filename || '').toLowerCase()
      const looksLikeImage = fileType.startsWith('image')
        || fileType === 'image'
        || /\.(png|jpe?g|webp|gif|bmp)(?:$|\?)/i.test(url)
        || /\.(png|jpe?g|webp|gif|bmp)$/.test(name)
      return url && looksLikeImage ? { ...attachment, url } : null
    })
    .filter(Boolean)
}

function messageDisplayContent(message, previewUrl) {
  const fallback = previewUrl ? 'Publisher draft preview is ready.' : '[Attachment or system message]'
  let content = String(message?.content || '').trim()
  if (previewUrl) {
    const previewImagePattern = new RegExp(`\\n*!\\[[^\\]]*\\]\\(${escapeRegExp(previewUrl)}(?:[&?]cw_image_height=[^)\\s]+)?\\)`, 'i')
    content = content
      .replace(previewImagePattern, '')
      .replace(new RegExp(`\\n*Preview image:\\s*${escapeRegExp(previewUrl)}`, 'i'), '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return content || fallback
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

function conversationInitials(conversation) {
  const title = conversationTitle(conversation)
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'C'
}

function inboxName(conversation, inboxes = []) {
  const match = inboxes.find((inbox) => String(inbox.id) === String(conversation?.inbox_id))
  return match?.name || conversation?.channel || 'Inbox'
}

function channelBadge(conversation, inboxes = []) {
  const name = inboxName(conversation, inboxes).toLowerCase()
  if (name.includes('instagram')) return { label: 'IG', style: { background: '#c13584', color: '#fff' } }
  if (name.includes('facebook')) return { label: 'FB', style: { background: '#1b74e4', color: '#fff' } }
  if (name.includes('tiktok')) return { label: 'TT', style: { background: '#111827', color: '#fff' } }
  if (name.includes('linkedin')) return { label: 'IN', style: { background: '#0a66c2', color: '#fff' } }
  if (name.includes('website') || name.includes('chat')) return { label: 'WEB', style: { background: '#20a67a', color: '#fff' } }
  return { label: 'MSG', style: { background: '#64748b', color: '#fff' } }
}

function ticketStepState(selectedConversation, step) {
  const status = selectedConversation?.status || 'open'
  if (status === 'resolved') return 'done'
  if (step <= 2) return 'done'
  if (status === 'pending' && step === 4) return 'next'
  if (status === 'open' && step === 3) return 'next'
  return 'waiting'
}

function TicketStage({ state, number, title, detail }) {
  const styles = {
    done: { background: '#22a06b', color: '#fff' },
    next: { background: '#2377ff', color: '#fff' },
    waiting: { background: '#aeb8c5', color: '#fff' },
  }

  return (
    <div className="grid grid-cols-[20px_1fr] gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'rgba(220,227,236,0.9)' }}>
      <div className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black" style={styles[state]}>
        {state === 'done' ? <Check className="h-3 w-3" /> : number}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>{title}</p>
        <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--portal-text-muted)' }}>{detail}</p>
      </div>
    </div>
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
          Use the Chatwoot mobile app with installation URL {CHATWOOT_WORKSPACE_HOST}.
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
  const [mobileEmailStatus, setMobileEmailStatus] = useState(null)
  const [sendingMobileEmail, setSendingMobileEmail] = useState(false)
  if (!open) return null

  const settings = websiteChat?.settings || {}
  const snippet = websiteChat?.installSnippet || settings.install_snippet || ''
  const installed = settings.install_status === 'detected'
  const workspaceUrl = CHATWOOT_WORKSPACE_URL
  const loginEmail = userEmail || 'your MAP login email'

  async function copyText(label, value) {
    if (!value) return
    await navigator.clipboard?.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1800)
  }

  async function handleSendMobileEmail() {
    setSendingMobileEmail(true)
    setMobileEmailStatus(null)
    try {
      await sendMobileSetupEmail()
      setMobileEmailStatus({
        type: 'success',
        message: `Mobile inbox setup email sent to ${loginEmail}. It should come from inbox@myautomationpartner.com.`,
      })
    } catch (error) {
      setMobileEmailStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not send the mobile inbox setup email.',
      })
    } finally {
      setSendingMobileEmail(false)
    }
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
                  <button
                    type="button"
                    onClick={handleSendMobileEmail}
                    disabled={sendingMobileEmail}
                    className="portal-button-primary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendingMobileEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    Send mobile setup email
                  </button>
                  <a href={CHATWOOT_IOS_URL} target="_blank" rel="noopener noreferrer" className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
                    iPhone app
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                  <a href={CHATWOOT_ANDROID_URL} target="_blank" rel="noopener noreferrer" className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold">
                    Android app
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
                {mobileEmailStatus && (
                  <p
                    className="mt-3 rounded-xl border px-3 py-2 text-xs font-semibold"
                    style={mobileEmailStatus.type === 'success'
                      ? { borderColor: 'rgba(47,143,87,0.28)', background: 'rgba(47,143,87,0.1)', color: '#2f8f57' }
                      : { borderColor: 'rgba(196,85,110,0.2)', background: 'rgba(196,85,110,0.08)', color: '#a83f58' }}
                  >
                    {mobileEmailStatus.message}
                  </p>
                )}
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
                  <p>Download Chatwoot, enter the workspace URL, then click Send mobile setup email if you need a Chatwoot password link. The email is only for mobile inbox access.</p>
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

function PhoneSetupStep({ number, title, detail }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ background: '#eef5ff', color: '#2377ff' }}>
        {number}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{title}</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>{detail}</p>
      </div>
    </div>
  )
}

function PhoneSetupCard({ title, storeLabel, storeUrl, steps }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--portal-border)', background: '#fff' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{title}</h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>Official Chatwoot mobile app</p>
        </div>
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="portal-button-primary inline-flex shrink-0 items-center gap-2 px-3 py-2 text-xs font-semibold"
        >
          {storeLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <PhoneSetupStep key={step.title} number={index + 1} title={step.title} detail={step.detail} />
        ))}
      </div>
    </div>
  )
}

function PhoneSetupModal({ open, onClose, userEmail }) {
  const [copied, setCopied] = useState('')
  const [mobileEmailStatus, setMobileEmailStatus] = useState(null)
  const [sendingMobileEmail, setSendingMobileEmail] = useState(false)
  if (!open) return null

  const loginEmail = userEmail || 'your MAP login email'
  const setupUrl = mobileSetupUrl()

  async function copyText(label, value) {
    if (!value) return
    await navigator.clipboard?.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1800)
  }

  async function handleSendMobileEmail() {
    setSendingMobileEmail(true)
    setMobileEmailStatus(null)
    try {
      await sendMobileSetupEmail()
      setMobileEmailStatus({
        type: 'success',
        message: `Mobile inbox setup email sent to ${loginEmail}. It should come from inbox@myautomationpartner.com.`,
      })
    } catch (error) {
      setMobileEmailStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not send the mobile inbox setup email.',
      })
    } finally {
      setSendingMobileEmail(false)
    }
  }

  const sharedSteps = [
    {
      title: 'Enter the workspace URL',
      detail: `Use ${CHATWOOT_WORKSPACE_HOST}. The official app asks for this before login.`,
    },
    {
      title: 'Log in with your MAP email',
      detail: `Use ${loginEmail}. If you do not know your Chatwoot password, send the mobile setup email below.`,
    },
    {
      title: 'Allow notifications',
      detail: 'Turn on push notifications so customer messages reach you even when you are not in the portal.',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="portal-panel max-h-[92vh] w-full max-w-5xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b p-5 md:p-6" style={{ borderColor: 'var(--portal-border)' }}>
          <div>
            <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
              Phone setup
            </span>
            <h2 className="mt-3 text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Set up phone notifications
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              Recommended before going live. The portal handles setup and scheduling, but your phone is how you catch and reply to customer inquiries quickly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="portal-button-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center"
            aria-label="Close phone setup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="portal-scroll max-h-[calc(92vh-112px)] overflow-y-auto p-5 md:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(35,119,255,0.2)', background: '#f5f9ff' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--portal-text-soft)' }}>Workspace URL</p>
                    <p className="mt-1 break-all text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>{CHATWOOT_WORKSPACE_HOST}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText('workspace', CHATWOOT_WORKSPACE_HOST)}
                    className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy URL
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <PhoneSetupCard
                  title="iPhone setup"
                  storeLabel="App Store"
                  storeUrl={CHATWOOT_IOS_URL}
                  steps={[
                    { title: 'Install Chatwoot from the App Store', detail: 'Open the App Store button, install Chatwoot, then return here for the workspace URL.' },
                    ...sharedSteps,
                  ]}
                />
                <PhoneSetupCard
                  title="Android setup"
                  storeLabel="Play Store"
                  storeUrl={CHATWOOT_ANDROID_URL}
                  steps={[
                    { title: 'Install Chatwoot from Google Play', detail: 'Open the Play Store button, install Chatwoot, then return here for the workspace URL.' },
                    ...sharedSteps,
                  ]}
                />
              </div>

              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--portal-border)', background: '#fff' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Need a password link?</h3>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                      Send the Chatwoot mobile setup email to {loginEmail}. This is only for mobile inbox access.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendMobileEmail}
                    disabled={sendingMobileEmail}
                    className="portal-button-primary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendingMobileEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    Send setup email
                  </button>
                </div>
                {mobileEmailStatus && (
                  <p
                    className="mt-3 rounded-xl border px-3 py-2 text-xs font-semibold"
                    style={mobileEmailStatus.type === 'success'
                      ? { borderColor: 'rgba(47,143,87,0.28)', background: 'rgba(47,143,87,0.1)', color: '#2f8f57' }
                      : { borderColor: 'rgba(196,85,110,0.2)', background: 'rgba(196,85,110,0.08)', color: '#a83f58' }}
                  >
                    {mobileEmailStatus.message}
                  </p>
                )}
              </div>
            </div>

            <aside className="rounded-xl border p-4" style={{ borderColor: 'var(--portal-border)', background: '#fff' }}>
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Scan with your phone</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                Open this setup guide on your phone, then install the app and copy the workspace URL without typing.
              </p>
              <div className="mt-4 rounded-xl border bg-white p-3" style={{ borderColor: 'var(--portal-border)' }}>
                <img
                  src={qrImageUrl(setupUrl)}
                  alt="QR code for phone setup"
                  className="mx-auto h-[220px] w-[220px]"
                />
              </div>
              <button
                type="button"
                onClick={() => copyText('setup-link', setupUrl)}
                className="portal-button-secondary mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-semibold"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy setup link
              </button>
              {copied && (
                <p className="mt-3 rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'rgba(47,143,87,0.28)', background: 'rgba(47,143,87,0.1)', color: '#2f8f57' }}>
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
  const [phoneSetupOpen, setPhoneSetupOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('phoneSetup') === '1'
  })

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

  const contentPartnerMutation = useMutation({
    mutationFn: openContentPartnerConversation,
    onSuccess: async (payload) => {
      setStatus('open')
      setQuery('')
      setInboxId('')
      setSelectedId(payload.conversationId || null)
      setMobileThreadOpen(true)
      await queryClient.invalidateQueries({ queryKey: ['chatwoot-conversations'] })
      if (payload.conversationId) {
        await queryClient.invalidateQueries({ queryKey: ['chatwoot-messages', payload.conversationId] })
      }
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
    <div className="portal-page w-full max-w-none space-y-3 p-0 md:p-4 xl:p-5">
      <section className="portal-panel overflow-hidden">
        <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:px-5" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)' }}>
          <div className="flex min-w-0 items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold leading-tight tracking-normal" style={{ color: 'var(--portal-text)' }}>Inbox</h1>
              <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--portal-text-muted)' }}>
                Website chat and social messages in one customer-service queue.
              </p>
            </div>
            <StatusPill status={status} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--portal-text-soft)' }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search messages"
                className="portal-input h-9 w-[240px] rounded-full pl-9 pr-3 text-sm lg:w-[340px]"
              />
            </div>
            <button
              type="button"
              onClick={() => setPhoneSetupOpen(true)}
              className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold"
            >
              <Smartphone className="h-4 w-4" />
              Set Up Phone
            </button>
            <button
              type="button"
              onClick={() => contentPartnerMutation.mutate()}
              disabled={contentPartnerMutation.isPending}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: 'rgba(145,86,255,0.35)',
                background: 'linear-gradient(135deg, #7c3cff, #d977ff)',
                color: '#fff',
                boxShadow: '0 12px 28px rgba(124,60,255,0.22)',
              }}
            >
              {contentPartnerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Content Partner
            </button>
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="portal-button-primary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold"
            >
              <Settings className="h-4 w-4" />
              Setup Inbox
            </button>
            <button
              type="button"
              onClick={() => conversationsQuery.refetch()}
              className="portal-button-secondary inline-flex h-9 w-9 items-center justify-center"
              aria-label="Refresh inbox"
            >
              <RefreshCw className={`h-4 w-4 ${conversationsQuery.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <SetupInboxModal
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          websiteChat={websiteChatQuery.data}
          websiteChatLoading={websiteChatQuery.isLoading || websiteChatQuery.isFetching}
          userEmail={userQuery.data?.email || ''}
        />

        <PhoneSetupModal
          open={phoneSetupOpen}
          onClose={() => setPhoneSetupOpen(false)}
          userEmail={userQuery.data?.email || ''}
        />

        <MobileAppBanner />
        <ErrorBanner message={contentPartnerMutation.error?.message || conversationsQuery.error?.message || inboxesQuery.error?.message || messagesQuery.error?.message} />

        <div className="grid min-h-[calc(100vh-150px)] lg:grid-cols-[324px_minmax(0,1fr)_300px]">
          <aside className={`${mobileThreadOpen ? 'hidden lg:flex' : 'flex'} min-h-[calc(100vh-150px)] flex-col border-r bg-white`} style={{ borderColor: 'var(--portal-border)' }}>
            <div className="border-b px-3 py-3" style={{ borderColor: 'var(--portal-border)' }}>
              <div className="relative mb-3 sm:hidden">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--portal-text-soft)' }} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search messages"
                  className="portal-input h-10 rounded-full pl-9 pr-3 text-sm"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setStatus(option.value)
                      setSelectedId(null)
                    }}
                    className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors"
                    style={status === option.value ? { background: '#162033', borderColor: '#162033', color: '#fff' } : { background: '#fff', borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}
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
                className="portal-input mt-2 h-9 px-3 text-xs"
              >
                <option value="">All inboxes</option>
                {(inboxesQuery.data || []).map((inbox) => (
                  <option key={inbox.id} value={inbox.id}>
                    {inbox.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between border-b px-4 py-2 text-xs" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
              <span>{totalCount} conversations</span>
              <span>{conversationsQuery.isFetching ? 'Syncing' : 'Live'}</span>
            </div>

            <div className="portal-scroll flex-1 overflow-y-auto">
              {conversationsQuery.isLoading ? (
                <div className="flex h-52 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
                </div>
              ) : conversations.length === 0 ? (
                <EmptyState title="No conversations here" detail="When customers write in, their conversations will appear in this queue." />
              ) : (
                conversations.map((conversation) => {
                  const badge = channelBadge(conversation, inboxesQuery.data || [])
                  const isActive = activeConversationId === conversation.id
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => handleSelect(conversation.id)}
                      className="grid w-full grid-cols-[44px_1fr_auto] gap-3 border-l-[3px] px-3 py-3 text-left transition-colors hover:bg-slate-50"
                      style={{
                        borderLeftColor: isActive ? '#2377ff' : 'transparent',
                        background: isActive ? '#eef5ff' : '#fff',
                      }}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#2377ff] to-[#65d6a8] text-sm font-black text-white">
                        {conversationInitials(conversation)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                            {conversationTitle(conversation)}
                          </p>
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={badge.style}>{badge.label}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                          {conversationPreview(conversation)}
                        </p>
                        <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--portal-text-soft)' }}>
                          {conversationSubtitle(conversation)}
                        </p>
                      </div>
                      <div className="text-right text-[11px]" style={{ color: 'var(--portal-text-soft)' }}>
                        <span>{formatRelativeTime(conversation.last_activity_at || conversation.updated_at)}</span>
                        {conversation.unread_count > 0 && (
                          <span className="ml-auto mt-2 block h-2.5 w-2.5 rounded-full" style={{ background: '#2377ff' }} />
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          <main className={`${mobileThreadOpen ? 'flex' : 'hidden lg:flex'} min-h-[calc(100vh-150px)] min-w-0 flex-col`} style={{ background: '#f9fbfe' }}>
            {selectedConversation ? (
              <>
                <div className="flex min-h-[72px] items-center justify-between gap-3 border-b bg-white/95 px-4 py-3 md:px-5" style={{ borderColor: 'var(--portal-border)' }}>
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMobileThreadOpen(false)}
                      className="portal-button-secondary inline-flex h-9 w-9 items-center justify-center lg:hidden"
                      aria-label="Back to conversations"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2377ff] to-[#65d6a8] text-sm font-black text-white">
                      {conversationInitials(selectedConversation)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
                          {conversationTitle(selectedConversation)}
                        </p>
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={channelBadge(selectedConversation, inboxesQuery.data || []).style}>
                          {channelBadge(selectedConversation, inboxesQuery.data || []).label}
                        </span>
                      </div>
                      <p className="truncate text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                        {inboxName(selectedConversation, inboxesQuery.data || [])} · {conversationSubtitle(selectedConversation)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={selectedConversation.status} />
                    <a
                      href={openChatwootUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-button-secondary hidden h-9 items-center gap-2 px-3 text-xs font-semibold md:inline-flex"
                    >
                      Chatwoot
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                <div className="portal-scroll flex-1 overflow-y-auto px-3 py-4 md:px-6">
                  {messagesQuery.isLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--portal-primary)' }} />
                    </div>
                  ) : messages.length === 0 ? (
                    <EmptyState title="No messages loaded" detail="This conversation is selected, but Chatwoot has not returned message history yet." />
                  ) : (
                    <div className="mx-auto max-w-[900px] space-y-2">
                      <div className="mx-auto mb-4 w-fit rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: '#e9eef5', color: '#7b8797' }}>
                        Today
                      </div>
                      {messages.map((message) => {
                        const outgoing = isOutgoing(message)
                        const previewUrl = extractContentPartnerPreviewUrl(message)
                        const imageAttachments = previewUrl ? [] : imageAttachmentsForMessage(message)
                        const displayContent = messageDisplayContent(message, previewUrl)
                        return (
                          <div key={message.id || `${message.created_at}-${message.content}`} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[84%] md:max-w-[72%] ${outgoing ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                              <div
                                className="px-4 py-2.5 text-sm leading-relaxed shadow-sm"
                                style={{
                                  borderRadius: outgoing ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
                                  background: outgoing ? '#2478ff' : '#eef2f7',
                                  color: outgoing ? '#fff' : 'var(--portal-text)',
                                }}
                              >
                                {message.private && (
                                  <span className="mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: outgoing ? 'rgba(255,255,255,0.18)' : 'rgba(100,116,139,0.12)' }}>
                                    <StickyNote className="h-3 w-3" />
                                    Note
                                  </span>
                                )}
                                <p className="whitespace-pre-wrap break-words">
                                  {displayContent}
                                </p>
                                {previewUrl && (
                                  <a
                                    href={previewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 block overflow-hidden rounded-2xl border bg-white shadow-sm"
                                    style={{ borderColor: outgoing ? 'rgba(255,255,255,0.35)' : 'var(--portal-border)' }}
                                  >
                                    <img
                                      src={previewUrl}
                                      alt="Publisher draft preview"
                                      className="block w-full max-w-[560px] bg-[#f2eee6]"
                                      loading="lazy"
                                    />
                                  </a>
                                )}
                                {imageAttachments.map((attachment, index) => (
                                  <a
                                    key={attachment.id || attachment.url || index}
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 block overflow-hidden rounded-2xl border bg-white shadow-sm"
                                    style={{ borderColor: outgoing ? 'rgba(255,255,255,0.35)' : 'var(--portal-border)' }}
                                  >
                                    <img
                                      src={attachment.url}
                                      alt={attachment.file_name || attachment.filename || 'Message attachment'}
                                      className="block w-full max-w-[560px] bg-white"
                                      loading="lazy"
                                    />
                                  </a>
                                ))}
                              </div>
                              <span className="px-1.5 text-[11px]" style={{ color: 'var(--portal-text-muted)' }}>
                                {senderName(message)} · {formatRelativeTime(message.created_at)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="border-t bg-white/95 p-3 md:p-4" style={{ borderColor: 'var(--portal-border)' }}>
                  <div className="mx-auto grid max-w-[980px] grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-full border bg-white p-2" style={{ borderColor: 'var(--portal-border)' }}>
                    <button
                      type="button"
                      onClick={() => setIsPrivate((value) => !value)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold"
                      style={isPrivate ? { borderColor: '#2377ff', background: '#eef5ff', color: '#2377ff' } : { borderColor: 'var(--portal-border)', background: '#f8fafc', color: 'var(--portal-text-muted)' }}
                      aria-label="Toggle private note"
                    >
                      <StickyNote className="h-4 w-4" />
                    </button>
                    <input
                      value={composer}
                      onChange={(event) => setComposer(event.target.value)}
                      placeholder={isPrivate ? 'Write an internal note...' : `Message ${conversationTitle(selectedConversation)}...`}
                      className="min-h-9 w-full border-0 bg-transparent px-1 text-sm outline-none"
                      style={{ color: 'var(--portal-text)' }}
                    />
                    <button
                      type="button"
                      className="hidden h-9 rounded-full border px-3 text-xs font-bold sm:inline-flex sm:items-center"
                      style={{ borderColor: 'var(--portal-border)', background: '#f8fafc', color: 'var(--portal-text-muted)' }}
                    >
                      Saved Reply
                    </button>
                    <button
                      type="submit"
                      disabled={!composer.trim() || replyMutation.isPending}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: '#2377ff' }}
                      aria-label="Send reply"
                    >
                      {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                  <ErrorBanner message={replyMutation.error?.message} />
                </form>
              </>
            ) : (
              <EmptyState title="Select a conversation" detail="Choose a customer conversation to read history, reply, add a private note, or update status." />
            )}
          </main>

          <aside className="hidden min-h-[calc(100vh-150px)] border-l bg-white p-4 lg:block" style={{ borderColor: 'var(--portal-border)' }}>
            <div className="mb-3 rounded-lg border p-3" style={{ borderColor: 'var(--portal-border)' }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Ticket Flow</h2>
                <StatusPill status={selectedConversation?.status || status} />
              </div>
              <TicketStage
                state={ticketStepState(selectedConversation, 1)}
                number="1"
                title="Message received"
                detail={`${selectedConversation ? inboxName(selectedConversation, inboxesQuery.data || []) : 'Inbox'} · ${formatRelativeTime(selectedConversation?.last_activity_at || selectedConversation?.updated_at)}`}
              />
              <TicketStage
                state={ticketStepState(selectedConversation, 2)}
                number="2"
                title="Customer identified"
                detail={selectedConversation ? conversationSubtitle(selectedConversation) : 'Waiting for customer'}
              />
              <TicketStage
                state={ticketStepState(selectedConversation, 3)}
                number="3"
                title="Needs reply"
                detail={selectedConversation?.status === 'open' ? 'Reply or add a private note' : 'No active reply needed'}
              />
              <TicketStage
                state={ticketStepState(selectedConversation, 4)}
                number="4"
                title="Close or follow up"
                detail={selectedConversation?.status === 'pending' ? 'Waiting on customer' : 'Resolve when handled'}
              />
            </div>

            <div className="mb-3 rounded-lg border p-3" style={{ borderColor: 'var(--portal-border)' }}>
              <div className="grid gap-2 text-xs">
                <div className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: 'rgba(220,227,236,0.9)' }}>
                  <span style={{ color: 'var(--portal-text-muted)' }}>Priority</span>
                  <b style={{ color: 'var(--portal-text)' }}>Normal</b>
                </div>
                <div className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: 'rgba(220,227,236,0.9)' }}>
                  <span style={{ color: 'var(--portal-text-muted)' }}>Source</span>
                  <b className="text-right" style={{ color: 'var(--portal-text)' }}>{selectedConversation ? inboxName(selectedConversation, inboxesQuery.data || []) : 'Inbox'}</b>
                </div>
                <div className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: 'rgba(220,227,236,0.9)' }}>
                  <span style={{ color: 'var(--portal-text-muted)' }}>Owner</span>
                  <b style={{ color: 'var(--portal-text)' }}>Customer team</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--portal-text-muted)' }}>SLA</span>
                  <b style={{ color: 'var(--portal-text)' }}>{selectedConversation?.status === 'open' ? 'Reply soon' : 'On track'}</b>
                </div>
              </div>
            </div>

            <div className="mb-3 rounded-lg border p-3" style={{ borderColor: 'var(--portal-border)' }}>
              <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Status</p>
              <div className="grid gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!activeConversationId || statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ conversationId: activeConversationId, status: option.value })}
                    className="portal-button-secondary inline-flex h-9 items-center justify-between px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>{option.label}</span>
                    {selectedConversation?.status === option.value && <CheckCircle2 className="h-4 w-4" style={{ color: '#22a06b' }} />}
                  </button>
                ))}
              </div>
              <ErrorBanner message={statusMutation.error?.message} />
            </div>

            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--portal-border)' }}>
              <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="portal-button-secondary h-9 px-2 text-xs font-semibold">Saved Reply</button>
                <button type="button" className="portal-button-secondary h-9 px-2 text-xs font-semibold">Add Note</button>
                <button type="button" className="portal-button-secondary h-9 px-2 text-xs font-semibold">Mark Lead</button>
                <a
                  href={mobileStoreUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-button-secondary inline-flex h-9 items-center justify-center gap-1 px-2 text-xs font-semibold"
                >
                  Mobile
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
