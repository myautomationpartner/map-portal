import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useParams, useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchPostMetrics, fetchSocialConnections } from '../lib/portalApi'
import { CUSTOMER_VISIBLE_PLATFORM_IDS, getPlatformConfig, normalizePlatformId } from '../lib/platformCatalog'
import {
  Image,
  ArrowLeft, BarChart3, ChevronRight, Loader2, RefreshCw
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcNetChange(metrics, days, field = 'followers') {
  if (!metrics || metrics.length === 0) return 0
  const current = Number(metrics[0]?.[field] || 0)
  const previous = metrics.length > days
    ? Number(metrics[days]?.[field] || 0)
    : Number(metrics[metrics.length - 1]?.[field] || 0)
  return current - previous
}

function hasMetricValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function formatMetricValue(value) {
  if (!hasMetricValue(value)) return '—'
  const number = Number(value)
  return number.toLocaleString()
}

function getPrimaryPostMetric(metrics) {
  if (!metrics) return { label: 'Views', value: '—' }
  if (hasMetricValue(metrics.views)) return { label: 'Views', value: formatMetricValue(metrics.views) }
  if (hasMetricValue(metrics.impressions)) return { label: 'Impressions', value: formatMetricValue(metrics.impressions) }
  if (hasMetricValue(metrics.reach)) return { label: 'Reach', value: formatMetricValue(metrics.reach) }
  return { label: 'Views', value: formatMetricValue(0) }
}

function formatRateValue(value) {
  if (!hasMetricValue(value)) return '—'
  return `${Number(value).toFixed(1)}%`
}

function getPostMetricStatus(item) {
  const post = item?.post || {}
  const metrics = item?.metrics || null
  if (!post.n8n_execution_id) return { label: 'Not tracked', tone: 'muted' }
  if (!metrics) return { label: 'Waiting', tone: 'pending' }
  if (metrics.sync_status === 'pending') return { label: 'Sync pending', tone: 'pending' }
  if (metrics.sync_status === 'failed' || metrics.sync_status === 'unavailable') return { label: 'Unavailable', tone: 'warning' }
  return { label: 'Live metrics', tone: 'success' }
}

function formatSyncCopy(sync, postCount, postPerformance = []) {
  if (!postCount) return 'No published posts yet'
  if (postPerformance.some((item) => item.metrics?.sync_status === 'pending')) return 'Sync pending'
  if (postPerformance.length && postPerformance.every((item) => !item.post?.n8n_execution_id)) return 'Older posts not tracked'
  if (!sync) return 'Cached metrics'
  if (sync.analyticsAvailable === false) return sync.message || 'Analytics add-on required'
  if (sync.synced > 0) return `${sync.synced} refreshed`
  if (sync.pending > 0) return 'Sync pending'
  if (sync.attempted === 0) return 'Metrics current'
  if (sync.failed > 0) return sync.message || 'Some metrics unavailable'
  return 'Metrics current'
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

function PostPerformanceRow({ item, Icon, accent }) {
  const post = item.post || {}
  const metrics = item.metrics || null
  const primary = getPrimaryPostMetric(metrics)
  const status = getPostMetricStatus(item)
  const publishedLabel = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Published'
  const metricItems = [
    ['Reach', metrics?.reach],
    ['Engagement', metrics?.engagements],
    ['Clicks', metrics?.clicks],
    ['Rate', metrics?.engagement_rate, 'rate'],
  ]

  return (
    <article className="social-post-performance-row portal-panel">
      <div className="social-post-performance-media">
        {post.media_url ? (
          <img src={post.media_url} alt="" />
        ) : (
          <Image className="h-5 w-5" style={{ color: 'var(--portal-text-soft)' }} />
        )}
      </div>
      <div className="social-post-performance-copy">
        <div className="mb-1 flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
          <span>{publishedLabel}</span>
          <span className="social-post-performance-status" data-tone={status.tone}>{status.label}</span>
        </div>
        <p>{post.content || 'Published post'}</p>
      </div>
      <div className="social-post-performance-primary">
        <strong>{primary.value}</strong>
        <span>{primary.label}</span>
      </div>
      <div className="social-post-performance-metrics">
        {metricItems.map(([label, value, type]) => (
          <div key={label}>
            <strong>{type === 'rate' ? formatRateValue(value) : formatMetricValue(value)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {metrics?.platform_post_url ? (
        <a className="social-post-performance-link" href={metrics.platform_post_url} target="_blank" rel="noreferrer" aria-label="Open post">
          <ChevronRight className="h-4 w-4" />
        </a>
      ) : null}
    </article>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlatformStats() {
  const { platform: routePlatform } = useParams()
  useOutletContext()
  const [forceSyncToken, setForceSyncToken] = useState(0)

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

  const { data: socialConnections = [] } = useQuery({
    queryKey: ['social-connections', clientId],
    queryFn: () => fetchSocialConnections(clientId),
    enabled: !!clientId,
  })

  const { data: postMetricsData = null, isFetching: postMetricsFetching, error: postMetricsError } = useQuery({
    queryKey: ['post-metrics', clientId, platform, forceSyncToken],
    queryFn: () => fetchPostMetrics(platform, { force: forceSyncToken > 0 }),
    enabled: !!clientId && platformIsVisible,
    retry: false,
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
  const postPerformance = postMetricsData?.posts || []
  const platformIsConnected = socialConnections.some((connection) => normalizePlatformId(connection.platform) === platform && connection.zernio_account_id)
  const postSyncCopy = postMetricsError
    ? 'Metrics sync unavailable'
    : formatSyncCopy(postMetricsData?.sync, postPerformance.length, postPerformance)
  const syncStatusCopy = hasMetrics
    ? 'Live sync connected'
    : platformIsConnected
      ? 'Connected, collecting metrics'
      : 'Waiting for connection'

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
              <div className="social-stats-status mb-2 flex items-center gap-2" data-connected={hasMetrics || platformIsConnected}>
                <span className="h-2 w-2 rounded-full" style={{ background: hasMetrics || platformIsConnected ? 'var(--portal-success)' : 'var(--portal-primary)' }} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                  {syncStatusCopy}
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
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em]">Post Performance</h2>
                <span className="social-stats-sync-pill inline-flex items-center gap-1.5">
                  {postMetricsFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
                  {postSyncCopy}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForceSyncToken((value) => value + 1)}
                  className="social-stats-inline-link inline-flex items-center gap-1.5 text-xs font-semibold"
                  disabled={postMetricsFetching}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${postMetricsFetching ? 'animate-spin' : ''}`} />
                  Sync
                </button>
                <Link
                  to="/post/history"
                  className="social-stats-inline-link inline-flex items-center gap-1.5 text-xs font-semibold"
                >
                  View all
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {postPerformance.length > 0 ? (
              <div className="social-post-performance-list">
                {postPerformance.map(item => (
                  <PostPerformanceRow
                    key={item.post.id}
                    item={item}
                    Icon={Icon}
                    accent={config.accent}
                  />
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
