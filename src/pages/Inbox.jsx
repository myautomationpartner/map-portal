import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Inbox as InboxIcon,
  Loader2,
  MessageCircle,
  MessagesSquare,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const DEFAULT_CHATWOOT_APP_URL = 'https://chatwoot.myautomationpartner.com/app'
const CHATWOOT_APP_URL = stripTrailingSlash(import.meta.env.VITE_CHATWOOT_APP_URL || DEFAULT_CHATWOOT_APP_URL)
const CHATWOOT_LOGIN_URL = `${CHATWOOT_APP_URL}/login`
const CHATWOOT_MOBILE_APPS_URL = import.meta.env.VITE_CHATWOOT_MOBILE_APPS_URL || 'https://www.chatwoot.com/mobile-apps'
const CHATWOOT_IOS_URL = import.meta.env.VITE_CHATWOOT_IOS_URL || 'https://apps.apple.com/us/app/chatwoot/id1495796682'
const CHATWOOT_ANDROID_URL = import.meta.env.VITE_CHATWOOT_ANDROID_URL || 'https://play.google.com/store/apps/details?id=com.chatwoot.app'

const CORE_CHANNELS = [
  { label: 'Website chat', detail: 'Live widget and contact capture', status: 'Ready' },
  { label: 'Facebook Messenger', detail: 'Meta inbox once connected', status: 'Phase 1' },
  { label: 'Instagram Direct', detail: 'DMs and customer replies', status: 'Phase 1' },
  { label: 'TikTok messaging', detail: 'Business messaging when approved', status: 'Approval' },
]

const CUSTOMER_WORKFLOW = [
  'Open the inbox on desktop for longer replies and team review',
  'Use the mobile app for same-day customer service and notifications',
  'Keep publishing, campaigns, and content approval inside the MAP portal',
  'LinkedIn replies stay in LinkedIn until direct inbox access is approved',
]

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchClientProfile() {
  const { data, error } = await supabase
    .from('users')
    .select('*, clients(*)')
    .single()
  if (error) throw error
  return data
}

// ── Runtime helpers ──────────────────────────────────────────────────────────

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function resolveInboxConfig(client) {
  const legacyUrl = stripTrailingSlash(client?.tidio_project_url || '')
  const legacyIsTidio = /tidio\.com/i.test(legacyUrl)
  const workspaceUrl = legacyUrl && !legacyIsTidio ? legacyUrl : CHATWOOT_APP_URL

  return {
    workspaceUrl,
    loginUrl: workspaceUrl.endsWith('/app') ? `${workspaceUrl}/login` : CHATWOOT_LOGIN_URL,
    hasClientOverride: Boolean(legacyUrl && !legacyIsTidio),
    ignoredLegacyTidioUrl: Boolean(legacyUrl && legacyIsTidio),
  }
}

