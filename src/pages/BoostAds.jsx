import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { ArrowUpRight, BarChart3, ChevronRight, ExternalLink, Loader2, Megaphone, MessageSquare, RefreshCw, X } from 'lucide-react'
import { fetchBoostCampaigns } from '../lib/portalApi'

const metricDefinitions = [
  { key: 'spend', label: 'Spend', type: 'money', fields: ['spend', 'amountSpent', 'amount_spent'] },
  { key: 'impressions', label: 'Impressions', type: 'number', fields: ['impressions'] },
  { key: 'reach', label: 'Reach', type: 'number', fields: ['reach'] },
  { key: 'clicks', label: 'Clicks', type: 'number', fields: ['clicks', 'linkClicks', 'link_clicks'] },
  { key: 'ctr', label: 'CTR', type: 'percent', fields: ['ctr', 'clickThroughRate', 'click_through_rate'] },
  { key: 'cpc', label: 'CPC', type: 'money', fields: ['cpc', 'costPerClick', 'cost_per_click'] },
  { key: 'cpm', label: 'CPM', type: 'money', fields: ['cpm', 'costPerMille', 'cost_per_mille'] },
  { key: 'engagement', label: 'Engagement', type: 'number', fields: ['engagement', 'engagements', 'postEngagement', 'post_engagement'] },
]

const statusTone = {
  active: 'success',
  pending: 'pending',
  paused: 'warning',
  completed: 'success',
  cancelled: 'muted',
  canceled: 'muted',
  rejected: 'danger',
  failed: 'danger',
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).replace(/[$,%]/g, ''))
  return Number.isFinite(number) ? number : null
}

function formatNumber(value) {
  const number = asNumber(value)
  return number === null ? '—' : number.toLocaleString()
}

function formatMoney(value, currency = 'USD') {
  const number = asNumber(value)
  if (number === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: number >= 100 ? 0 : 2,
  }).format(number)
}

function formatPercent(value) {
  const number = asNumber(value)
  if (number === null) return '—'
  return `${number.toFixed(2)}%`
}

function formatMetric(value, type, currency) {
  if (type === 'money') return formatMoney(value, currency)
  if (type === 'percent') return formatPercent(value)
  return formatNumber(value)
}

function metricSources(campaign = {}) {
  return [
    campaign.metrics,
    campaign.insights,
    campaign.performance,
    campaign.stats,
    campaign.summary,
    campaign.zernioResponse?.metrics,
    campaign.zernioResponse?.ad?.metrics,
    campaign.zernioResponse?.data?.metrics,
    campaign.localBoost?.zernio_response_json?.metrics,
    campaign.localBoost?.zernio_response_json?.ad?.metrics,
    campaign,
  ].filter((source) => source && typeof source === 'object')
}

function pickMetric(campaign, fields) {
  for (const source of metricSources(campaign)) {
    for (const field of fields) {
      if (source[field] !== undefined && source[field] !== null && source[field] !== '') return source[field]
    }
  }
  return null
}

function getCampaignMetrics(campaign = {}) {
  const currency = firstText(campaign.currency, campaign.budget?.currency, campaign.localBoost?.currency, 'USD')
  return metricDefinitions.map((definition) => ({
    ...definition,
    value: pickMetric(campaign, definition.fields),
    formatted: formatMetric(pickMetric(campaign, definition.fields), definition.type, currency),
  }))
}

function getCampaignName(campaign = {}) {
  return firstText(
    campaign.name,
    campaign.campaignName,
    campaign.campaign_name,
    campaign.localBoost?.name,
    'Boosted post',
  )
}

function getCampaignPreview(campaign = {}) {
  return firstText(
    campaign.preview,
    campaign.previewText,
    campaign.preview_text,
    campaign.creative?.body,
    campaign.creative?.text,
    campaign.ad?.creative?.body,
    campaign.ad?.creative?.text,
    campaign.zernioResponse?.ad?.creative?.body,
    campaign.zernioResponse?.ad?.creative?.text,
    campaign.localBoost?.zernio_response_json?.ad?.creative?.body,
    campaign.localBoost?.zernio_response_json?.ad?.creative?.text,
    campaign.localBoost?.zernio_response_json?.request?.creative,
    'Creative preview is not available yet.',
  )
}

function getCampaignStatus(campaign = {}) {
  const status = firstText(campaign.status, campaign.reviewStatus, campaign.localBoost?.status, 'saved').toLowerCase()
  return {
    key: status,
    label: status.replace(/_/g, ' '),
    tone: statusTone[status] || 'muted',
  }
}

