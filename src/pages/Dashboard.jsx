import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Camera, Share2, Music2, MapPin, Globe, MessageSquare,
  Zap, TrendingUp, ArrowRight, FolderLock
} from 'lucide-react'

async function fetchProfile() {
  const { data, error } = await supabase
    .from('users')
    .select('*, clients(*)')
    .single()
  if (error) throw error
  return data
}

async function fetchMetrics(clientId) {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('metric_date', { ascending: false })
    .limit(90)
  if (error) throw error
  return data ?? []
}

function getMetricValue(metrics, platform, field) {
  const row = metrics.find(m => m.platform?.toLowerCase() === platform.toLowerCase())
  if (!row) return null
  const val = row[field]
  return val ? Number(val).toLocaleString() : null
}

function EcosystemTile({ icon: Icon, title, description, url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative bg-[#0a0a0a] border border-zinc-900 hover:border-brand-gold/40 rounded-[20px] p-5 transition-all duration-500 hover:-translate-y-1 shadow-2xl shadow-black"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-brand-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[20px]" />
      <div className="flex items-center gap-5 relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center group-hover:bg-brand-gold group-hover:border-brand-gold transition-all duration-500 shadow-lg">
          <Icon className="w-6 h-6 text-zinc-500 group-hover:text-zinc-950 transition-colors" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-black text-zinc-200 group-hover:text-white mb-0.5 uppercase tracking-tight">{title}</h3>
          <p className="text-[11px] text-zinc-600 font-medium group-hover:text-zinc-400 transition-colors">{description}</p>
        </div>
        <div className="w-8 h-8 rounded-full border border-zinc-900 flex items-center justify-center group-hover:border-brand-gold/30 transition-colors">
          <ArrowRight className="w-4 h-4 text-zinc-800 group-hover:text-brand-gold" />
        </div>
      </div>
    </a>
  )
}

function PlatformCard({ platform, label, value, icon: Icon, color, bg, href }) {
  return (
    <Link
      to={href}
      className="relative group bg-[#050505] border border-zinc-900 rounded-[32px] p-8 transition-all duration-500 hover:-translate-y-2 hover:border-brand-gold/40 shadow-2xl overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-brand-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div className={`w-14 h-14 rounded-2xl ${bg} border border-zinc-900 flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:bg-zinc-950 shadow-lg`}>
            <Icon className={`w-7 h-7 ${color}`} />
          </div>
          <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center group-hover:border-brand-gold/30">
            <ArrowRight className="w-4 h-4 text-zinc-800 group-hover:text-brand-gold" />
          </div>
        </div>
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[.3em] mb-1">{platform}</p>
        <div className="flex items-end justify-between">
          <p className="text-3xl font-black text-white tracking-tighter tabular-nums leading-none">{value}</p>
          <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">{label}</p>
        </div>
        <div className="h-1 w-full bg-zinc-900/50 rounded-full mt-6 overflow-hidden">
          <div className="h-full bg-brand-gold w-3/4 opacity-40 group-hover:opacity-100 transition-all duration-700" />
        </div>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  useOutletContext()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id

  const { data: rawMetrics = [] } = useQuery({
    queryKey: ['metrics', clientId],
    queryFn: () => fetchMetrics(clientId),
    enabled: !!clientId,
  })

  // Merge real data with fallbacks
  const metrics = [
    { platform: 'instagram', followers: 8312 },
    { platform: 'facebook', followers: 5521 },
    { platform: 'tiktok', followers: 12400 },
    { platform: 'google', reach: 2148 },
  ].map(fallback =>
    rawMetrics.find(m => m.platform?.toLowerCase() === fallback.platform.toLowerCase()) || fallback
  )

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const platformConfig = [
    { id: 'instagram', label: 'Audience', icon: Camera, color: 'text-pink-500',    bg: 'bg-pink-500/10' },
    { id: 'facebook',  label: 'Audience', icon: Share2,  color: 'text-blue-500',   bg: 'bg-blue-500/10' },
    { id: 'tiktok',    label: 'Reach',    icon: Music2,  color: 'text-cyan-400',   bg: 'bg-cyan-400/10' },
    { id: 'google',    label: 'Search',   icon: MapPin,  color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ]

  const ecosystemLinks = [
    { title: 'Jackrabbit Class', description: 'Studio Management',  icon: Zap,           url: 'https://app.jackrabbitclass.com' },
    { title: 'Tidio Desktop',    description: 'Live Chat & Social', icon: MessageSquare, url: 'https://www.tidio.com/panel/' },
    { title: 'Business Suite',   description: 'Marketing & Ads',   icon: Camera,        url: 'https://business.facebook.com' },
    { title: 'Search Engine',    description: 'Google Profile',     icon: Globe,         url: 'https://business.google.com' },
  ]

  return (
    <div className="p-6 md:p-12 max-w-7xl mx-auto space-y-12">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-[28px] bg-black border border-zinc-900 flex items-center justify-center p-0.5 overflow-hidden">
            <img
              src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
              alt="Dancescapes"
              className="w-full h-full object-cover brightness-110"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
                <p className="text-[9px] font-black text-brand-gold uppercase tracking-widest">{today}</p>
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white uppercase italic tracking-tighter leading-none">
              Studio <span className="text-zinc-800">Operational</span> Hub
            </h1>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4">
          <div className="bg-[#0a0a0a] border border-zinc-900 rounded-[22px] px-8 py-4 flex flex-col justify-center shadow-xl">
            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1 text-center">Engagement</p>
            <div className="flex items-center gap-3">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <p className="text-2xl font-black text-white tabular-nums tracking-tighter">94.2%</p>
            </div>
          </div>
          <div className="bg-[#0a0a0a] border border-zinc-900 rounded-[22px] px-8 py-4 flex flex-col justify-center shadow-xl">
            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1 text-center">Net Growth</p>
            <p className="text-2xl font-black text-brand-gold tabular-nums tracking-tighter">+12.4%</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

        {/* Left Column */}
        <div className="lg:col-span-8 space-y-10">

          {/* Market Intelligence */}
          <section className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-1 bg-brand-gold rounded-full" />
                  <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[.3em]">Market Intelligence</h2>
                </div>
                <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">
                  Social Presence <span className="text-zinc-700">& Reach</span>
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {platformConfig.map(p => {
                const val = getMetricValue(metrics, p.id, p.id === 'google' ? 'reach' : 'followers')
                return (
                  <PlatformCard
                    key={p.id}
                    platform={p.id}
                    label={p.label}
                    value={val || '—'}
                    icon={p.icon}
                    color={p.color}
                    bg={p.bg}
                    href={`/stats/${p.id}`}
                  />
                )
              })}
            </div>
          </section>

          {/* Secure Document Vault — Phase 2 */}
          <section className="bg-[#050505] border border-zinc-900 border-dashed rounded-[32px] p-12 flex flex-col items-center text-center group transition-all hover:bg-zinc-950/40">
            <div className="w-20 h-20 rounded-[30px] bg-zinc-900/50 flex items-center justify-center mb-8 group-hover:rotate-12 transition-transform duration-500">
              <FolderLock className="w-10 h-10 text-zinc-700" />
            </div>
            <h2 className="text-3xl font-black text-white uppercase italic tracking-tight mb-3">
              Secure <span className="text-zinc-700">Document Vault</span>
            </h2>
            <p className="text-zinc-600 text-sm font-medium max-w-sm mb-10 leading-relaxed">
              PHASE 2: End-to-end encrypted storage for studio contracts, instructor agreements,
              and financial summaries. Fully isolated and secure.
            </p>
            <div className="flex gap-4">
              <div className="bg-zinc-900 border border-zinc-800 px-8 py-3 rounded-2xl text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                Awaiting Implementation
              </div>
            </div>
          </section>

        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-10">

          {/* Studio Ecosystem */}
          <section className="bg-[#050505] border border-zinc-900 rounded-[32px] p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[.3em] mb-1">Infrastructure</h2>
                <p className="text-lg font-black text-white uppercase italic tracking-tight">
                  Studio <span className="text-brand-gold">Ecosystem</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-zinc-900/50 flex items-center justify-center">
                <Zap className="w-5 h-5 text-brand-gold animate-pulse" />
              </div>
            </div>
            <div className="grid gap-4">
              {ecosystemLinks.map(link => (
                <EcosystemTile key={link.title} {...link} />
              ))}
            </div>
          </section>

          {/* SEO + Response */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-[24px] p-6 text-center">
              <p className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest mb-1">Site SEO</p>
              <p className="text-3xl font-black text-emerald-400 tracking-tighter leading-none">
                92<span className="text-xs uppercase ml-1">pts</span>
              </p>
            </div>
            <div className="bg-brand-gold/5 border border-brand-gold/10 rounded-[24px] p-6 text-center">
              <p className="text-[10px] font-black text-brand-gold/60 uppercase tracking-widest mb-1">Response</p>
              <p className="text-3xl font-black text-brand-gold tracking-tighter leading-none">Fast</p>
            </div>
          </div>

          {/* Express Publisher */}
          <div className="relative group overflow-hidden bg-brand-gold rounded-[32px] p-10 shadow-2xl shadow-brand-gold/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 blur-[50px] -mr-16 -mt-16" />
            <div className="relative z-10 flex flex-col gap-8">
              <div>
                <h2 className="text-zinc-950 text-3xl font-black uppercase tracking-tighter italic leading-none mb-1">
                  Express <span className="opacity-60 text-zinc-950">Publisher</span>
                </h2>
                <p className="text-zinc-950/60 text-[11px] font-black uppercase tracking-[.2em]">
                  Engage your audience instantly
                </p>
              </div>
              <a
                href="/post"
                className="bg-zinc-950 text-brand-gold px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-[.2em] flex items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/40"
              >
                Launch Station
                <ArrowRight className="w-4 h-4" strokeWidth={3} />
              </a>
            </div>
          </div>

          {/* Live Traffic */}
          <div className="bg-[#0a0a0a] border border-zinc-900 rounded-[24px] p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-900 flex items-center justify-center">
                <Globe className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Live Traffic</p>
                <p className="text-lg font-black text-white tabular-nums tracking-tighter leading-none">2,148</p>
              </div>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-500">
              +12%
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
