import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Camera, Share2, Music2, MapPin, Image,
  ArrowLeft, ChevronRight, LoaderCircle
} from 'lucide-react'

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchMetricsByPlatform(clientId, platform) {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', clientId)
    .ilike('platform', platform)
    .order('metric_date', { ascending: false })
    .limit(365)
  if (error) throw error
  return data ?? []
}

async function fetchRecentPosts(clientId, platform) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('client_id', clientId)
    .contains('platforms', [platform === 'google' ? 'google' : platform])
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(3)
  if (error) throw error
  return data ?? []
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcNetChange(metrics, days) {
  if (!metrics || metrics.length === 0) return 0
  const current = Number(metrics[0]?.followers || 0)
  const previous = metrics.length > days
    ? Number(metrics[days]?.followers || 0)
    : Number(metrics[metrics.length - 1]?.followers || 0)
  return current - previous
}

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORM_CONFIG = {
  instagram: { label: 'Instagram', icon: Camera,  color: 'text-pink-500',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20',    metricLabel: 'Followers' },
  facebook:  { label: 'Facebook',  icon: Share2,  color: 'text-blue-500',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    metricLabel: 'Followers' },
  tiktok:    { label: 'TikTok',    icon: Music2,  color: 'text-cyan-400',    bg: 'bg-cyan-400/10',    border: 'border-cyan-400/20',    metricLabel: 'Followers' },
  google:    { label: 'Google',    icon: MapPin,  color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', metricLabel: 'Business Reach' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MomentumCard({ timeframe, label, value }) {
  const isPositive = value >= 0
  return (
    <div className="bg-[#0a0a0a] border border-zinc-900 rounded-3xl p-6 flex flex-col items-center justify-center text-center group hover:border-brand-gold/20 transition-all">
      <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">{timeframe}</p>
      <div className={`text-2xl font-black tabular-nums tracking-tighter mb-1 ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
        {isPositive ? '+' : ''}{value.toLocaleString()}
      </div>
      <p className="text-[9px] font-bold text-zinc-700 uppercase">{label}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlatformStats() {
  const { platform } = useParams()
  useOutletContext()

  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.instagram
  const Icon = config.icon

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*, clients(*)').single()
      if (error) throw error
      return data
    },
  })

  const clientId = profile?.client_id

  const { data: rawMetrics = [] } = useQuery({
    queryKey: ['metrics', clientId, platform],
    queryFn: () => fetchMetricsByPlatform(clientId, platform),
    enabled: !!clientId,
  })

  const { data: recentPosts = [] } = useQuery({
    queryKey: ['recent-posts', clientId, platform],
    queryFn: () => fetchRecentPosts(clientId, platform),
    enabled: !!clientId,
  })

  const metrics = rawMetrics
  const hasMetrics = metrics.length > 0

  const totalLabel = hasMetrics ? Number(metrics[0]?.followers || 0).toLocaleString() : '—'
  const change24h  = calcNetChange(metrics, 1)
  const change7d   = calcNetChange(metrics, 7)
  const change30d  = calcNetChange(metrics, 30)
  const changeYear = calcNetChange(metrics, 365)

  return (
    <div className="p-6 md:p-12 max-w-5xl mx-auto space-y-12">

      {/* Back */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs font-black text-zinc-500 uppercase tracking-widest hover:text-brand-gold transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Hub
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className={`w-20 h-20 rounded-[30px] ${config.bg} flex items-center justify-center border ${config.border} shadow-2xl`}>
            <Icon className={`w-10 h-10 ${config.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                {hasMetrics ? 'Live Sync Connected' : 'Waiting for connection'}
              </p>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white uppercase italic tracking-tighter leading-none">
              {config.label} <span className="text-zinc-800">Analytics</span>
            </h1>
          </div>
        </div>

        <div className="bg-[#050505] border border-zinc-900 rounded-[28px] px-10 py-6 flex flex-col items-center shadow-xl">
          <p className="text-[11px] font-black text-zinc-600 uppercase tracking-[.3em] mb-1">
            Total {config.metricLabel}
          </p>
          <p className="text-4xl font-black text-white tabular-nums tracking-tighter">{totalLabel}</p>
        </div>
      </div>

      {/* Momentum */}
      <section>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-4 h-1 bg-brand-gold rounded-full" />
          <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[.3em]">Momentum Tracking</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MomentumCard timeframe="Past 24h"    label="Net Change" value={change24h} />
          <MomentumCard timeframe="Past 7 Days" label="Net Change" value={change7d} />
          <MomentumCard timeframe="Past 30 Days"label="Net Change" value={change30d} />
          <MomentumCard timeframe="Active Year" label="Net Change" value={changeYear} />
        </div>
      </section>

      {/* Recent Posts */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-4 h-1 bg-brand-gold rounded-full" />
            <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[.3em]">Recent Distributions</h2>
          </div>
          <Link
            to="/post/history"
            className="text-[10px] font-black text-brand-gold uppercase tracking-widest flex items-center gap-1.5 hover:brightness-110"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentPosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentPosts.map(post => (
              <div
                key={post.id}
                className="bg-[#050505] border border-zinc-900 rounded-[32px] overflow-hidden group hover:border-brand-gold/20 transition-all flex flex-col"
              >
                <div className="aspect-square relative overflow-hidden bg-zinc-950">
                  {post.media_url ? (
                    <img
                      src={post.media_url}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="w-10 h-10 text-zinc-800" />
                    </div>
                  )}
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5">
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">
                      {new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3 mb-6 flex-1">
                    {post.content || 'No description provided.'}
                  </p>
                  <div className="flex items-center justify-between pt-6 border-t border-zinc-900">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-zinc-900 flex items-center justify-center">
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                      </div>
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-tighter">Verified Post</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#050505] border border-zinc-900 border-dashed rounded-[32px] p-16 text-center">
            <div className="w-16 h-16 rounded-[24px] bg-zinc-900 flex items-center justify-center mx-auto mb-6">
              <Image className="w-8 h-8 text-zinc-700" />
            </div>
            <h3 className="text-xl font-black text-white uppercase italic tracking-tight mb-2">No Recent History</h3>
            <p className="text-zinc-600 text-sm font-medium mb-8">
              Publish your first content to see deep analysis here.
            </p>
            <Link
              to="/post"
              className="bg-brand-gold text-zinc-950 px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-[.2em] inline-flex items-center gap-3"
            >
              Start Drafting
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </Link>
          </div>
        )}
      </section>

    </div>
  )
}