function openInbox(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function mobileStoreUrl() {
  if (!isMobile()) return CHATWOOT_MOBILE_APPS_URL
  return isIOS() ? CHATWOOT_IOS_URL : CHATWOOT_ANDROID_URL
}

// ── Mobile nudge banner ──────────────────────────────────────────────────────

function MobileAppBanner({ workspaceUrl }) {
  if (!isMobile()) return null

  return (
    <div className="portal-status-info mb-6 flex items-start gap-4 rounded-2xl px-5 py-4">
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.2)' }}
      >
        <Smartphone className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
          Mobile customer service
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
          Install the Chatwoot app, then sign in with this workspace URL: {workspaceUrl}
        </p>
      </div>
      <a
        href={mobileStoreUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-1 text-xs font-semibold transition-colors"
        style={{ color: 'var(--portal-primary)' }}
      >
        Get App
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

function StatusPill({ children, tone = 'ready' }) {
  const styles = tone === 'ready'
    ? { background: 'rgba(107,193,142,0.12)', border: '1px solid rgba(107,193,142,0.22)', color: '#2f8f57' }
    : { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.22)', color: 'var(--portal-primary)' }

  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold" style={styles}>
      {children}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Inbox() {
  useOutletContext()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchClientProfile,
  })

  const client = profile?.clients
  const inboxConfig = resolveInboxConfig(client)

  return (
    <div className="portal-page mx-auto max-w-[1180px] space-y-6 md:p-6 xl:p-8">
      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Partner Inbox
              </span>
              <StatusPill>Mobile ready</StatusPill>
            </div>
            <h1 className="portal-page-title font-display">Inbox</h1>
          </div>
        </div>
      </section>

      <MobileAppBanner workspaceUrl={inboxConfig.workspaceUrl} />

      {isLoading ? (
        <div className="portal-panel flex h-72 items-center justify-center rounded-[32px] p-8">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--portal-primary)' }} />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="portal-panel overflow-hidden rounded-[34px]">
            <div className="border-b px-6 py-5" style={{ borderColor: 'var(--portal-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
                Customer conversations
              </h2>
              <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                Website, Facebook, Instagram, and approved TikTok customer messages move through the MAP inbox workspace.
              </p>
            </div>

            <div className="grid gap-8 p-6 md:grid-cols-[220px_minmax(0,1fr)] md:p-8">
              <div className="flex items-center justify-center">
                <div
                  className="flex h-40 w-40 items-center justify-center rounded-[32px]"
                  style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)' }}
                >
                  <MessagesSquare className="h-16 w-16" style={{ color: 'var(--portal-primary)' }} strokeWidth={1.5} />
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-6 grid gap-3 sm:grid-cols-2">
                  {CORE_CHANNELS.map((channel) => (
                    <div
                      key={channel.label}
                      className="rounded-[24px] border p-4"
                      style={{ background: 'rgba(255,255,255,0.86)', borderColor: 'var(--portal-border)' }}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <MessageCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--portal-primary)' }} />
                        <StatusPill tone={channel.status === 'Ready' || channel.status === 'Phase 1' ? 'ready' : 'pending'}>
                          {channel.status}
                        </StatusPill>
                      </div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                        {channel.label}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                        {channel.detail}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => openInbox(inboxConfig.workspaceUrl)}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-2xl px-7 py-4 text-sm font-semibold transition-all duration-200 hover:-translate-y-px hover:shadow-lg sm:w-auto"
                    style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}
                  >
                    Open Inbox
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                  <a
                    href={mobileStoreUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border px-7 py-4 text-sm font-semibold transition-colors sm:w-auto"
                    style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)', background: 'rgba(255,255,255,0.84)' }}
                  >
                    Mobile App
                    <Smartphone className="h-4 w-4" />
                  </a>
                </div>

                {inboxConfig.ignoredLegacyTidioUrl && (
                  <p
                    className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
                    style={{ color: 'var(--portal-primary)', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    Legacy Tidio URL detected; MAP is using the Chatwoot workspace.
                  </p>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <section className="portal-panel overflow-hidden rounded-[34px]">
              <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
                  Workspace
                </h2>
              </div>
              <div className="space-y-4 p-5">
                <div
                  className="rounded-[24px] border p-4"
                  style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)' }}
                >
                  <div className="flex items-center gap-3">
                    <InboxIcon className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                      MAP support inbox
                    </p>
                  </div>
                  <p className="mt-2 break-all text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    {inboxConfig.workspaceUrl}
                  </p>
                  <a
                    href={inboxConfig.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
                    style={{ color: 'var(--portal-primary)' }}
                  >
                    Sign in
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                <div
                  className="rounded-[24px] border p-4"
                  style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)' }}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <MonitorSmartphone className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                      Mobile priority
                    </p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    Customer service is the daily mobile workflow. Publishing and campaign planning can stay desktop-first.
                  </p>
                </div>
              </div>
            </section>

            <section className="portal-panel overflow-hidden rounded-[34px]">
              <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
                  Workflow
                </h2>
              </div>
              <div className="space-y-3 p-5">
                {CUSTOMER_WORKFLOW.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm">
                    {item.startsWith('LinkedIn') ? (
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--portal-primary)' }} />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#2f8f57' }} />
                    )}
                    <span style={{ color: 'var(--portal-text-muted)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}
