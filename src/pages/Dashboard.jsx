import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import { fetchMetrics, fetchProfile } from '../lib/portalApi'
import { Camera, Share2, Music2, MapPin, Send, Plus, Pencil, X, GripVertical, TrendingUp } from 'lucide-react'

function getMetricValue(metrics, platform, field) {
  const row = metrics.find(m => m.platform?.toLowerCase() === platform.toLowerCase())
  if (!row) return null
  const val = row[field]
  return val ? Number(val).toLocaleString() : null
}

// ── Default tools ─────────────────────────────────────────────────────────────

const DEFAULT_TOOLS = [
  { id: 1, icon: '⚡', label: 'Jackrabbit',    url: 'https://app.jackrabbitclass.com' },
  { id: 2, icon: '💬', label: 'Tidio',         url: 'https://www.tidio.com/panel/' },
  { id: 3, icon: '📊', label: 'Meta Business', url: 'https://business.facebook.com' },
  { id: 4, icon: '🌐', label: 'Google Profile', url: 'https://business.google.com' },
]

const EMOJI_OPTIONS = ['⚡','💬','📊','🌐','📅','🎓','🎯','📝','📸','🛒','📧','📞','🔗','📂','⭐','🎪','🎭','💡','🔧','🏠']

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

// ── Platform stats strip ──────────────────────────────────────────────────────

const PLATFORM_CONFIG = [
  { id: 'instagram', label: 'Instagram', icon: Camera, color: '#e879a0', field: 'followers' },
  { id: 'facebook',  label: 'Facebook',  icon: Share2, color: '#5c8fd6', field: 'followers' },
  { id: 'tiktok',    label: 'TikTok',    icon: Music2, color: '#6fcfc9', field: 'followers' },
  { id: 'google',    label: 'Google',    icon: MapPin,  color: '#6ac18e', field: 'reach'     },
]