function getBudgetLabel(campaign = {}) {
  const budget = campaign.budget || {}
  const amount = firstText(budget.amount, budget.dailyAmount, budget.daily_amount, campaign.budgetAmount, campaign.budget_amount, campaign.localBoost?.budget_amount)
  const type = firstText(budget.type, budget.budgetType, budget.budget_type, campaign.budgetType, campaign.localBoost?.budget_type, 'daily')
  const currency = firstText(budget.currency, campaign.currency, campaign.localBoost?.currency, 'USD')
  if (!amount) return '—'
  return `${formatMoney(amount, currency)}${type === 'daily' ? '/day' : ''}`
}

function getPlatformLabel(platform = '') {
  const normalized = String(platform || '').toLowerCase()
  if (normalized === 'facebook') return 'Facebook'
  if (normalized === 'instagram') return 'Instagram'
  if (normalized === 'twitter') return 'X'
  if (normalized === 'tiktok') return 'TikTok'
  if (normalized === 'linkedin') return 'LinkedIn'
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Platform'
}

function getCampaignUrl(campaign = {}) {
  return firstText(campaign.url, campaign.detailsUrl, campaign.details_url, campaign.zernioUrl, campaign.zernio_url, 'https://zernio.com/dashboard/ads')
}

function getDailyPerformance(campaign = {}) {
  const sources = metricSources(campaign)
  for (const source of sources) {
    const rows = source.dailyPerformance || source.daily_performance || source.daily || source.dailyMetrics || source.daily_metrics
    if (Array.isArray(rows) && rows.length) return rows
  }
  return []
}

function summarizeCampaigns(campaigns = []) {
  const totals = { spend: 0, impressions: 0, clicks: 0, active: 0 }
  for (const campaign of campaigns) {
    const metrics = getCampaignMetrics(campaign)
    totals.spend += asNumber(metrics.find((metric) => metric.key === 'spend')?.value) || 0
    totals.impressions += asNumber(metrics.find((metric) => metric.key === 'impressions')?.value) || 0
    totals.clicks += asNumber(metrics.find((metric) => metric.key === 'clicks')?.value) || 0
    if (getCampaignStatus(campaign).key === 'active') totals.active += 1
  }
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : null
  return { ...totals, ctr }
}

function DailyPerformancePreview({ campaign }) {
  const rows = getDailyPerformance(campaign).slice(-14)
  const values = rows.map((row) => asNumber(row.spend ?? row.amountSpent ?? row.impressions ?? row.clicks) || 0)
  const max = Math.max(...values, 1)

  return (
    <div className="boost-ads-daily-chart" aria-label="Daily performance">
      {rows.length ? rows.map((row, index) => {
        const value = values[index]
        const height = Math.max(8, (value / max) * 82)
        return (
          <span
            key={`${row.date || row.metricDate || index}`}
            title={`${row.date || row.metricDate || 'Day'}: ${formatNumber(value)}`}
            style={{ height: `${height}%` }}
          />
        )
      }) : (
        <div className="boost-ads-daily-empty">Daily performance will appear after Zernio reports it.</div>
      )}
    </div>
  )
}

function CampaignRow({ campaign, selected, onSelect }) {
  const metrics = getCampaignMetrics(campaign)
  const status = getCampaignStatus(campaign)
  const spend = metrics.find((metric) => metric.key === 'spend')
  const impressions = metrics.find((metric) => metric.key === 'impressions')
  const ctr = metrics.find((metric) => metric.key === 'ctr')

  return (
    <button type="button" className="boost-ads-row" data-selected={selected} onClick={onSelect}>
      <span className="boost-ads-row-icon">
        <Megaphone className="h-4 w-4" />
      </span>
      <span className="boost-ads-row-main">
        <strong>{getCampaignName(campaign)}</strong>
        <small>{getCampaignPreview(campaign)}</small>
      </span>
      <span className="boost-ads-platform">{getPlatformLabel(campaign.platform)}</span>
      <span className="boost-ads-status" data-tone={status.tone}>{status.label}</span>
      <span className="boost-ads-row-metric"><strong>{getBudgetLabel(campaign)}</strong><small>Budget</small></span>
      <span className="boost-ads-row-metric"><strong>{spend.formatted}</strong><small>Spend</small></span>
      <span className="boost-ads-row-metric"><strong>{impressions.formatted}</strong><small>Impressions</small></span>
      <span className="boost-ads-row-metric"><strong>{ctr.formatted}</strong><small>CTR</small></span>
      <ChevronRight className="boost-ads-row-chevron h-4 w-4" />
    </button>
  )
}

