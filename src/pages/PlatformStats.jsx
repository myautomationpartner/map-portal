import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getPlatformConfig, normalizePlatformId } from '../lib/platformCatalog'
import {
  Image,
  ArrowLeft, ChevronRight, Loader2
} from 'lucide-react'

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchMetricsByPlatform(clientId, platform) {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', clientId)
    .ilike('platform', platform)
    .order('metric_date', { ascending: false })
    .order('created_at', { ascending: false })
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

function calcNetChange(metrics, days, field = 'followers') {
  if (!metrics || metrics.length === 0) return 0
  const current = Number(metrics[0]?.[field] || 0)
  const previous = metrics.length > days
    ? Number(metrics[days]?.[field] || 0)
    : Number(metrics[metrics.length - 1]?.[field] || 0)
  return current - previous
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MomentumCard({ timeframe, label, value }) {
  const isPositive = value >= 0
  return (
    <div className="portal-stat-card flex flex-col items-center justify-center p-5 text-center transition-all hover:-translate-y-0.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>{timeframe}</p>
      <div className="mb-1 text-2xl font-semibold tabular-nums" style={{ color: isPositive ? 'var(--portal-success)' : 'var(--portal-danger)' }}>
        {isPositive ? '+' : ''}{value.toLocaleString()}
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--portal-text-muted)' }}>{label}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlatformStats() {
  const { platform: routePlatform } = useParams()
  useOutletContext()

  const platform = normalizePlatformId(routePlatform)
  const config = getPlatformConfig(platform)
  const Icon = config.Icon

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
  const isLoading = !profile && !clientId

  const metricValue = hasMetrics ? Number(metrics[0]?.[config.metricField] || 0) : null
  const totalLabel = hasMetrics ? metricValue.toLocaleString() : '—'
  const change24h  = calcNetChange(metrics, 1, config.metricField)
  const change7d   = calcNetChange(metrics, 7, config.metricField)
  const change30d  = calcNetChange(metrics, 30, config.metricField)
  const changeYear = calcNetChange(metrics, 365, config.metricField)

  return (
    <div className="portal-page w-full max-w-none space-y-6 md:p-5 xl:p-6">
      <Link
        to="/"
        className="portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <section className="portal-surface p-5 md:p-7">
        <div className="portal-page-header">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center border bg-white" style={{ borderColor: 'var(--portal-border)', borderRadius: 'var(--portal-radius-lg)' }}>
              <Icon className="h-7 w-7" style={{ color: config.accent }} />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: hasMetrics ? 'var(--portal-success)' : 'var(--portal-primary)' }} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                  {hasMetrics ? 'Live sync connected' : 'Waiting for connection'}
                </p>
              </div>
              <h1 className="portal-page-title font-display">{config.label} Analytics</h1>
            </div>
          </div>

          <div className="portal-stat-card min-w-[220px] px-5 py-4 text-left md:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
              Total {config.metricLabel}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: 'var(--portal-text)' }}>{totalLabel}</p>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="portal-panel flex min-h-[320px] items-center justify-center p-8">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--portal-primary)' }} />
        </div>
      ) : (
        <>
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="h-1 w-5 rounded-full" style={{ background: 'var(--portal-primary)' }} />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Momentum</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MomentumCard timeframe="Past 24h" label="Net Change" value={change24h} />
              <MomentumCard timeframe="Past 7 Days" label="Net Change" value={change7d} />
              <MomentumCard timeframe="Past 30 Days" label="Net Change" value={change30d} />
              <MomentumCard timeframe="Active Year" label="Net Change" value={changeYear} />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-1 w-5 rounded-full" style={{ background: 'var(--portal-primary)' }} />
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Recent Posts</h2>
              </div>
              <Link
                to="/post/history"
                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: 'var(--portal-primary-strong)' }}
              >
                View all
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {recentPosts.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {recentPosts.map(post => (
                  <article
                    key={post.id}
                    className="portal-panel flex overflow-hidden"
                  >
                    <div className="relative aspect-square w-28 shrink-0 overflow-hidden bg-[var(--portal-surface-muted)] md:w-32">
                      {post.media_url ? (
                        <img
                          src={post.media_url}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Image className="h-8 w-8" style={{ color: 'var(--portal-text-soft)' }} />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
                          {post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Published'}
                        </span>
                        <Icon className="h-4 w-4 shrink-0" style={{ color: config.accent }} />
                      </div>
                      <p className="line-clamp-4 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                        {post.content || 'No description provided.'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="portal-panel p-10 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)', borderRadius: 'var(--portal-radius-lg)' }}>
                  <Image className="h-6 w-6" style={{ color: 'var(--portal-primary)' }} />
                </div>
                <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>No recent history</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  Published posts will appear here once this platform starts reporting activity.
                </p>
                <Link
                  to="/post"
                  className="portal-button-primary mt-5 inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold"
                >
                  Start drafting
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </Link>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
