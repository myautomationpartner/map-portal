import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import {
  fetchMetrics,
  fetchProfile,
  fetchSocialConnections,
  fetchWorkspacePreferences,
  upsertWorkspacePreferences,
} from '../lib/portalApi'
import { DASHBOARD_PLATFORMS, PLATFORM_CATALOG } from '../lib/platformCatalog'
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Cloud,
  CreditCard,
  FolderOpen,
  Globe,
  Grip,
  Mail,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Send,
  Server,
  ShieldCheck,
  Shrink,
  Sparkles,
  Wand2,
} from 'lucide-react'

function getMetricRow(metrics, platform) {
  return metrics.find((entry) => entry.platform?.toLowerCase() === platform.toLowerCase()) || null
}

function getMetricValue(metrics, platform, field) {
  const row = getMetricRow(metrics, platform)
  if (!row) return null
  const value = row[field]
  if (value === null || value === undefined) return null
  return Number(value).toLocaleString()
}

const DAILY_PROMPTS = [
  'What are we doing today to provide more value to your customers?',
  'What small customer moment can we make easier before lunch?',
  'What useful post, answer, or reminder would help someone choose you today?',
  'Where can we remove friction for a parent, client, or prospect today?',
  'What proof can we share today that makes the next step feel simple?',
  'What would make your best customer say, "I am glad they reminded me"?',
  'What can we publish, organize, or answer today that saves someone time?',
]

function getDailyPrompt() {
  const start = new Date(new Date().getFullYear(), 0, 0)
  const day = Math.floor((new Date() - start) / 86400000)
  return DAILY_PROMPTS[day % DAILY_PROMPTS.length]
}

function PlatformMetricCard({ platform, metrics, connectedPlatforms, connectingPlatform, onConnect }) {
  const Icon = platform.Icon
  const metricValue = getMetricValue(metrics, platform.id, platform.metricField)
  const hasMetrics = metricValue !== null
  const isConnected = connectedPlatforms.has(platform.id)
  const isConnecting = connectingPlatform === platform.id
  const statusLabel = isConnected ? 'Connected' : 'Not connected'
  const canConnectNow = platform.connectionEnabled && !isConnected

  return (
    <article
      className="portal-card group flex min-h-[126px] flex-col justify-between p-3.5 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor: isConnected ? `${platform.accent}30` : 'var(--portal-border)',
        background: isConnected
          ? `linear-gradient(180deg, ${platform.soft}, rgba(255,255,255,0.95))`
          : 'rgba(255,255,255,0.92)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ background: platform.accent }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>
              {platform.label}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: isConnected ? platform.accent : 'var(--portal-text-soft)' }}>
              {statusLabel}
            </p>
          </div>
        </div>
        <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ background: platform.soft, color: platform.accent }}>
          {platform.shortLabel}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
            {platform.metricLabel}
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-[-0.04em]" style={{ color: 'var(--portal-text)' }}>
            {hasMetrics ? metricValue : '—'}
          </p>
        </div>

        {canConnectNow ? (
          <button
            type="button"
            onClick={() => onConnect(platform.id)}
            disabled={isConnecting}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-wait disabled:opacity-60"
            style={{ background: platform.soft, color: platform.accent }}
          >
            {isConnecting ? 'Opening...' : 'Connect now'}
          </button>
        ) : isConnected || hasMetrics ? (
          <Link
            to={`/stats/${platform.id}`}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
            style={{ background: 'rgba(26, 24, 20, 0.05)', color: 'var(--portal-text-muted)' }}
          >
            View
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Link
            to="/settings"
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
            style={{ background: 'rgba(26, 24, 20, 0.05)', color: 'var(--portal-text-muted)' }}
          >
            Connect now
          </Link>
        )}
      </div>
    </article>
  )
}

const SETTINGS_CONNECT_ENDPOINT = '/api/n8n/zernio-connect-url'

const TOOL_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Inbox' },
  { id: 'files', label: 'Files' },
  { id: 'social', label: 'Social' },
  { id: 'business', label: 'Business' },
  { id: 'website', label: 'Website' },
]

