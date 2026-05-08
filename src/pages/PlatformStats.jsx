import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useParams, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CUSTOMER_VISIBLE_PLATFORM_IDS, getPlatformConfig, normalizePlatformId } from '../lib/platformCatalog'
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
    <div className="social-momentum-card portal-stat-card flex flex-col justify-center p-4 transition-all">
      <p className="social-stats-meta mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]">{timeframe}</p>
      <div className="social-momentum-value mb-1 text-2xl font-semibold tabular-nums" data-positive={isPositive}>
        {isPositive ? '+' : ''}{value.toLocaleString()}
      </div>
      <p className="social-stats-submeta text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</p>
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
  const platformIsVisible = CUSTOMER_VISIBLE_PLATFORM_IDS.includes(platform)

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
    enabled: !!clientId && platformIsVisible,
  })

  const { data: recentPosts = [] } = useQuery({
    queryKey: ['recent-posts', clientId, platform],
    queryFn: () => fetchRecentPosts(clientId, platform),
    enabled: !!clientId && platformIsVisible,
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

  if (!platformIsVisible) return <Navigate to="/" replace />

  return (
    <div className="social-stats-page portal-page w-full max-w-none space-y-5 md:p-5 xl:p-6">
      <Link
        to="/"
        className="social-stats-back portal-button-secondary inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <section className="social-stats-hero portal-surface p-5 md:p-6">
        <div className="portal-page-header items-center">
          <div className="social-stats-identity flex items-center gap-4">
            <div className="social-stats-icon flex h-12 w-12 items-center justify-center" style={{ color: config.accent }}>
              <Icon className="h-7 w-7" style={{ color: config.accent }} />
            </div>
            <div>
              <div className="social-stats-status mb-2 flex items-center gap-2" data-connected={hasMetrics}>
                <span className="h-2 w-2 rounded-full" style={{ background: hasMetrics ? 'var(--portal-success)' : 'var(--portal-primary)' }} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                  {hasMetrics ? 'Live sync connected' : 'Waiting for connection'}
                </p>
              </div>
              <h1 className="portal-page-title font-display">{config.label} Analytics</h1>
            </div>
          </div>

          <div className="social-stats-total min-w-[190px] px-0 py-0 text-left md:text-right">
            <p className="social-stats-meta text-[11px] font-semibold uppercase tracking-[0.18em]">
              Total {config.metricLabel}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{totalLabel}</p>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="social-stats-loading portal-panel flex min-h-[320px] items-center justify-center p-8">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--portal-primary)' }} />
        </div>
      ) : (
        <>
          <section className="social-stats-section">
            <div className="social-stats-section-head mb-3 flex items-center gap-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em]">Momentum</h2>
            </div>
            <div className="social-stats-momentum-grid grid grid-cols-2 gap-3 md:grid-cols-4">
              <MomentumCard timeframe="Past 24h" label="Net Change" value={change24h} />
              <MomentumCard timeframe="Past 7 Days" label="Net Change" value={change7d} />
              <MomentumCard timeframe="Past 30 Days" label="Net Change" value={change30d} />
              <MomentumCard timeframe="Active Year" label="Net Change" value={changeYear} />
            </div>
          </section>

          <section className="space-y-4">
            <div className="social-stats-section-head flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em]">Recent Posts</h2>
              </div>
              <Link
                to="/post/history"
                className="social-stats-inline-link inline-flex items-center gap-1.5 text-xs font-semibold"
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
                    className="social-post-card portal-panel flex overflow-hidden"
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
              <div className="social-stats-empty portal-panel p-10 text-center">
                <div className="social-stats-empty-icon mx-auto mb-4 flex h-12 w-12 items-center justify-center">
                  <Image className="h-6 w-6" style={{ color: 'var(--portal-primary)' }} />
                </div>
                <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>No recent history</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  Published posts will appear here once this platform starts reporting activity.
                </p>
                <Link
                  to="/post"
                  className="social-stats-empty-action portal-button-primary mt-5 inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold"
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
