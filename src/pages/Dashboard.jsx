import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  Camera, Users2, Globe, TrendingUp,
  Users, Eye, MousePointerClick, Activity,
} from 'lucide-react'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchUserProfile() {
  const { data, error } = await supabase
    .from('users')
    .select('*, clients(*)')
    .single()
  if (error) throw error
  return data
}

async function fetchLatestMetrics(clientId) {
  const { data, error } = await supabase
    .from('metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('recorded_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

async function fetchWebsiteAnalytics(clientId) {
  const { data, error } = await supabase
    .from('website_analytics')
    .select('*')
    .eq('client_id', clientId)
    .order('recorded_date', { ascending: false })
    .limit(30)
  if (error) throw error
  return data ?? []
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLatestValue(metrics, platform, metricType) {
  const match = metrics.find(
    m => m.platform === platform && m.metric_type === metricType
  )
  return match ? Number(match.value).toLocaleString() : '—'
}

function buildChartData(metrics) {
  // Group follower metrics by date across all platforms
  const byDate = {}
  metrics
    .filter(m => m.metric_type === 'followers')
    .forEach(m => {
      if (!byDate[m.recorded_date]) byDate[m.recorded_date] = { date: m.recorded_date }
      byDate[m.recorded_date][m.platform] = Number(m.value)
    })
  return Object.values(byDate)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-30)
    .map(d => ({ ...d, date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }))
}

// ── Sub-components ────────────────────────────────────────────────────────────

const platformConfig = {
  instagram: { label: 'Instagram', Icon: Camera,  color: '#a855f7', gradient: 'from-purple-600 to-pink-500' },
  facebook:  { label: 'Facebook',  Icon: Users2,  color: '#3b82f6', gradient: 'from-blue-600 to-blue-400' },
  google:    { label: 'Google',    Icon: Globe,     color: '#10b981', gradient: 'from-emerald-500 to-teal-400' },
  tiktok:    { label: 'TikTok',    Icon: Activity,  color: '#f472b6', gradient: 'from-pink-500 to-rose-400' },
}

function KpiCard({ platform, value, subLabel }) {
  const { label, Icon, gradient } = platformConfig[platform]
  return (
    <div className="relative bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-5 overflow-hidden group hover:border-zinc-700/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30">
      {/* Subtle gradient tint */}
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-5 blur-2xl group-hover:opacity-10 transition-opacity`} />
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <span className="text-xs text-zinc-600 font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{subLabel}</p>
    </div>
  )
}

function WebsiteCard({ analytics }) {
  const today = analytics[0]
  const yesterday = analytics[1]

  const views = today?.page_views ?? 0
  const visitors = today?.unique_visitors ?? 0
  const prevViews = yesterday?.page_views ?? 0
  const trend = prevViews > 0 ? Math.round(((views - prevViews) / prevViews) * 100) : null

  return (
    <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-5 hover:border-zinc-700/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 col-span-2 md:col-span-1">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-400 flex items-center justify-center shadow-md">
          <Globe className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <span className="text-xs text-zinc-600 font-medium uppercase tracking-wider">Website</span>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="text-3xl font-bold text-white tabular-nums">{views.toLocaleString()}</p>
          <div className="flex items-center gap-1 mt-1">
            <Eye className="w-3 h-3 text-zinc-500" />
            <p className="text-xs text-zinc-500">Page views today</p>
          </div>
        </div>
        <div className="border-l border-zinc-800 pl-6">
          <p className="text-3xl font-bold text-white tabular-nums">{visitors.toLocaleString()}</p>
          <div className="flex items-center gap-1 mt-1">
            <Users className="w-3 h-3 text-zinc-500" />
            <p className="text-xs text-zinc-500">Unique visitors</p>
          </div>
        </div>
        {trend !== null && (
          <div className="ml-auto self-end">
            <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${trend >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {trend >= 0 ? '+' : ''}{trend}% vs yesterday
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-2 font-medium">{label}</p>
      {payload.map(entry => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-zinc-400 capitalize">{entry.dataKey}:</span>
          <span className="text-white font-semibold">{Number(entry.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { session } = useOutletContext()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchUserProfile,
  })

  const clientId = profile?.client_id

  const { data: metrics = [], isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics', clientId],
    queryFn: () => fetchLatestMetrics(clientId),
    enabled: !!clientId,
  })

  const { data: analytics = [] } = useQuery({
    queryKey: ['analytics', clientId],
    queryFn: () => fetchWebsiteAnalytics(clientId),
    enabled: !!clientId,
  })

  const chartData = buildChartData(metrics)
  const hasChartData = chartData.length > 0

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{today}</p>
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          {profile?.clients?.business_name
            ? `${profile.clients.business_name}`
            : 'Dashboard'}
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Here's how your social presence is performing.</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {(['instagram', 'facebook', 'google', 'tiktok']).map(platform => (
          <KpiCard
            key={platform}
            platform={platform}
            value={metricsLoading ? '…' : getLatestValue(metrics, platform, 'followers')}
            subLabel="Followers"
          />
        ))}
      </div>

      {/* Website + Chart row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <WebsiteCard analytics={analytics} />

        {/* Quick stats card */}
        <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-5 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-white">This Month</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Total Followers', value: metricsLoading ? '…' : metrics.filter(m => m.metric_type === 'followers').reduce((s, m) => s + Number(m.value), 0).toLocaleString(), icon: Users },
              { label: 'Avg Engagement', value: metricsLoading ? '…' : getLatestValue(metrics, 'instagram', 'engagement'), icon: MousePointerClick },
              { label: 'Total Reach', value: metricsLoading ? '…' : getLatestValue(metrics, 'instagram', 'reach'), icon: Eye },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-500">{label}</span>
                </div>
                <span className="text-sm font-semibold text-white tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Followers over time chart */}
      <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-white">Follower Growth</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Last 30 days across all platforms</p>
          </div>
          <div className="flex items-center gap-2">
            {Object.entries(platformConfig).map(([key, { label, color }]) => (
              <div key={key} className="hidden sm:flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-[10px] text-zinc-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {hasChartData ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#52525b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#52525b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={45}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3f3f46', strokeWidth: 1 }} />
              {Object.entries(platformConfig).map(([key, { color }]) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-zinc-600" />
            </div>
            <div className="text-center">
              <p className="text-sm text-zinc-400 font-medium">No data yet</p>
              <p className="text-xs text-zinc-600 mt-1">Metrics will appear once n8n starts pulling data</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