const QUICK_TOOL_PRESETS = [
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com', accent: '#ea4335', category: 'email', description: 'Google inbox', Icon: Mail },
  { id: 'outlook', label: 'Outlook', url: 'https://outlook.office.com/mail/', accent: '#0078d4', category: 'email', description: 'Microsoft mail', Icon: Mail },
  { id: 'google-drive', label: 'Google Drive', url: 'https://drive.google.com', accent: '#1a73e8', category: 'files', description: 'Docs and files', Icon: Cloud },
  { id: 'onedrive', label: 'OneDrive', url: 'https://onedrive.live.com', accent: '#0078d4', category: 'files', description: 'Microsoft files', Icon: Cloud },
  { id: 'google-business', label: 'Google Business', url: 'https://business.google.com', accent: PLATFORM_CATALOG.google.accent, category: 'social', description: 'Local profile', Icon: PLATFORM_CATALOG.google.Icon },
  { id: 'facebook', label: 'Facebook', url: 'https://business.facebook.com', accent: PLATFORM_CATALOG.facebook.accent, category: 'social', description: 'Publishing auth', Icon: PLATFORM_CATALOG.facebook.Icon, connectPlatform: 'facebook' },
  { id: 'instagram', label: 'Instagram', url: 'https://business.instagram.com', accent: PLATFORM_CATALOG.instagram.accent, category: 'social', description: 'Publishing auth', Icon: PLATFORM_CATALOG.instagram.Icon, connectPlatform: 'instagram' },
  { id: 'tiktok', label: 'TikTok', url: 'https://business.tiktok.com', accent: PLATFORM_CATALOG.tiktok.accent, category: 'social', description: 'Publishing auth', Icon: PLATFORM_CATALOG.tiktok.Icon, connectPlatform: 'tiktok' },
  { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/company/setup/new/', accent: PLATFORM_CATALOG.linkedin.accent, category: 'social', description: 'Publishing auth', Icon: PLATFORM_CATALOG.linkedin.Icon, connectPlatform: 'linkedin' },
  { id: 'twitter', label: 'X / Twitter', url: 'https://x.com', accent: PLATFORM_CATALOG.twitter.accent, category: 'social', description: 'Publishing auth', Icon: PLATFORM_CATALOG.twitter.Icon, connectPlatform: 'twitter' },
  { id: 'stripe', label: 'Stripe', url: 'https://dashboard.stripe.com', accent: '#635bff', category: 'business', description: 'Payments', Icon: CreditCard },
  { id: 'square', label: 'Square', url: 'https://app.squareup.com', accent: '#111111', category: 'business', description: 'POS and invoices', Icon: CreditCard },
  { id: 'quickbooks', label: 'QuickBooks', url: 'https://app.qbo.intuit.com', accent: '#2ca01c', category: 'business', description: 'Accounting', Icon: ShieldCheck },
  { id: 'shopify', label: 'Shopify', url: 'https://admin.shopify.com', accent: '#95bf47', category: 'business', description: 'Store admin', Icon: CreditCard },
  { id: 'godaddy', label: 'GoDaddy', url: 'https://www.godaddy.com', accent: '#00a4a6', category: 'website', description: 'Domain hosting', Icon: Server },
  { id: 'wix', label: 'Wix', url: 'https://manage.wix.com', accent: '#116dff', category: 'website', description: 'Website builder', Icon: Server },
  { id: 'squarespace', label: 'Squarespace', url: 'https://account.squarespace.com', accent: '#111111', category: 'website', description: 'Website builder', Icon: Server },
  { id: 'wordpress', label: 'WordPress', url: 'https://wordpress.com/log-in', accent: '#21759b', category: 'website', description: 'Site admin', Icon: Server },
  { id: 'mailchimp', label: 'Mailchimp', url: 'https://login.mailchimp.com', accent: '#ffe01b', category: 'business', description: 'Email marketing', Icon: Megaphone },
  { id: 'canva', label: 'Canva', url: 'https://www.canva.com', accent: '#00c4cc', category: 'business', description: 'Creative assets', Icon: Sparkles },
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

function getWorkspaceStorageKey(clientKey) {
  return `map_workspace_tools:${clientKey || 'default'}`
}

function buildDefaultTools(client) {
  void client
  return []
}

function loadTools(storageKey, fallbackTools) {
  try {
    const stored = localStorage.getItem(storageKey)
    const parsed = stored ? JSON.parse(stored) : null
    if (Array.isArray(parsed)) return parsed.map(hydrateTool)

    return fallbackTools.map(hydrateTool)
  } catch {
    return fallbackTools.map(hydrateTool)
  }
}

function saveTools(storageKey, tools) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tools))
  } catch {
    return undefined
  }
}

