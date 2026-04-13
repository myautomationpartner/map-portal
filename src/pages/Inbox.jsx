import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MessageSquare, Smartphone, ArrowUpRight, Combine, Zap, ShieldCheck } from 'lucide-react'

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
    // Desktop: open Tidio web panel
    window.open(tidioUrl, '_blank', 'noopener,noreferrer')
    return
  }

  // Mobile: try Tidio deep link first, fallback to app store
  const appStoreUrl = isIOS()
    ? 'https://apps.apple.com/app/tidio-live-chat/id1024407395'
    : 'https://play.google.com/store/apps/details?id=com.tidio.tidio'

  // Attempt deep link; if it fails after 1.5s, redirect to store
  const deepLink = 'tidio://'
  const fallbackTimer = setTimeout(() => {
    window.location.href = appStoreUrl
  }, 1500)

  window.addEventListener('blur', () => clearTimeout(fallbackTimer), { once: true })
  window.location.href = deepLink
}

// ── Status Banner ─────────────────────────────────────────────────────────────

function MobileAppBanner() {
  if (!isMobile()) return null

  const storeUrl = isIOS()
    ? 'https://apps.apple.com/app/tidio-live-chat/id1024407395'
    : 'https://play.google.com/store/apps/details?id=com.tidio.tidio'

  return (
    <div className="bg-violet-600/10 border border-violet-500/20 rounded-2xl px-5 py-4 flex items-start gap-4 mb-6">
      <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Smartphone className="w-4 h-4 text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white mb-0.5">Tidio Mobile App</p>
        <p className="text-xs text-zinc-500 leading-relaxed">
          For the best experience, reply to messages directly from the Tidio app.
        </p>
      </div>
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
      >
        Get App
        <ArrowUpRight className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Inbox() {
  useOutletContext() // ensure protected layout context

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchClientProfile,
  })

  const client = profile?.clients
  const tidioUrl = client?.tidio_project_url || 'https://www.tidio.com/panel/'
  const tidioConnected = !!client?.tidio_project_url

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-violet-400 uppercase tracking-widest mb-2 font-semibold">Messaging</p>
        <h1 className="text-3xl md:text-4xl font-bold font-display text-white mb-3">Unified Inbox</h1>
        <p className="text-zinc-400 text-sm md:text-base max-w-2xl leading-relaxed">
          All your customer conversations from website chat, Instagram, and Facebook — seamlessly merged into one powerful stream.
        </p>
      </div>

      {/* Mobile app nudge */}
      <MobileAppBanner />

      {/* Main Unified Box */}
      {isLoading ? (
        <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-3xl p-8 animate-pulse h-80" />
      ) : (
        <div className="relative bg-zinc-900/70 border border-zinc-800/60 rounded-3xl p-1 overflow-hidden group">
          {/* Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-violet-600/20 blur-[120px] pointer-events-none opacity-40 group-hover:opacity-70 transition-opacity duration-700" />
          
          <div className="relative bg-zinc-900/90 rounded-[22px] p-8 md:p-12 flex flex-col md:flex-row items-center gap-10">
            {/* Visual Side */}
            <div className="flex-1 flex justify-center w-full">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-full blur-2xl opacity-20 animate-pulse" />
                <div className="relative w-32 h-32 bg-gradient-to-tr from-violet-600 to-violet-500 rounded-3xl flex items-center justify-center shadow-xl shadow-violet-900/50 -rotate-3 hover:rotate-0 transition-transform duration-500 border border-white/10">
                  <MessageSquare className="w-16 h-16 text-white" strokeWidth={1.5} />
                </div>
                {/* Floating elements */}
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-zinc-800 rounded-2xl border border-zinc-700/50 flex items-center justify-center shadow-lg shadow-black/50 rotate-12">
                   <Combine className="w-6 h-6 text-fuchsia-400" />
                </div>
                <div className="absolute -bottom-4 -left-4 w-12 h-12 bg-zinc-800 rounded-2xl border border-zinc-700/50 flex items-center justify-center shadow-lg shadow-black/50 -rotate-6">
                   <Zap className="w-6 h-6 text-amber-400" />
                </div>
              </div>
            </div>

            {/* Content Side */}
            <div className="flex-[1.5] flex flex-col items-center md:items-start text-center md:text-left w-full">
              <div className="mb-8 w-full">
                <h2 className="text-2xl font-bold text-white mb-4">All Channels, One View</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {['Website Visitors', 'Facebook Messenger', 'Instagram Direct'].map((label, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm text-zinc-300 bg-zinc-800/40 border border-zinc-700/40 rounded-xl py-2 px-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <span className="truncate">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => openTidio(tidioUrl)}
                className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-white text-zinc-950 font-bold text-sm md:text-base rounded-2xl hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(139,92,246,0.3)] w-full sm:w-auto"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-100 to-fuchsia-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative flex items-center gap-2">
                  Launch Inbox Workstation
                  <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </span>
              </button>
              
              {!tidioConnected && (
                <p className="mt-4 text-xs text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-full border border-amber-400/20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Tidio Configuration Needed
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
