import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MessageSquare, Camera, Users2, ExternalLink, Smartphone, ArrowUpRight } from 'lucide-react'

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

function openInstagram(tidioUrl, igConnected) {
  if (igConnected) {
    openTidio(tidioUrl)
  } else {
    window.open('https://www.instagram.com/direct/inbox/', '_blank', 'noopener,noreferrer')
  }
}

function openFacebook(tidioUrl, fbConnected) {
  if (fbConnected) {
    openTidio(tidioUrl)
  } else {
    window.open('https://www.messenger.com', '_blank', 'noopener,noreferrer')
  }
}

// ── Channel Card ─────────────────────────────────────────────────────────────

function ChannelCard({ icon: Icon, iconGradient, glowColor, title, description, badge, badgeColor, ctaLabel, onOpen, connected }) {
  return (
    <div
      className={`
        relative bg-zinc-900/70 border rounded-2xl p-6 overflow-hidden
        transition-all duration-300 group
        hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40
        ${connected
          ? 'border-zinc-800/60 hover:border-zinc-700/60'
          : 'border-zinc-800/40 hover:border-zinc-700/40'
        }
      `}
    >
      {/* Ambient glow */}
      <div
        className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${glowColor}`}
      />

      {/* Icon + Badge row */}
      <div className="flex items-start justify-between mb-5">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconGradient} flex items-center justify-center shadow-lg`}>
          <Icon className="w-6 h-6 text-white" strokeWidth={1.75} />
        </div>
        {badge && (
          <span className={`text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>

      {/* Text */}
      <h3 className="text-base font-bold text-white mb-1.5">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed mb-6">{description}</p>

      {/* CTA */}
      <button
        onClick={onOpen}
        className={`
          w-full flex items-center justify-center gap-2
          font-semibold text-sm rounded-xl px-5 py-3
          transition-all duration-200
          active:scale-[0.98]
          ${connected
            ? 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white shadow-md shadow-violet-500/20 hover:-translate-y-px'
            : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-zinc-700/40'
          }
        `}
      >
        {isMobile() ? <Smartphone className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
        {ctaLabel}
      </button>
    </div>
  )
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
          Tap any channel button below to open it.
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

  // We assume channels are connected once the client has a tidio_project_url.
  // In a future phase this can be per-channel flags stored in the clients table.
  const tidioConnected = !!client?.tidio_project_url

  const channels = [
    {
      id: 'website',
      icon: MessageSquare,
      iconGradient: 'from-violet-600 to-violet-400',
      glowColor: 'bg-violet-500/20',
      title: 'Website Messages',
      description: 'View and reply to live chat messages from your website visitors in real time.',
      badge: tidioConnected ? 'Live' : 'Setup needed',
      badgeColor: tidioConnected
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
        : 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
      ctaLabel: 'Open Inbox',
      onOpen: () => openTidio(tidioUrl),
      connected: tidioConnected,
    },
    {
      id: 'instagram',
      icon: Camera,
      iconGradient: 'from-pink-600 to-purple-500',
      glowColor: 'bg-pink-500/20',
      title: 'Instagram DMs',
      description: 'Respond to Instagram direct messages alongside all your other channels in one place.',
      badge: tidioConnected ? 'Connected' : 'Opens Instagram',
      badgeColor: tidioConnected
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
        : 'bg-zinc-700/60 text-zinc-400 border border-zinc-700/40',
      ctaLabel: tidioConnected ? 'Open Inbox' : 'Open Instagram',
      onOpen: () => openInstagram(tidioUrl, tidioConnected),
      connected: tidioConnected,
    },
    {
      id: 'facebook',
      icon: Users2,
      iconGradient: 'from-blue-600 to-blue-400',
      glowColor: 'bg-blue-500/20',
      title: 'Facebook Messages',
      description: 'Handle Facebook Page messages and Messenger conversations without leaving the portal.',
      badge: tidioConnected ? 'Connected' : 'Opens Messenger',
      badgeColor: tidioConnected
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
        : 'bg-zinc-700/60 text-zinc-400 border border-zinc-700/40',
      ctaLabel: tidioConnected ? 'Open Inbox' : 'Open Messenger',
      onOpen: () => openFacebook(tidioUrl, tidioConnected),
      connected: tidioConnected,
    },
  ]

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Messaging</p>
        <h1 className="text-2xl md:text-3xl font-bold text-white">Communications Hub</h1>
        <p className="text-zinc-500 text-sm mt-1">
          All your customer conversations — website chat, Instagram, and Facebook — in one place.
        </p>
      </div>

      {/* Mobile app nudge */}
      <MobileAppBanner />

      {/* Channel cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-6 animate-pulse">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 mb-5" />
              <div className="h-4 bg-zinc-800 rounded-lg mb-2 w-3/4" />
              <div className="h-3 bg-zinc-800 rounded-lg mb-1 w-full" />
              <div className="h-3 bg-zinc-800 rounded-lg mb-6 w-2/3" />
              <div className="h-10 bg-zinc-800 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {channels.map(channel => (
            <ChannelCard key={channel.id} {...channel} />
          ))}
        </div>
      )}

      {/* Info footer */}
      <div className="mt-8 bg-zinc-900/50 border border-zinc-800/40 rounded-2xl px-6 py-5">
        <div className="flex items-start gap-3">
          <MessageSquare className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-1">How this works</p>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Your unified inbox is powered by Tidio. Website visitors, Instagram followers, and Facebook fans
              all land in the same conversation stream. Your team can reply from the Tidio web panel on desktop
              or the Tidio mobile app on the go.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