function formatPlatformLabel(platform) {
  if (!platform) return 'Account'
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

function ToolForm({
  tools,
  socialConnections,
  connectingPlatform,
  onAdd,
  onConnect,
  onClose,
}) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const normalizedUrl = normalizeToolUrl(url)
  const faviconPreview = getToolIconCandidates(normalizedUrl)[2] || getToolIconCandidates(normalizedUrl)[1]
  const existingUrls = useMemo(() => new Set((tools || []).map((tool) => normalizeToolUrl(tool.url))), [tools])
  const connectedPlatforms = useMemo(
    () => new Set((socialConnections || []).map((connection) => connection.platform).filter(Boolean)),
    [socialConnections],
  )
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredPresets = QUICK_TOOL_PRESETS.filter((preset) => {
    const categoryMatch = activeCategory === 'all' || preset.category === activeCategory
    const searchMatch = !normalizedSearch || `${preset.label} ${preset.description} ${preset.category}`.toLowerCase().includes(normalizedSearch)
    return categoryMatch && searchMatch
  })

  function handleSubmit(event) {
    event.preventDefault()
    if (!label.trim() || !url.trim()) return
    onAdd({ id: crypto.randomUUID(), label: label.trim(), url: normalizedUrl })
    onClose()
  }

  function addPreset(preset) {
    onAdd({
      id: crypto.randomUUID(),
      label: preset.label,
      url: normalizeToolUrl(preset.url),
      accent: preset.accent,
      category: preset.category,
    })
  }

  return (
    <div className="overflow-hidden rounded-[34px] border" style={{ borderColor: 'rgba(26, 24, 20, 0.08)', background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(246,250,255,0.94))', boxShadow: '0 24px 60px rgba(26, 24, 20, 0.08)' }}>
      <div className="relative border-b px-5 py-5 md:px-6" style={{ borderColor: 'rgba(26, 24, 20, 0.07)' }}>
        <div className="absolute right-6 top-5 hidden h-24 w-24 rounded-full blur-2xl md:block" style={{ background: 'rgba(78, 149, 255, 0.18)' }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: 'rgba(201, 168, 76, 0.12)', color: 'var(--portal-primary-strong)' }}>
              <Sparkles className="h-3.5 w-3.5" />
              Connector library
            </p>
            <h3 className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>Add daily tools</h3>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Known apps already include the correct login URL. Choose one to pin it instantly, or use custom shortcut for anything else.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
            style={{ background: 'rgba(26, 24, 20, 0.06)', color: 'var(--portal-text-muted)' }}
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_380px]">
        <div className="p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative md:max-w-sm md:flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--portal-text-soft)' }} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="portal-input w-full py-3 pl-11 pr-4 text-sm"
                placeholder="Search apps, hosting, payments..."
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 md:justify-end">
              {TOOL_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-all"
                  style={activeCategory === category.id
                    ? { background: 'var(--portal-text)', color: 'white' }
                    : { background: 'rgba(26, 24, 20, 0.06)', color: 'var(--portal-text-muted)' }}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPresets.map((preset) => {
              const Icon = preset.Icon || Globe
              const presetUrl = normalizeToolUrl(preset.url)
              const presetHost = getToolHostname(presetUrl)
              const alreadyPinned = existingUrls.has(presetUrl)
              const canConnect = Boolean(preset.connectPlatform)
              const isConnected = canConnect && connectedPlatforms.has(preset.connectPlatform)
              const isConnecting = connectingPlatform === preset.connectPlatform
              const actionLabel = canConnect
                ? isConnected
                  ? 'Connected'
                  : isConnecting
                    ? 'Connecting...'
                    : 'Connect'
                : alreadyPinned
                  ? 'Pinned'
                  : 'Pin app'

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    if (canConnect) {
                      if (!isConnected && !isConnecting) onConnect(preset.connectPlatform)
                      return
                    }
                    if (!alreadyPinned) addPreset(preset)
                  }}
                  disabled={isConnected || isConnecting || (!canConnect && alreadyPinned)}
                  className="group flex min-h-[116px] items-start gap-3 rounded-[24px] border p-4 text-left transition-all enabled:hover:-translate-y-0.5 disabled:cursor-default"
                  style={{
                    borderColor: (alreadyPinned || isConnected) ? 'rgba(31, 169, 113, 0.22)' : 'rgba(26, 24, 20, 0.08)',
                    background: (alreadyPinned || isConnected) ? 'rgba(31, 169, 113, 0.08)' : 'rgba(255,255,255,0.82)',
                    boxShadow: '0 14px 28px rgba(26, 24, 20, 0.05)',
                  }}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] text-sm font-bold" style={{ background: `${preset.accent}18`, color: preset.accent }}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold" style={{ color: 'var(--portal-text)' }}>{preset.label}</span>
                      {(alreadyPinned || isConnected) ? <Check className="h-4 w-4" style={{ color: 'var(--portal-success)' }} /> : <Plus className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--portal-primary)' }} />}
                    </span>
                    <span className="mt-1 block text-xs" style={{ color: 'var(--portal-text-muted)' }}>{preset.description}</span>
                    <span className="mt-2 block truncate text-[11px] font-medium" style={{ color: 'var(--portal-text-soft)' }}>
                      {canConnect ? `Uses secure ${formatPlatformLabel(preset.connectPlatform)} auth` : presetHost}
                    </span>
                    <span className="mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ background: 'rgba(26, 24, 20, 0.05)', color: 'var(--portal-text-soft)' }}>
                      {actionLabel}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {filteredPresets.length === 0 && (
            <div className="mt-5 rounded-[24px] border border-dashed p-8 text-center" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}>
              No matching connectors yet. Add it as a custom tool and it will still work like a pinned app.
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t p-5 md:p-6 lg:border-l lg:border-t-0" style={{ borderColor: 'rgba(26, 24, 20, 0.07)', background: 'rgba(250, 247, 241, 0.72)' }}>
        <div>
          <h4 className="font-display text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>Custom shortcut</h4>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
            Only use this when the app is not in the connector library. Known apps above already have their URL built in.
          </p>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            Name
          </label>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="portal-input px-4 py-3 text-sm"
            placeholder="Client booking dashboard"
          />
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>
            URL
          </label>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="portal-input px-4 py-3 text-sm"
            placeholder="booking.example.com"
          />
        </div>

        <div className="mt-5 rounded-[24px] border px-4 py-3" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.72)' }}>
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

        <button type="submit" className="portal-button-primary mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold">
          Save custom tool
        </button>
      </form>
      </div>
    </div>
  )
}

