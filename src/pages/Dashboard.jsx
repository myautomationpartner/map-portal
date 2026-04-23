import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { fetchMetrics, fetchProfile } from '../lib/portalApi'
import {
  ArrowUpRight,
  Camera,
  CalendarDays,
  FolderOpen,
  Globe,
  Grip,
  MapPin,
  Music2,
  Pencil,
  Plus,
  Send,
  Share2,
  Shrink,
} from 'lucide-react'

function getMetricValue(metrics, platform, field) {
  const row = metrics.find((entry) => entry.platform?.toLowerCase() === platform.toLowerCase())
  if (!row) return null
  const value = row[field]
  return value ? Number(value).toLocaleString() : null
}

const PLATFORM_CONFIG = [
  { id: 'instagram', label: 'Instagram', icon: Camera, color: '#ee6aa7', field: 'followers' },
  { id: 'facebook', label: 'Facebook', icon: Share2, color: '#c9a84c', field: 'followers' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, color: '#8a8278', field: 'followers' },
  { id: 'google', label: 'Google', icon: MapPin, color: '#37b58c', field: 'reach' },
]

const DEFAULT_TOOLS = [
  { id: 1, label: 'Jackrabbit', url: 'https://app.jackrabbitclass.com' },
  { id: 2, label: 'Tidio', url: 'https://www.tidio.com/panel/' },
  { id: 3, label: 'Meta Business Suite', url: 'https://business.facebook.com/latest/home' },
  { id: 4, label: 'Google Business Profile', url: 'https://business.google.com' },
]

const QUICK_TOOL_PRESETS = [
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com', accent: '#ea4335' },
  { id: 'outlook', label: 'Outlook', url: 'https://outlook.office.com/mail/', accent: '#0078d4' },
  { id: 'yahoo-mail', label: 'Yahoo Mail', url: 'https://mail.yahoo.com', accent: '#5f01d1' },
  { id: 'proton-mail', label: 'Proton Mail', url: 'https://mail.proton.me', accent: '#6d4aff' },
  { id: 'icloud-mail', label: 'iCloud Mail', url: 'https://www.icloud.com/mail', accent: '#0a84ff' },
  { id: 'google-drive', label: 'Google Drive', url: 'https://drive.google.com', accent: '#1a73e8' },
]

function normalizeToolUrl(rawUrl) {
  if (!rawUrl?.trim()) return ''
  return rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ? rawUrl : `https://${rawUrl}`
}

