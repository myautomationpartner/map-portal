import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MessageSquare, Smartphone, ArrowUpRight, ShieldCheck, Loader2 } from 'lucide-react'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchClientProfile() {
  const { data, error } = await supabase
    .from('users')
    .select('*, clients(*)')
    .single()
  if (error) throw error
  return data
}

// ── Platform detection & deep-link logic ─────────────────────────────────────

function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function openTidio(tidioUrl) {
  if (!isMobile()) {
    window.open(tidioUrl, '_blank', 'noopener,noreferrer')
    return
  }

  const appStoreUrl = isIOS()
    ? 'https://apps.apple.com/app/tidio-live-chat/id1024407395'
    : 'https://play.google.com/store/apps/details?id=com.tidio.tidio'

  const deepLink = 'tidio://'
  const fallbackTimer = setTimeout(() => {
    window.location.href = appStoreUrl
  }, 1500)

  window.addEventListener('blur', () => clearTimeout(fallbackTimer), { once: true })
  window.location.href = deepLink
}

// ── Mobile nudge banner ──────────────────────────────────────────────────────

function MobileAppBanner() {
  if (!isMobile()) return null

  const storeUrl = isIOS()
    ? 'https://apps.apple.com/app/tidio-live-chat/id1024407395'
    : 'https://play.google.com/store/apps/details?id=com.tidio.tidio'

  return (
    <div className="portal-status-info mb-6 flex items-start gap-4 rounded-2xl px-5 py-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.2)' }}>
        <Smartphone className="w-4 h-4" style={{ color: 'var(--portal-primary)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="mb-0.5 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Tidio Mobile App</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
          For the best experience, reply to messages directly from the Tidio app.
        </p>
      </div>
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 flex items-center gap-1 text-xs font-semibold transition-colors"
        style={{ color: 'var(--portal-primary)' }}
      >
        Get App
        <ArrowUpRight className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Inbox() {
  useOutletContext()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchClientProfile,
  })

  const client = profile?.clients
  const tidioUrl = client?.tidio_project_url || 'https://www.tidio.com/panel/'
  const tidioConnected = !!client?.tidio_project_url

  return (
    <div className="portal-page mx-auto max-w-[1180px] space-y-6 md:p-6 xl:p-8">
      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Inbox
              </span>
            </div>
            <h1 className="portal-page-title font-display">Inbox</h1>
          </div>
        </div>
      </section>

      {/* Mobile nudge */}
      <MobileAppBanner />

      {/* Main card */}
      {isLoading ? (
        <div className="portal-panel flex h-72 items-center justify-center rounded-[32px] p-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--portal-primary)' }} />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_340px]">
          <div className="portal-panel overflow-hidden rounded-[34px]">
            <div className="border-b px-6 py-5" style={{ borderColor: 'var(--portal-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Unified conversations</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                Open Tidio to manage website, Facebook, and Instagram messages in one place.
              </p>
            </div>

            <div className="p-8 md:p-10 flex flex-col md:flex-row items-center gap-10">

              {/* Icon side */}
              <div className="flex-1 flex justify-center">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <div className="w-28 h-28 rounded-3xl flex items-center justify-center -rotate-3"
                    style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)' }}>
                    <MessageSquare className="w-14 h-14" style={{ color: 'var(--portal-primary)' }} strokeWidth={1.5} />
                  </div>
                </div>
              </div>

              {/* Content side */}
              <div className="flex-[1.5] flex flex-col items-center md:items-start text-center md:text-left w-full">
                <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: 'var(--portal-text)' }}>
                  All Channels, One View
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mb-8">
                  {['Website Visitors', 'Facebook Messenger', 'Instagram Direct'].map((label, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm rounded-xl py-2 px-3"
                      style={{ background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)' }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(107,193,142,0.12)', border: '1px solid rgba(107,193,142,0.2)' }}>
                        <ShieldCheck className="w-3 h-3" style={{ color: '#2f8f57' }} />
                      </div>
                      <span className="truncate">{label}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => openTidio(tidioUrl)}
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-sm font-semibold transition-all duration-200 hover:-translate-y-px hover:shadow-lg w-full sm:w-auto"
                  style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}
                >
                  Open Inbox
                  <ArrowUpRight className="w-4 h-4" />
                </button>

                {!tidioConnected && (
                  <p className="mt-4 text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ color: 'var(--portal-primary)', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--portal-primary)' }} />
                    Tidio configuration needed
                  </p>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <section className="portal-panel rounded-[34px] overflow-hidden">
              <div className="border-b px-5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--portal-text)' }}>Connection</h2>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Status</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {tidioConnected ? 'Connected' : 'Needs configuration'}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                    {tidioConnected ? 'Your team can open the linked Tidio workspace.' : 'A project URL has not been saved yet for this client.'}
                  </p>
                </div>

                <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.86)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Workspace URL</p>
                  <a
                    href={tidioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-sm font-semibold"
                    style={{ color: 'var(--portal-primary)' }}
                  >
                    Open Tidio
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}