function ToolIcon({ tool }) {
  const sources = useMemo(() => getToolIconCandidates(tool.url), [tool.url])
  const [sourceIndex, setSourceIndex] = useState(0)
  const [showFallback, setShowFallback] = useState(!sources.length)

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
            <ToolIcon key={`${tool.id}:${tool.url}`} tool={tool} />
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
  const { requireWriteAccess } = useOutletContext()
  const queryClient = useQueryClient()

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const clientId = profile?.client_id
  const client = profile?.clients || null
  const userId = profile?.id
  const { data: rawMetrics = [] } = useQuery({
    queryKey: ['metrics', clientId],
    queryFn: () => fetchMetrics(clientId),
    enabled: !!clientId,
  })
  const defaultTools = useMemo(() => buildDefaultTools(client), [client])
  const storageKey = useMemo(
    () => getWorkspaceStorageKey(clientId || client?.slug || client?.business_name || 'default'),
    [clientId, client?.slug, client?.business_name],
  )
  const { data: workspacePreference } = useQuery({
    queryKey: ['workspace-preferences', clientId, userId],
    queryFn: () => fetchWorkspacePreferences(clientId, userId),
    enabled: !!clientId && !!userId,
  })
  const { data: socialConnections = [] } = useQuery({
    queryKey: ['social_connections', clientId],
    queryFn: () => fetchSocialConnections(clientId),
    enabled: !!clientId,
  })

  const metrics = rawMetrics
  const connectedPlatformIds = useMemo(
    () => new Set((socialConnections || []).map((connection) => connection.platform).filter(Boolean)),
    [socialConnections],
  )

  const [draftTools, setDraftTools] = useState(null)
  const [draftOwnerKey, setDraftOwnerKey] = useState('')
  const [showAddTool, setShowAddTool] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [connectingPlatform, setConnectingPlatform] = useState(null)
  const [connectorStatus, setConnectorStatus] = useState(null)
  const [draggedToolId, setDraggedToolId] = useState(null)
  const [workspaceState, setWorkspaceState] = useState('idle')
  const workspaceOwnerKey = `${clientId || 'unknown'}:${userId || 'unknown'}`

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const dailyPrompt = getDailyPrompt()

  const resolvedTools = useMemo(() => {
    const persistedTools = Array.isArray(workspacePreference?.workspace_tools_json)
      ? workspacePreference.workspace_tools_json.map(hydrateTool)
      : null
    return persistedTools ?? loadTools(storageKey, defaultTools)
  }, [workspacePreference, storageKey, defaultTools])

  const tools = draftOwnerKey === workspaceOwnerKey && draftTools !== null
    ? draftTools
    : resolvedTools

  async function persistTools(next, options = {}) {
    setDraftOwnerKey(workspaceOwnerKey)
    setDraftTools(next)
    saveTools(storageKey, next)

    if (!clientId || !userId) return

    if (!options.silent) setWorkspaceState('saving')

    try {
      await upsertWorkspacePreferences({
        clientId,
        userId,
        workspaceTools: next,
      })
      setWorkspaceState('saved')
    } catch (error) {
      setWorkspaceState('error')
      if (!options.silent) {
        window.alert(error instanceof Error ? error.message : 'Could not save workspace layout right now.')
      }
    }
  }

  function addTool(tool) {
    const next = [...tools, tool]
    void persistTools(next)
  }

  function removeTool(id) {
    const next = tools.filter((tool) => tool.id !== id)
    void persistTools(next)
  }

  function resizeTool(id) {
    const next = tools.map((tool) => (
      tool.id === id
        ? { ...tool, size: getNextToolSize(tool.size) }
        : tool
    ))
    void persistTools(next)
  }

  function openTool(tool) {
    window.open(tool.url, '_blank', 'noopener,noreferrer')
  }

  function buildSettingsRedirectUrl(platform) {
    if (typeof window === 'undefined') return ''
    const url = new URL('/settings', window.location.origin)
    url.searchParams.set('connected', platform)
    url.searchParams.set('cid', clientId)
    url.searchParams.set('source', 'workspace')
    return url.toString()
  }

  async function connectPlatform(platform) {
    if (!clientId) return
    if (!requireWriteAccess('connect social accounts')) return

    const connectPopup = typeof window !== 'undefined'
      ? window.open('', '_blank', 'width=600,height=700')
      : null

    if (connectPopup && !connectPopup.closed) {
      connectPopup.document.write(`
        <title>Opening ${formatPlatformLabel(platform)}...</title>
        <body style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #1f2937;">
          <p style="margin: 0 0 8px; font-size: 15px; font-weight: 700;">Opening ${formatPlatformLabel(platform)} auth...</p>
          <p style="margin: 0; font-size: 14px; color: #6b7280;">Finish the secure connection in this window, then return to MAP.</p>
        </body>
      `)
    }

    setConnectingPlatform(platform)
    setConnectorStatus(null)

    try {
      const res = await fetch(SETTINGS_CONNECT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          platform,
          redirectUrl: buildSettingsRedirectUrl(platform),
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.authUrl) {
        if (connectPopup && !connectPopup.closed) {
          connectPopup.opener = null
          connectPopup.location.href = data.authUrl
          connectPopup.focus()
        } else {
          window.location.assign(data.authUrl)
        }
        setConnectorStatus({
          type: 'info',
          message: `Finish connecting ${formatPlatformLabel(platform)} in the auth window. Settings will confirm the connection when Zernio reports back.`,
        })
        await queryClient.invalidateQueries({ queryKey: ['social_connections', clientId] })
      } else {
        if (connectPopup && !connectPopup.closed) connectPopup.close()
        setConnectorStatus({
          type: 'error',
          message: data?.error || data?.message || `Could not start ${formatPlatformLabel(platform)} auth. Try again from Settings.`,
        })
      }
    } catch {
      if (connectPopup && !connectPopup.closed) connectPopup.close()
      setConnectorStatus({ type: 'error', message: 'Could not reach the connector service. Try again from Settings.' })
    } finally {
      setConnectingPlatform(null)
    }
  }

  function handleToolDrop(targetId) {
    if (!draggedToolId || draggedToolId === targetId) return
    const next = reorderTools(tools, draggedToolId, targetId)
    setDraggedToolId(null)
    void persistTools(next)
  }

  return (
    <div className="portal-page mx-auto max-w-[1560px] space-y-5 md:p-6 xl:p-8">
      <section className="portal-surface overflow-hidden rounded-[30px] p-4 md:p-5">
        <div className="portal-page-header items-center">
          <div className="max-w-4xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]">
                {today}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ background: 'rgba(31, 169, 113, 0.1)', color: 'var(--portal-success)' }}>
                <Sparkles className="h-3.5 w-3.5" />
                Daily focus
              </span>
            </div>
            <h1 className="font-display text-2xl font-semibold leading-tight md:text-[2rem]" style={{ color: 'var(--portal-text)' }}>
              {dailyPrompt}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              Use the workspace below as the launchpad: publish something helpful, check the channels that matter, and keep the team moving from one clean portal.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to="/post" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" />
              Planner
            </Link>
            <Link to="/documents" className="portal-button-secondary inline-flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold">
              <FolderOpen className="h-4 w-4" />
              Documents
            </Link>
            <Link to="/post" className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold">
              <Send className="h-4 w-4" />
              Create Post
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {DASHBOARD_PLATFORMS.map((platform) => (
          <PlatformMetricCard
            key={platform.id}
            platform={platform}
            metrics={metrics}
            connectedPlatforms={connectedPlatformIds}
            connectingPlatform={connectingPlatform}
            onConnect={connectPlatform}
          />
        ))}
      </section>

      <section className="portal-panel overflow-hidden rounded-[30px] p-0">
        <div className="border-b p-4 md:p-5" style={{ borderColor: 'var(--portal-border)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ background: 'rgba(201, 168, 76, 0.12)', color: 'var(--portal-primary-strong)' }}>
              <Wand2 className="h-3.5 w-3.5" />
              Workspace
            </span>
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
        </div>

        <div className="p-4 md:p-5">
        {showAddTool && (
          <ToolForm
            tools={tools}
            socialConnections={socialConnections}
            connectingPlatform={connectingPlatform}
            onAdd={addTool}
            onConnect={connectPlatform}
            onClose={() => setShowAddTool(false)}
          />
        )}

        {connectorStatus && (
          <div
            className="mt-4 rounded-[20px] px-4 py-3 text-sm"
            style={connectorStatus.type === 'error'
              ? { background: 'rgba(216, 95, 152, 0.10)', color: 'var(--portal-danger)', border: '1px solid rgba(216, 95, 152, 0.18)' }
              : { background: 'rgba(78, 149, 255, 0.10)', color: 'var(--portal-text)', border: '1px solid rgba(78, 149, 255, 0.18)' }}
          >
            {connectorStatus.message}
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: 'rgba(26, 24, 20, 0.05)', color: 'var(--portal-text-soft)' }}>
            {tools.length} apps pinned
          </span>
          <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: editMode ? 'rgba(201, 168, 76, 0.14)' : 'rgba(31, 169, 113, 0.1)', color: editMode ? 'var(--portal-primary-strong)' : 'var(--portal-success)' }}>
            {editMode ? 'Edit mode on' : 'Launcher ready'}
          </span>
          <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{
            background: workspaceState === 'error'
              ? 'rgba(216, 95, 152, 0.12)'
              : workspaceState === 'saving'
                ? 'rgba(201, 168, 76, 0.14)'
                : 'rgba(26, 24, 20, 0.05)',
            color: workspaceState === 'error'
              ? 'var(--portal-danger)'
              : workspaceState === 'saving'
                ? 'var(--portal-primary-strong)'
                : 'var(--portal-text-soft)',
          }}>
            {workspaceState === 'error' ? 'Save issue' : workspaceState === 'saving' ? 'Saving layout' : workspaceState === 'saved' ? 'Saved to portal' : 'Local fallback ready'}
          </span>
          <span className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
            {editMode ? 'Drag icons to move them and use the resize control to change their footprint.' : 'Tap any icon to open the app directly.'}
          </span>
        </div>

        {tools.length > 0 ? (
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
        ) : (
          <div className="rounded-[28px] border border-dashed px-6 py-10 text-center" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.72)' }}>
            <button
              type="button"
              onClick={() => setShowAddTool(true)}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl transition-all hover:-translate-y-0.5"
              style={{ background: 'rgba(201, 168, 76, 0.12)', color: 'var(--portal-primary)' }}
              aria-label="Add a workspace tool"
            >
              <Plus className="h-5 w-5" />
            </button>
            <h3 className="mt-4 text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>Blank by design</h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              This workspace starts empty for each new client. Add the inboxes, drives, and daily tools you actually use.
            </p>
            <button
              type="button"
              onClick={() => setShowAddTool(true)}
              className="portal-button-primary mt-5 rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              Browse connector library
            </button>
          </div>
        )}
        </div>
      </section>
    </div>
  )
}