function StatStrip({ metrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {PLATFORM_CONFIG.map(p => {
        const val = getMetricValue(metrics, p.id, p.field)
        return (
          <Link key={p.id} to={`/stats/${p.id}`}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 hover:-translate-y-px"
            style={{ background: '#1e1910', border: '1px solid #3d3420' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(212,168,58,0.35)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#3d3420'}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${p.color}18` }}>
              <p.icon className="w-4 h-4" style={{ color: p.color }} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-medium truncate" style={{ color: '#8a7858' }}>
                {p.label}
              </p>
              <p className="text-sm font-semibold tabular-nums leading-tight" style={{ color: '#f8f2e4' }}>
                {val || '—'}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Add Tool Modal ─────────────────────────────────────────────────────────────

function AddToolModal({ onAdd, onClose }) {
  const [icon, setIcon] = useState('🔗')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!label.trim() || !url.trim()) return
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    onAdd({ id: Date.now(), icon, label: label.trim(), url: fullUrl })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-2xl p-6 relative"
        style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
        <button onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: '#8a7858' }}
          onMouseEnter={e => e.currentTarget.style.color = '#f8f2e4'}
          onMouseLeave={e => e.currentTarget.style.color = '#8a7858'}>
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-display text-lg font-semibold mb-5" style={{ color: '#f8f2e4' }}>Add Studio Tool</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: '#8a7858' }}>Icon</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} type="button"
                  onClick={() => setIcon(e)}
                  className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                  style={{
                    background: icon === e ? 'rgba(212,168,58,0.15)' : '#252015',
                    border: icon === e ? '1px solid rgba(212,168,58,0.4)' : '1px solid #3d3420',
                  }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: '#8a7858' }}>Name</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Square Invoices"
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all"
              style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
              onFocus={e => e.target.style.borderColor = '#d4a83a'}
              onBlur={e => e.target.style.borderColor = '#3d3420'}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: '#8a7858' }}>URL</label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="app.squareup.com"
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all"
              style={{ background: '#252015', border: '1px solid #3d3420', color: '#f8f2e4' }}
              onFocus={e => e.target.style.borderColor = '#d4a83a'}
              onBlur={e => e.target.style.borderColor = '#3d3420'}
            />
          </div>

          <button type="submit"
            className="w-full rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-px"
            style={{ background: '#d4a83a', color: '#0d0b08' }}>
            Add Tool
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Tool Tile ─────────────────────────────────────────────────────────────────

function ToolTile({ tool, editMode, onRemove, dragHandlers }) {
  if (editMode) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 rounded-2xl relative select-none cursor-grab active:cursor-grabbing"
        style={{ background: '#1e1910', border: '1px solid #3d3420' }}
        {...dragHandlers}>
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center z-10 cursor-pointer"
          style={{ background: '#c4556e', border: '2px solid #0d0b08' }}
          onClick={e => { e.stopPropagation(); onRemove(tool.id) }}>
          <X className="w-3 h-3 text-white" />
        </div>
        <div className="absolute top-2 left-2 opacity-40">
          <GripVertical className="w-3.5 h-3.5" style={{ color: '#8a7858' }} />
        </div>
        <span className="text-3xl mt-1">{tool.icon}</span>
        <span className="text-[11px] font-medium text-center leading-tight max-w-full truncate w-full text-center"
          style={{ color: '#c8b898' }}>
          {tool.label}
        </span>
      </div>
    )
  }

  return (
    <a href={tool.url} target="_blank" rel="noopener noreferrer"
      className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 hover:-translate-y-1"
      style={{ background: '#1e1910', border: '1px solid #3d3420' }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(212,168,58,0.35)'
        e.currentTarget.style.background = '#252015'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#3d3420'
        e.currentTarget.style.background = '#1e1910'
      }}>
      <span className="text-3xl">{tool.icon}</span>
      <span className="text-[11px] font-medium text-center leading-tight max-w-full truncate w-full text-center"
        style={{ color: '#c8b898' }}>
        {tool.label}
      </span>
    </a>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  useOutletContext()

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const clientId = profile?.client_id
  const { data: rawMetrics = [] } = useQuery({
    queryKey: ['metrics', clientId],
    queryFn: () => fetchMetrics(clientId),
    enabled: !!clientId,
  })

  // Merge real data with fallbacks
  const metrics = [
    { platform: 'instagram', followers: 8312 },
    { platform: 'facebook',  followers: 5521 },
    { platform: 'tiktok',    followers: 12400 },
    { platform: 'google',    reach: 2148 },
  ].map(fallback =>
    rawMetrics.find(m => m.platform?.toLowerCase() === fallback.platform.toLowerCase()) || fallback
  )

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  // Tool launcher state
  const [tools, setTools] = useState(loadTools)
  const [editMode, setEditMode] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  // Drag-to-reorder state
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)

  function handleDragStart(index) {
    dragItem.current = index
  }

  function handleDragEnter(index) {
    dragOverItem.current = index
    const newTools = [...tools]
    const dragged = newTools.splice(dragItem.current, 1)[0]
    newTools.splice(index, 0, dragged)
    dragItem.current = index
    setTools(newTools)
  }

  function handleDragEnd() {
    dragItem.current = null
    dragOverItem.current = null
    saveTools(tools)
  }

  function removeTool(id) {
    const updated = tools.filter(t => t.id !== id)
    setTools(updated)
    saveTools(updated)
  }

  function addTool(tool) {
    const updated = [...tools, tool]
    setTools(updated)
    saveTools(updated)
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border"
            style={{ borderColor: '#3d3420' }}>
            <img
              src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
              alt="Dancescapes"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
              <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: '#8a7858' }}>{today}</p>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold leading-tight" style={{ color: '#f8f2e4' }}>
              Good to see you
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#8a7858' }}>Here's what's happening with your studio.</p>
          </div>
        </div>

        {/* Quick publish CTA */}
        <Link to="/post"
          className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-px"
          style={{ background: '#c4556e', color: '#fff' }}>
          <Send className="w-4 h-4" strokeWidth={2} />
          New Post
        </Link>
      </div>

      {/* Social stats strip */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-3.5 h-3.5" style={{ color: '#d4a83a' }} />
          <h2 className="text-xs uppercase tracking-widest font-medium" style={{ color: '#8a7858' }}>
            Social Presence
          </h2>
        </div>
        <StatStrip metrics={metrics} />
      </section>

      {/* Studio Tools launcher */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold" style={{ color: '#f8f2e4' }}>Studio Tools</h2>
            <p className="text-xs mt-0.5" style={{ color: '#8a7858' }}>Your daily workspace, one click away</p>
          </div>
          <div className="flex items-center gap-2">
            {editMode && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(212,168,58,0.12)', border: '1px solid rgba(212,168,58,0.25)', color: '#d4a83a' }}>
                <Plus className="w-3.5 h-3.5" />
                Add Tool
              </button>
            )}
            <button
              onClick={() => setEditMode(m => !m)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={editMode
                ? { background: 'rgba(196,85,110,0.12)', border: '1px solid rgba(196,85,110,0.25)', color: '#c4556e' }
                : { background: '#1e1910', border: '1px solid #3d3420', color: '#8a7858' }
              }>
              <Pencil className="w-3 h-3" />
              {editMode ? 'Done' : 'Edit'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {tools.map((tool, index) => (
            <ToolTile
              key={tool.id}
              tool={tool}
              editMode={editMode}
              onRemove={removeTool}
              dragHandlers={editMode ? {
                draggable: true,
                onDragStart: () => handleDragStart(index),
                onDragEnter: () => handleDragEnter(index),
                onDragEnd: handleDragEnd,
                onDragOver: e => e.preventDefault(),
              } : {}}
            />
          ))}

          {/* Add tile (always visible when NOT in edit mode) */}
          {!editMode && (
            <button
              onClick={() => { setEditMode(true); setShowAddModal(true) }}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 hover:-translate-y-1"
              style={{ background: 'transparent', border: '1px dashed #3d3420', color: '#4e4228' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,58,0.35)'; e.currentTarget.style.color = '#8a7858' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#3d3420'; e.currentTarget.style.color = '#4e4228' }}>
              <span className="text-2xl mt-1">＋</span>
              <span className="text-[11px] font-medium">Add Tool</span>
            </button>
          )}
        </div>

        {editMode && (
          <p className="text-[11px] mt-3 flex items-center gap-1.5" style={{ color: '#4e4228' }}>
            <GripVertical className="w-3.5 h-3.5" />
            Drag tiles to reorder · tap ✕ to remove
          </p>
        )}
      </section>

      {/* Add tool modal */}
      {showAddModal && (
        <AddToolModal
          onAdd={addTool}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
