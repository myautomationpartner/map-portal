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
    <div className="rounded-2xl px-5 py-4 flex items-start gap-4 mb-6"
      style={{ background: 'rgba(212,168,58,0.07)', border: '1px solid rgba(212,168,58,0.18)' }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'rgba(212,168,58,0.12)', border: '1px solid rgba(212,168,58,0.2)' }}>
        <Smartphone className="w-4 h-4" style={{ color: '#d4a83a' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold mb-0.5" style={{ color: '#f8f2e4' }}>Tidio Mobile App</p>
        <p className="text-xs leading-relaxed" style={{ color: '#8a7858' }}>
          For the best experience, reply to messages directly from the Tidio app.
        </p>
      </div>
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 flex items-center gap-1 text-xs font-semibold transition-colors"
        style={{ color: '#d4a83a' }}
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
    <div className="p-6 md:p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest font-medium mb-2" style={{ color: '#8a7858' }}>Messaging</p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold mb-3" style={{ color: '#f8f2e4' }}>
          Unified Inbox
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: '#8a7858' }}>
          All your customer conversations from website chat, Instagram, and Facebook — merged into one stream.
        </p>
      </div>

      {/* Mobile nudge */}
      <MobileAppBanner />

      {/* Main card */}
      {isLoading ? (
        <div className="rounded-3xl p-8 h-72 flex items-center justify-center"
          style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#d4a83a' }} />
        </div>
      ) : (
        <div className="rounded-3xl overflow-hidden"
          style={{ background: '#1e1910', border: '1px solid #3d3420' }}>

          <div className="p-8 md:p-12 flex flex-col md:flex-row items-center gap-10">

            {/* Icon side */}
            <div className="flex-1 flex justify-center">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <div className="w-28 h-28 rounded-3xl flex items-center justify-center -rotate-3"
                  style={{ background: 'rgba(212,168,58,0.12)', border: '1px solid rgba(212,168,58,0.25)' }}>
                  <MessageSquare className="w-14 h-14" style={{ color: '#d4a83a' }} strokeWidth={1.5} />
                </div>
              </div>
            </div>

            {/* Content side */}
            <div className="flex-[1.5] flex flex-col items-center md:items-start text-center md:text-left w-full">
              <h2 className="font-display text-2xl font-semibold mb-4" style={{ color: '#f8f2e4' }}>
                All Channels, One View
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full mb-8">
                {['Website Visitors', 'Facebook Messenger', 'Instagram Direct'].map((label, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm rounded-xl py-2 px-3"
                    style={{ background: '#252015', border: '1px solid #3d3420', color: '#c8b898' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(107,193,142,0.12)', border: '1px solid rgba(107,193,142,0.2)' }}>
                      <ShieldCheck className="w-3 h-3" style={{ color: '#6bc18e' }} />
                    </div>
                    <span className="truncate">{label}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => openTidio(tidioUrl)}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-sm font-semibold transition-all duration-200 hover:-translate-y-px hover:shadow-lg w-full sm:w-auto"
                style={{ background: '#d4a83a', color: '#0d0b08' }}
              >
                Open Inbox
                <ArrowUpRight className="w-4 h-4" />
              </button>

              {!tidioConnected && (
                <p className="mt-4 text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ color: '#d4a83a', background: 'rgba(212,168,58,0.08)', border: '1px solid rgba(212,168,58,0.2)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
                  Tidio configuration needed
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