function CampaignDrawer({ campaign, onClose }) {
  if (!campaign) return null
  const metrics = getCampaignMetrics(campaign)
  const status = getCampaignStatus(campaign)
  const url = getCampaignUrl(campaign)

  return (
    <aside className="boost-ads-drawer">
      <div className="boost-ads-drawer-head">
        <div>
          <p className="assistant-training-kicker">Boost detail</p>
          <h2>{getCampaignName(campaign)}</h2>
          <span>{getPlatformLabel(campaign.platform)} · {firstText(campaign.goal, campaign.objective, 'engagement')}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close ad detail">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="boost-ads-drawer-meta">
        <span className="boost-ads-status" data-tone={status.tone}>{status.label}</span>
        <strong>{getBudgetLabel(campaign)}</strong>
        <small>read-only ad reporting from Zernio</small>
      </div>
      <section>
        <p className="boost-ads-section-label">Creative</p>
        <div className="boost-ads-creative">{getCampaignPreview(campaign)}</div>
      </section>
      <section>
        <p className="boost-ads-section-label">Metrics</p>
        <div className="boost-ads-metric-grid">
          {metrics.map((metric) => (
            <div key={metric.key} className="boost-ads-metric-card">
              <span>{metric.label}</span>
              <strong>{metric.formatted}</strong>
            </div>
          ))}
        </div>
      </section>
      <section>
        <p className="boost-ads-section-label">Daily performance</p>
        <DailyPerformancePreview campaign={campaign} />
      </section>
      <div className="boost-ads-drawer-actions">
        <a href={url} target="_blank" rel="noreferrer" className="portal-button-secondary">
          Open in Zernio
          <ExternalLink className="h-4 w-4" />
        </a>
        <Link to="/inbox" className="portal-button-secondary">
          View comments
          <MessageSquare className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  )
}

export default function BoostAds() {
  const { profile } = useOutletContext()
  const [platform, setPlatform] = useState('all')
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['boost-campaigns', profile?.client_id, platform],
    queryFn: () => fetchBoostCampaigns({ platform: platform === 'all' ? '' : platform, range: '30d' }),
    enabled: Boolean(profile?.client_id),
    refetchOnWindowFocus: true,
  })
  const campaigns = useMemo(() => (Array.isArray(data?.campaigns) ? data.campaigns : []), [data])
  const [selectedId, setSelectedId] = useState('')
  const selectedCampaign = useMemo(() => {
    if (!campaigns.length) return null
    if (!selectedId) return campaigns[0]
    return campaigns.find((campaign) => firstText(campaign.id, campaign._id, campaign.platformCampaignId, campaign.platform_campaign_id) === selectedId) || null
  }, [campaigns, selectedId])
  const summary = useMemo(() => summarizeCampaigns(campaigns), [campaigns])

  function selectCampaign(campaign) {
    setSelectedId(firstText(campaign.id, campaign._id, campaign.platformCampaignId, campaign.platform_campaign_id))
  }

  return (
    <div className="boost-ads-page portal-page">
      <header className="boost-ads-header">
        <div>
          <p className="assistant-training-kicker">Publisher ads</p>
          <h1 className="portal-page-title">Ads</h1>
          <p className="portal-page-subtitle">
            Review boosted post campaigns, spend, impressions, CTR, and daily performance from Zernio. This is a read-only reporting view.
          </p>
        </div>
        <div className="boost-ads-header-actions">
          <select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Filter ad platform">
            <option value="all">All platforms</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <button type="button" className="portal-button-secondary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </header>

      <section className="boost-ads-summary">
        <div>
          <span>Active</span>
          <strong>{summary.active}</strong>
        </div>
        <div>
          <span>Spend</span>
          <strong>{formatMoney(summary.spend)}</strong>
        </div>
        <div>
          <span>Impressions</span>
          <strong>{formatNumber(summary.impressions)}</strong>
        </div>
        <div>
          <span>CTR</span>
          <strong>{summary.ctr === null ? '—' : `${summary.ctr.toFixed(2)}%`}</strong>
        </div>
      </section>

      <div className="boost-ads-layout">
        <section className="boost-ads-table">
          <div className="boost-ads-table-head">
            <div>
              <BarChart3 className="h-4 w-4" />
              <strong>Boosted posts</strong>
            </div>
            <span>{campaigns.length} shown</span>
          </div>

          {isLoading ? (
            <div className="boost-ads-empty">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading ads from Zernio...
            </div>
          ) : error ? (
            <div className="boost-ads-empty boost-ads-empty--error">
              {error.message || 'Could not load boosted ads.'}
            </div>
          ) : campaigns.length ? (
            <div className="boost-ads-rows">
              {campaigns.map((campaign, index) => {
                const key = firstText(campaign.id, campaign._id, campaign.platformCampaignId, campaign.platform_campaign_id, `${campaign.platform}-${index}`)
                return (
                  <CampaignRow
                    key={key}
                    campaign={campaign}
                    selected={selectedCampaign === campaign}
                    onSelect={() => selectCampaign(campaign)}
                  />
                )
              })}
            </div>
          ) : (
            <div className="boost-ads-empty">
              No boosted ads found yet.
              <Link to="/calendar">
                Open Publisher
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>

        <CampaignDrawer campaign={selectedCampaign} onClose={() => setSelectedId('')} />
      </div>
    </div>
  )
}
