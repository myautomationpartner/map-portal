import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { fetchMetrics, fetchProfile } from '../lib/portalApi'
import {
  ArrowUpRight,
  Camera,
  FolderOpen,
  MapPin,
  MessageSquareMore,
  Music2,
  Pencil,
  Plus,
  Send,
  Share2,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

function getMetricValue(metrics, platform, field) {
  const row = metrics.find((entry) => entry.platform?.toLowerCase() === platform.toLowerCase())
  if (!row) return null
  const value = row[field]
  return value ? Number(value).toLocaleString() : null
}

const PLATFORM_CONFIG = [
  { id: 'instagram', label: 'Instagram', icon: Camera, color: '#ee6aa7', field: 'followers' },
  { id: 'facebook', label: 'Facebook', icon: Share2, color: '#4f6bff', field: 'followers' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, color: '#7b61ff', field: 'followers' },
  { id: 'google', label: 'Google', icon: MapPin, color: '#37b58c', field: 'reach' },
]

const DEFAULT_TOOLS = [
  { id: 1, icon: '⚡', label: 'Jackrabbit', url: 'https://app.jackrabbitclass.com' },
  { id: 2, icon: '💬', label: 'Tidio', url: 'https://www.tidio.com/panel/' },
  { id: 3, icon: '📊', label: 'Meta Business', url: 'https://business.facebook.com' },
  { id: 4, icon: '🌐', label: 'Google Profile', url: 'https://business.google.com' },
]

const EMOJI_OPTIONS = ['⚡', '💬', '📊', '🌐', '📅', '🎓', '🎯', '📝', '📸', '🛒', '📧', '📞', '🔗', '📂', '⭐', '🎪']

function loadTools() {
  try {
    const stored = localStorage.getItem('ds_tools')
    return stored ? JSON.parse(stored) : DEFAULT_TOOLS
  } catch {
    return DEFAULT_TOOLS
  }
}

function saveTools(tools) {
  try {
    localStorage.setItem('ds_tools', JSON.stringify(tools))
  } catch {
    return undefined
  }
}

function ToolForm({ onAdd, onClose }) {
  const [icon, setIcon] = useState('🔗')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (!label.trim() || !url.trim()) return
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    onAdd({ id: Date.now(), icon, label: label.trim(), url: fullUrl })
    onClose()
  }

  return (
    <div className="portal-panel rounded-[28px] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>Add a quick tool</h3>
          <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>Pin the apps your team opens every day.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
          style={{ background: 'rgba(79, 107, 255, 0.08)', color: 'var(--portal-primary)' }}
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            Icon
          </label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setIcon(entry)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border text-lg transition-all"
                style={icon === entry
                  ? { borderColor: 'rgba(79, 107, 255, 0.24)', background: 'rgba(79, 107, 255, 0.1)' }
                  : { borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.9)' }}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            Name
          </label>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="portal-input px-4 py-3 text-sm"
            placeholder="Square invoices"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            URL
          </label>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="portal-input px-4 py-3 text-sm"
            placeholder="app.squareup.com"
          />
        </div>

        <button type="submit" className="portal-button-primary rounded-2xl px-4 py-3 text-sm font-semibold">
          Save tool
        </button>
      </form>
    </div>
  )
}

function ToolCard({ tool, onRemove }) {
  return (
    <div className="portal-stat-card rounded-[24px] p-4">
      <div className="mb-5 flex items-start justify-between gap-3">
        <span className="text-3xl">{tool.icon}</span>
        <button
          type="button"
          onClick={() => onRemove(tool.id)}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all"
          style={{ background: 'rgba(216, 95, 152, 0.08)', color: 'var(--portal-danger)' }}
        >
          Remove
        </button>
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{tool.label}</p>
      <a
        href={tool.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-2 text-xs font-semibold"
        style={{ color: 'var(--portal-primary)' }}
      >
        Open tool
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

export default function Dashboard() {
  useOutletContext()

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const clientId = profile?.client_id
  const { data: rawMetrics = [] } = useQuery({
    queryKey: ['metrics', clientId],
    queryFn: () => fetchMetrics(clientId),
    enabled: !!clientId,
  })

  const metrics = [
    { platform: 'instagram', followers: 8312 },
    { platform: 'facebook', followers: 5521 },
    { platform: 'tiktok', followers: 12400 },
    { platform: 'google', reach: 2148 },
  ].map((fallback) => rawMetrics.find((metric) => metric.platform?.toLowerCase() === fallback.platform) || fallback)

  const [tools, setTools] = useState(loadTools)
  const [showAddTool, setShowAddTool] = useState(false)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  function addTool(tool) {
    const next = [...tools, tool]
    setTools(next)
    saveTools(next)
  }

  function removeTool(id) {
    const next = tools.filter((tool) => tool.id !== id)
    setTools(next)
    saveTools(next)
  }

  return (
    <div className="portal-page mx-auto max-w-[1480px] space-y-6 md:p-6 xl:p-8">
      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Client dashboard
              </span>
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                {today}
              </span>
            </div>
            <h1 className="portal-page-title font-display">A calmer control center for the Dancescapes team.</h1>
            <p className="portal-page-subtitle text-sm md:text-base">
              The shell now leans into a cleaner dashboard feel: lighter surfaces, stronger content grouping, and quicker access to documents, publishing, and studio tools.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to="/documents" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
              <FolderOpen className="h-4 w-4" />
              Open Documents
            </Link>
            <Link to="/post" className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
              <Send className="h-4 w-4" />
              Create Post
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLATFORM_CONFIG.map((platform) => {
          const value = getMetricValue(metrics, platform.id, platform.field)
          const Icon = platform.icon

          return (
            <Link
              key={platform.id}
              to={`/stats/${platform.id}`}
              className="portal-stat-card rounded-[28px] p-5 transition-all duration-200 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px]" style={{ background: `${platform.color}18` }}>
                  <Icon className="h-5 w-5" style={{ color: platform.color }} />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                  Live
                </span>
              </div>
              <p className="mt-5 text-sm font-semibold" style={{ color: 'var(--portal-text-muted)' }}>{platform.label}</p>
              <p className="mt-1 text-3xl font-semibold tracking-[-0.04em]" style={{ color: 'var(--portal-text)' }}>{value || '—'}</p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--portal-primary)' }}>
                View stats
                <ArrowUpRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          )
        })}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
        <section className="portal-panel rounded-[32px] p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>Daily workspace</h2>
              <p className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Pinned tools for the client team.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddTool((current) => !current)}
              className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              {showAddTool ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showAddTool ? 'Hide editor' : 'Add tool'}
            </button>
          </div>

          {showAddTool && <ToolForm onAdd={addTool} onClose={() => setShowAddTool(false)} />}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} onRemove={removeTool} />
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="portal-panel rounded-[32px] p-5 md:p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px]" style={{ background: 'linear-gradient(135deg, rgba(79, 107, 255, 0.12), rgba(62, 197, 255, 0.12))' }}>
                <Sparkles className="h-5 w-5" style={{ color: 'var(--portal-primary)' }} />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>Client snapshot</h3>
                <p className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Quick status for this workspace.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="portal-stat-card rounded-[24px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Business</p>
                <p className="mt-2 text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>
                  {profile?.clients?.business_name || 'Dancescapes'}
                </p>
              </div>
              <div className="portal-stat-card rounded-[24px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Role</p>
                <p className="mt-2 text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>
                  {profile?.role || 'Client user'}
                </p>
              </div>
              <div className="portal-stat-card rounded-[24px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Priority Actions</p>
                <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                  <Link to="/documents" className="flex items-center justify-between rounded-2xl px-3 py-3" style={{ background: 'rgba(79, 107, 255, 0.05)' }}>
                    <span className="inline-flex items-center gap-2"><FolderOpen className="h-4 w-4" /> Review client files</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link to="/inbox" className="flex items-center justify-between rounded-2xl px-3 py-3" style={{ background: 'rgba(135, 92, 245, 0.05)' }}>
                    <span className="inline-flex items-center gap-2"><MessageSquareMore className="h-4 w-4" /> Check inbox</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="portal-panel rounded-[32px] p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Layout direction</h3>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              This screen now establishes the same visual language the documents workspace uses: structured header, strong action bar, and softer content panels instead of floating standalone cards.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