function getToolInitials(label) {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'TL'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

function getToolHostname(url) {
  if (!url) return ''

  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function getToolIconCandidates(url) {
  if (!url) return []

  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.replace(/^www\./, '')

    return [
      `${parsed.origin}/apple-touch-icon.png`,
      `${parsed.origin}/favicon.ico`,
      `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
    ]
  } catch {
    return []
  }
}

function hydrateTool(tool) {
  return {
    ...tool,
    url: normalizeToolUrl(tool.url),
    icon: tool.icon ?? null,
    size: ['sm', 'lg'].includes(tool.size) ? tool.size : 'sm',
  }
}

function loadTools() {
  try {
    const stored = localStorage.getItem('ds_tools')
    const parsed = stored ? JSON.parse(stored) : DEFAULT_TOOLS
    return Array.isArray(parsed) ? parsed.map(hydrateTool) : DEFAULT_TOOLS.map(hydrateTool)
  } catch {
    return DEFAULT_TOOLS.map(hydrateTool)
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
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const normalizedUrl = normalizeToolUrl(url)
  const faviconPreview = getToolIconCandidates(normalizedUrl)[2] || getToolIconCandidates(normalizedUrl)[1]

  function handleSubmit(event) {
    event.preventDefault()
    if (!label.trim() || !url.trim()) return
    onAdd({ id: Date.now(), label: label.trim(), url: normalizedUrl })
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
          style={{ background: 'rgba(201, 168, 76, 0.1)', color: 'var(--portal-primary)' }}
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            Quick Add
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_TOOL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onAdd({ id: Date.now(), label: preset.label, url: preset.url })}
                className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition-all"
                style={{
                  borderColor: 'var(--portal-border)',
                  background: 'rgba(255,255,255,0.9)',
                  color: 'var(--portal-text)',
                }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-xl text-xs font-bold" style={{ background: `${preset.accent}18`, color: preset.accent }}>
                  {getToolInitials(preset.label)}
                </span>
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            Adds common inbox shortcuts and Google Drive in one click.
          </p>
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

        <div className="rounded-[24px] border px-4 py-3" style={{ borderColor: 'var(--portal-border)', background: 'rgba(248, 244, 236, 0.72)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            Icon preview
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border bg-white" style={{ borderColor: 'rgba(201, 168, 76, 0.18)' }}>
              {faviconPreview ? (
                <img src={faviconPreview} alt="" className="h-8 w-8 object-contain" />
              ) : (
                <Globe className="h-5 w-5" style={{ color: 'var(--portal-text-soft)' }} />
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              The workspace will try the site icon first, then fall back to a clean text badge if the website does not expose one.
            </p>
          </div>
        </div>

        <button type="submit" className="portal-button-primary rounded-2xl px-4 py-3 text-sm font-semibold">
          Save tool
        </button>
      </form>
    </div>
  )
}

function ToolIcon({ tool }) {
  const sources = useMemo(() => getToolIconCandidates(tool.url), [tool.url])
  const [sourceIndex, setSourceIndex] = useState(0)
  const [showFallback, setShowFallback] = useState(!sources.length)

  useEffect(() => {
    setSourceIndex(0)
    setShowFallback(!sources.length)
  }, [sources.length, tool.url])

  if (!showFallback && sources[sourceIndex]) {
    return (
      <img
        src={sources[sourceIndex]}
        alt=""
        className="h-10 w-10 rounded-2xl object-contain"
        onError={() => {
          if (sourceIndex < sources.length - 1) {
            setSourceIndex(sourceIndex + 1)
            return
          }
          setShowFallback(true)
        }}
      />
    )
  }

  if (tool.icon) {
    return <span className="text-3xl">{tool.icon}</span>
  }

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold"
      style={{ background: 'rgba(201, 168, 76, 0.14)', color: 'var(--portal-primary-strong)' }}
    >
      {getToolInitials(tool.label)}
    </div>
  )
}

function getNextToolSize(size) {
  return size === 'sm' ? 'lg' : 'sm'
}

function reorderTools(tools, fromId, toId) {
  const fromIndex = tools.findIndex((tool) => tool.id === fromId)
  const toIndex = tools.findIndex((tool) => tool.id === toId)

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return tools

  const next = [...tools]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function ToolTile({ tool, editMode, onOpen, onRemove, onResize, onDragStart, onDragOver, onDrop }) {
  const hostname = getToolHostname(tool.url)
  const isLarge = tool.size === 'lg'

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={editMode}
      onDragStart={() => onDragStart(tool.id)}
      onDragOver={(event) => onDragOver(event, tool.id)}
      onDrop={() => onDrop(tool.id)}
      onClick={() => onOpen(tool)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(tool)
        }
      }}
      className={`group relative overflow-hidden rounded-[30px] border text-left transition-all duration-200 hover:-translate-y-1 ${isLarge ? 'sm:col-span-2' : ''}`}
      style={{
        borderColor: 'rgba(26, 24, 20, 0.08)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248, 250, 255, 0.92))',
        boxShadow: '0 14px 28px rgba(26, 24, 20, 0.06)',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-24"
        style={{
          background: 'linear-gradient(180deg, rgba(201, 168, 76, 0.08), transparent)',
        }}
      />

      <div className={`relative flex h-full flex-col ${isLarge ? 'min-h-[220px] p-5' : 'min-h-[170px] p-4'}`}>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              if (editMode) onRemove(tool.id)
            }}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all"
            style={editMode
              ? { background: 'rgba(216, 95, 152, 0.08)', color: 'var(--portal-danger)', opacity: 1 }
              : { background: 'rgba(26, 24, 20, 0.05)', color: 'var(--portal-text-soft)', opacity: 0 }}
            aria-hidden={!editMode}
            tabIndex={editMode ? 0 : -1}
          >
            Remove
          </button>

          <div className="flex items-center gap-2">
            {editMode && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onResize(tool.id)
                  }}
                  className="rounded-full p-2 transition-all"
                  style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--portal-text-soft)' }}
                  aria-label={`Resize ${tool.label}`}
                >
                  <Shrink className="h-4 w-4" />
                </button>
                <div
                  className="rounded-full p-2"
                  style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--portal-text-soft)' }}
                  aria-hidden="true"
                >
                  <Grip className="h-4 w-4" />
                </div>
              </>
            )}
          </div>
        </div>

        <div className={`mt-auto flex flex-col items-center text-center ${isLarge ? 'gap-4' : 'gap-3'}`}>
          <div
            className={`flex items-center justify-center overflow-hidden rounded-[28px] bg-white shadow-sm ${isLarge ? 'h-24 w-24' : 'h-18 w-18'}`}
            style={{
              border: '1px solid rgba(26, 24, 20, 0.07)',
              boxShadow: '0 14px 24px rgba(26, 24, 20, 0.08)',
              width: isLarge ? '6rem' : '4.5rem',
              height: isLarge ? '6rem' : '4.5rem',
            }}
          >
            <ToolIcon tool={tool} />
          </div>

          <div>
            <p className={`font-semibold ${isLarge ? 'text-base' : 'text-sm'}`} style={{ color: 'var(--portal-text)' }}>
              {tool.label}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-soft)' }}>
              {hostname || 'External app'}
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ background: 'rgba(201, 168, 76, 0.1)', color: 'var(--portal-primary-strong)' }}>
            {editMode ? 'Drag to move' : 'Tap to open'}
            {!editMode && <ArrowUpRight className="h-3.5 w-3.5" />}
          </div>
        </div>
      </div>
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
  const [editMode, setEditMode] = useState(false)
  const [draggedToolId, setDraggedToolId] = useState(null)

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

  function resizeTool(id) {
    const next = tools.map((tool) => (
      tool.id === id
        ? { ...tool, size: getNextToolSize(tool.size) }
        : tool
    ))
    setTools(next)
    saveTools(next)
  }

  function openTool(tool) {
    window.open(tool.url, '_blank', 'noopener,noreferrer')
  }

  function handleToolDrop(targetId) {
    if (!draggedToolId || draggedToolId === targetId) return
    const next = reorderTools(tools, draggedToolId, targetId)
    setTools(next)
    setDraggedToolId(null)
    saveTools(next)
  }

  return (
    <div className="portal-page mx-auto max-w-[1480px] space-y-6 md:p-6 xl:p-8">
      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                {today}
              </span>
            </div>
            <h1 className="portal-page-title font-display">Dashboard</h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to="/post" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" />
              Open Planner
            </Link>
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

      <section className="portal-panel rounded-[32px] p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>Daily workspace</h2>
            <p className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Pinned apps, inboxes, and drives for the client team.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditMode((current) => !current)}
              className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              <Pencil className="h-4 w-4" />
              {editMode ? 'Done editing' : 'Edit layout'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddTool((current) => !current)}
              className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              {showAddTool ? 'Hide tools' : 'Add tool'}
            </button>
          </div>
        </div>

        {showAddTool && <ToolForm onAdd={addTool} onClose={() => setShowAddTool(false)} />}

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: 'rgba(26, 24, 20, 0.05)', color: 'var(--portal-text-soft)' }}>
            {tools.length} apps pinned
          </span>
          <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: editMode ? 'rgba(201, 168, 76, 0.14)' : 'rgba(31, 169, 113, 0.1)', color: editMode ? 'var(--portal-primary-strong)' : 'var(--portal-success)' }}>
            {editMode ? 'Edit mode on' : 'Launcher ready'}
          </span>
          <span className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            {editMode ? 'Drag icons to move them and use the resize control to change their footprint.' : 'Tap any icon to open the app directly.'}
          </span>
        </div>

        <div className="grid auto-rows-[170px] gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tools.map((tool) => (
            <ToolTile
              key={tool.id}
              tool={tool}
              editMode={editMode}
              onOpen={openTool}
              onRemove={removeTool}
              onResize={resizeTool}
              onDragStart={(id) => setDraggedToolId(id)}
              onDragOver={(event) => {
                if (!editMode) return
                event.preventDefault()
              }}
              onDrop={handleToolDrop}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
