import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useOutletContext } from 'react-router-dom'
import {
  fetchMetrics,
  fetchProfile,
  fetchSocialConnections,
  fetchWorkspacePreferences,
  upsertWorkspacePreferences,
} from '../lib/portalApi'
import { portalPath } from '../lib/portalPath'
import { DASHBOARD_PLATFORMS, PLATFORM_CATALOG } from '../lib/platformCatalog'
import {
  ArrowUpRight,
  Check,
  Globe,
  Grip,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import {
  SiCanva,
  SiFacebook,
  SiGmail,
  SiGodaddy,
  SiGoogle,
  SiGoogledrive,
  SiInstagram,
  SiMailchimp,
  SiQuickbooks,
  SiShopify,
  SiSquare,
  SiSquarespace,
  SiStripe,
  SiTiktok,
  SiWix,
  SiWordpress,
  SiX,
} from 'react-icons/si'
import { FaLinkedinIn, FaMicrosoft } from 'react-icons/fa'

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
      className="portal-card group flex min-h-[92px] flex-col justify-between p-2.5 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor: isConnected ? `${platform.accent}30` : 'var(--portal-border)',
        background: isConnected
          ? `linear-gradient(180deg, ${platform.soft}, rgba(255,255,255,0.95))`
          : 'rgba(255,255,255,0.92)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
            style={{ background: platform.accent }}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>
              {platform.label}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: isConnected ? platform.accent : 'var(--portal-text-soft)' }}>
              {statusLabel}
            </p>
          </div>
        </div>
        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ background: platform.soft, color: platform.accent }}>
          {platform.shortLabel}
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--portal-text-soft)' }}>
            {platform.metricLabel}
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-[-0.04em]" style={{ color: 'var(--portal-text)' }}>
            {hasMetrics ? metricValue : '—'}
          </p>
        </div>

        {canConnectNow ? (
          <button
            type="button"
            onClick={() => onConnect(platform.id)}
            disabled={isConnecting}
            className="rounded-full px-2 py-1 text-[10px] font-semibold transition-all disabled:cursor-wait disabled:opacity-60"
            style={{ background: platform.soft, color: platform.accent }}
          >
            {isConnecting ? 'Opening...' : 'Connect now'}
          </button>
        ) : isConnected || hasMetrics ? (
          <Link
            to={`/stats/${platform.id}`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition-all"
            style={{ background: 'rgba(26, 24, 20, 0.05)', color: 'var(--portal-text-muted)' }}
          >
            View
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : (
          <Link
            to="/settings"
            className="rounded-full px-2 py-1 text-[10px] font-semibold transition-all"
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
  { id: 'custom', label: 'Custom' },
]

const WORKSPACE_GROUPS = TOOL_CATEGORIES

const QUICK_TOOL_PRESETS = [
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com', accent: '#ea4335', category: 'email', description: 'Google inbox', Icon: SiGmail },
  { id: 'outlook', label: 'Outlook', url: 'https://outlook.office.com/mail/', accent: '#0078d4', category: 'email', description: 'Microsoft mail', Icon: FaMicrosoft },
  { id: 'google-drive', label: 'Google Drive', url: 'https://drive.google.com', accent: '#1a73e8', category: 'files', description: 'Docs and files', Icon: SiGoogledrive },
  { id: 'onedrive', label: 'OneDrive', url: 'https://onedrive.live.com', accent: '#0078d4', category: 'files', description: 'Microsoft files', Icon: FaMicrosoft },
  { id: 'google-business', label: 'Google Business', url: 'https://business.google.com', accent: PLATFORM_CATALOG.google.accent, category: 'social', description: 'Local profile', Icon: SiGoogle },
  { id: 'facebook', label: 'Facebook', url: 'https://business.facebook.com', accent: PLATFORM_CATALOG.facebook.accent, category: 'social', description: 'Publishing auth', Icon: SiFacebook, connectPlatform: 'facebook' },
  { id: 'instagram', label: 'Instagram', url: 'https://business.instagram.com', accent: PLATFORM_CATALOG.instagram.accent, category: 'social', description: 'Publishing auth', Icon: SiInstagram, connectPlatform: 'instagram' },
  { id: 'tiktok', label: 'TikTok', url: 'https://business.tiktok.com', accent: PLATFORM_CATALOG.tiktok.accent, category: 'social', description: 'Publishing auth', Icon: SiTiktok, connectPlatform: 'tiktok' },
  { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com', accent: PLATFORM_CATALOG.linkedin.accent, category: 'social', description: 'Company network', Icon: FaLinkedinIn },
  { id: 'twitter', label: 'X / Twitter', url: 'https://x.com', accent: PLATFORM_CATALOG.twitter.accent, category: 'social', description: 'Social channel', Icon: SiX },
  { id: 'stripe', label: 'Stripe', url: 'https://dashboard.stripe.com', accent: '#635bff', category: 'business', description: 'Payments', Icon: SiStripe },
  { id: 'square', label: 'Square', url: 'https://app.squareup.com', accent: '#111111', category: 'business', description: 'POS and invoices', Icon: SiSquare },
  { id: 'quickbooks', label: 'QuickBooks', url: 'https://app.qbo.intuit.com', accent: '#2ca01c', category: 'business', description: 'Accounting', Icon: SiQuickbooks },
  { id: 'shopify', label: 'Shopify', url: 'https://admin.shopify.com', accent: '#95bf47', category: 'business', description: 'Store admin', Icon: SiShopify },
  { id: 'godaddy', label: 'GoDaddy', url: 'https://www.godaddy.com', accent: '#00a4a6', category: 'website', description: 'Domain hosting', Icon: SiGodaddy },
  { id: 'wix', label: 'Wix', url: 'https://manage.wix.com', accent: '#116dff', category: 'website', description: 'Website builder', Icon: SiWix },
  { id: 'squarespace', label: 'Squarespace', url: 'https://account.squarespace.com', accent: '#111111', category: 'website', description: 'Website builder', Icon: SiSquarespace },
  { id: 'wordpress', label: 'WordPress', url: 'https://wordpress.com/log-in', accent: '#21759b', category: 'website', description: 'Site admin', Icon: SiWordpress },
  { id: 'mailchimp', label: 'Mailchimp', url: 'https://login.mailchimp.com', accent: '#ffe01b', category: 'business', description: 'Email marketing', Icon: SiMailchimp },
  { id: 'canva', label: 'Canva', url: 'https://www.canva.com', accent: '#00c4cc', category: 'business', description: 'Creative assets', Icon: SiCanva },
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
    category: tool.category || tool.group || 'custom',
    group: tool.group || tool.category || 'custom',
    size: ['sm', 'lg'].includes(tool.size) ? tool.size : 'sm',
  }
}

function getToolPreset(tool) {
  const normalizedUrl = normalizeToolUrl(tool?.url || '')
  return QUICK_TOOL_PRESETS.find((preset) => (
    preset.id === tool?.presetId ||
    normalizeToolUrl(preset.url) === normalizedUrl ||
    preset.label.toLowerCase() === tool?.label?.toLowerCase()
  )) || null
}

function getToolGroup(tool) {
  const presetGroup = getToolPreset(tool)?.category
  const savedGroup = tool.group || tool.category
  return savedGroup && savedGroup !== 'custom' ? savedGroup : presetGroup || savedGroup || 'custom'
}

function getWorkspaceGroupLabel(groupId) {
  return WORKSPACE_GROUPS.find((group) => group.id === groupId)?.label || groupId
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
    onAdd({ id: crypto.randomUUID(), label: label.trim(), url: normalizedUrl, category: 'custom', group: 'custom' })
    onClose()
  }

  function addPreset(preset) {
    onAdd({
      id: crypto.randomUUID(),
      label: preset.label,
      url: normalizeToolUrl(preset.url),
      accent: preset.accent,
      category: preset.category,
      group: preset.category,
      presetId: preset.id,
    })
  }

  return (
    <div className="workspace-tool-library overflow-hidden rounded-[34px] border" style={{ borderColor: 'rgba(26, 24, 20, 0.08)', background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(246,250,255,0.94))', boxShadow: '0 24px 60px rgba(26, 24, 20, 0.08)' }}>
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
                  data-active={activeCategory === category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className="workspace-category-pill shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-all"
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
                  className="workspace-preset-card group flex min-h-[116px] items-start gap-3 rounded-[24px] border p-4 text-left transition-all enabled:hover:-translate-y-0.5 disabled:cursor-default"
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

        <form onSubmit={handleSubmit} className="workspace-tool-sidebar border-t p-5 md:p-6 lg:border-l lg:border-t-0" style={{ borderColor: 'rgba(26, 24, 20, 0.07)', background: 'rgba(250, 247, 241, 0.72)' }}>
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
            <div className="workspace-icon-preview flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border bg-white" style={{ borderColor: 'rgba(201, 168, 76, 0.18)' }}>
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
  const preset = getToolPreset(tool)
  const PresetIcon = preset?.Icon
  const sources = useMemo(() => getToolIconCandidates(tool.url), [tool.url])
  const [sourceIndex, setSourceIndex] = useState(0)
  const [showFallback, setShowFallback] = useState(Boolean(PresetIcon) || !sources.length)

  if (PresetIcon) {
    return <PresetIcon className="h-3.5 w-3.5" />
  }

  if (!showFallback && sources[sourceIndex]) {
    return (
      <img
        src={sources[sourceIndex]}
        alt=""
        className="h-6 w-6 rounded-lg object-contain"
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
    return <span className="text-lg">{tool.icon}</span>
  }

  return (
    <div
      className="flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold"
      style={{ background: 'rgba(201, 168, 76, 0.14)', color: 'var(--portal-primary-strong)' }}
    >
      {getToolInitials(tool.label)}
    </div>
  )
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

function ToolTile({ tool, editMode, onOpen, onRemove, onUpdate, onMoveGroup, onDragStart, onDragOver, onDrop }) {
  const hostname = getToolHostname(tool.url)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showGroupChooser, setShowGroupChooser] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const groupLabel = getWorkspaceGroupLabel(getToolGroup(tool))
  const preset = getToolPreset(tool)
  const accent = tool.accent || preset?.accent || 'var(--portal-primary)'

  useEffect(() => {
    if (!menuOpen) {
      const timeoutId = window.setTimeout(() => setShowGroupChooser(false), 0)
      return () => window.clearTimeout(timeoutId)
    }

    function updateMenuPosition() {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      const menuRect = menuRef.current?.getBoundingClientRect()
      if (!buttonRect) return

      const estimatedMenuWidth = menuRect?.width || 190
      const estimatedMenuHeight = menuRect?.height || (showGroupChooser ? 300 : 250)
      const horizontalPadding = 12
      const verticalGap = 8
      const spaceBelow = window.innerHeight - buttonRect.bottom
      const spaceAbove = buttonRect.top
      const direction = spaceBelow < estimatedMenuHeight + 20 && spaceAbove > spaceBelow ? 'up' : 'down'
      const unclampedLeft = buttonRect.right - estimatedMenuWidth
      const left = Math.min(
        Math.max(horizontalPadding, unclampedLeft),
        window.innerWidth - estimatedMenuWidth - horizontalPadding,
      )
      const top = direction === 'up'
        ? Math.max(horizontalPadding, buttonRect.top - estimatedMenuHeight - verticalGap)
        : Math.min(window.innerHeight - estimatedMenuHeight - horizontalPadding, buttonRect.bottom + verticalGap)

      setMenuPosition({ top, left })
    }

    function handlePointerDown(event) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-workspace-action-menu="true"]')) return
      setMenuOpen(false)
    }

    const frameId = window.requestAnimationFrame(updateMenuPosition)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    window.document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      window.document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [menuOpen, showGroupChooser])

  function handleEdit() {
    const nextLabel = window.prompt('Shortcut name', tool.label)
    if (nextLabel === null) return
    const nextUrl = window.prompt('Shortcut URL', tool.url)
    if (nextUrl === null) return

    const trimmedLabel = nextLabel.trim()
    const normalizedUrl = normalizeToolUrl(nextUrl)
    if (!trimmedLabel || !normalizedUrl) return

    onUpdate(tool.id, {
      label: trimmedLabel,
      url: normalizedUrl,
      presetId: null,
    })
    setMenuOpen(false)
  }

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
      className="group relative w-full rounded-[18px] border text-left transition-all duration-200 hover:-translate-y-0.5 sm:w-[218px]"
      style={{
        borderColor: 'rgba(26, 24, 20, 0.08)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(250, 247, 241, 0.7))',
        boxShadow: '0 10px 24px rgba(26, 24, 20, 0.045)',
      }}
    >
      <div className="flex min-h-[62px] items-center gap-2 p-2 pr-9">
        {editMode && (
          <div
            className="absolute left-1.5 top-1.5 rounded-full p-1"
            style={{ background: 'rgba(255,255,255,0.8)', color: 'var(--portal-text-soft)' }}
            aria-hidden="true"
          >
            <Grip className="h-3.5 w-3.5" />
          </div>
        )}

        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: `${accent}13`, color: accent, border: '1px solid rgba(26, 24, 20, 0.06)' }}
        >
          <ToolIcon key={`${tool.id}:${tool.url}:${tool.presetId || ''}`} tool={tool} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>
            {tool.label}
          </p>
          <p className="mt-0.5 truncate text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>
            {hostname || 'External app'}
          </p>
          <span className="mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em]" style={{ background: 'rgba(26, 24, 20, 0.045)', color: 'var(--portal-text-soft)' }}>
            {groupLabel}
          </span>
        </div>
      </div>

      <button
        ref={buttonRef}
        type="button"
        data-workspace-action-menu="true"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setShowGroupChooser(false)
          setMenuOpen((current) => !current)
        }}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border transition-all hover:-translate-y-0.5"
        style={{ borderColor: 'rgba(26, 24, 20, 0.08)', background: 'rgba(255,255,255,0.86)', color: 'var(--portal-text-muted)', boxShadow: '0 8px 18px rgba(26, 24, 20, 0.06)' }}
        aria-label={`${tool.label} options`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {menuOpen ? createPortal(
        <div
          ref={menuRef}
          data-workspace-action-menu="true"
          className="fixed z-[120] min-w-[180px] rounded-[20px] border p-2 shadow-lg"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            borderColor: 'var(--portal-border)',
            background: 'rgba(255,255,255,0.98)',
            boxShadow: '0 18px 40px rgba(26, 24, 20, 0.12)',
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {showGroupChooser ? (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setShowGroupChooser(false)
                }}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.18em] transition-all"
                style={{ color: 'var(--portal-text-soft)' }}
              >
                Back
              </button>
              {WORKSPACE_GROUPS.filter((group) => group.id !== 'all').map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    onMoveGroup(tool.id, group.id)
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                  style={getToolGroup(tool) === group.id
                    ? { background: 'rgba(201, 168, 76, 0.12)', color: 'var(--portal-primary)' }
                    : { color: 'var(--portal-text)' }}
                >
                  <span className="truncate">{group.label}</span>
                  {getToolGroup(tool) === group.id ? <span className="text-[11px] font-semibold">Current</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onOpen(tool)
                }}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                style={{ color: 'var(--portal-text)' }}
              >
                <ArrowUpRight className="h-4 w-4" />
                Open app
              </button>
              <button
                type="button"
                onClick={() => setShowGroupChooser(true)}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                style={{ color: 'var(--portal-text)' }}
              >
                Move to group
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                style={{ color: 'var(--portal-text)' }}
              >
                <Pencil className="h-4 w-4" />
                Edit shortcut
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ${tool.label} from the workspace?`)) onRemove(tool.id)
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                style={{ color: 'var(--portal-danger)', background: 'rgba(223, 95, 143, 0.06)' }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
        </div>
        , window.document.body) : null}
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
  const [activeWorkspaceGroup, setActiveWorkspaceGroup] = useState('all')
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

  const visibleTools = useMemo(() => {
    if (activeWorkspaceGroup === 'all') return tools
    return tools.filter((tool) => getToolGroup(tool) === activeWorkspaceGroup)
  }, [activeWorkspaceGroup, tools])

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

  function updateTool(id, updates) {
    const next = tools.map((tool) => (
      tool.id === id
        ? hydrateTool({ ...tool, ...updates })
        : tool
    ))
    void persistTools(next)
  }

  function moveToolToGroup(id, groupId) {
    updateTool(id, { category: groupId, group: groupId })
  }

  function openTool(tool) {
    window.open(tool.url, '_blank', 'noopener,noreferrer')
  }

  function buildSettingsRedirectUrl(platform) {
    if (typeof window === 'undefined') return ''
    const url = new URL(portalPath('/settings'), window.location.origin)
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
      const res = await fetch(portalPath(SETTINGS_CONNECT_ENDPOINT), {
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
    <div className="portal-page w-full max-w-none space-y-5 md:p-5 xl:p-6">
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

          <div className="hidden lg:block">
            <div className="h-24 w-24 rounded-full blur-3xl" style={{ background: 'rgba(201, 168, 76, 0.18)' }} />
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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

      <section className="workspace-launcher-panel portal-panel overflow-visible rounded-[24px] p-0">
        <div className="border-b px-3 py-2.5 md:px-4" style={{ borderColor: 'var(--portal-border)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ background: 'rgba(201, 168, 76, 0.12)', color: 'var(--portal-primary-strong)' }}>
                <Wand2 className="h-3.5 w-3.5" />
                Workspace
              </span>
              <h2 className="font-display text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
                App launcher
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditMode((current) => !current)}
              className="portal-button-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
            >
              <Pencil className="h-4 w-4" />
              {editMode ? 'Done editing' : 'Edit layout'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddTool((current) => !current)}
              className="portal-button-secondary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" />
              {showAddTool ? 'Hide tools' : 'Add tool'}
            </button>
            </div>
          </div>
        </div>

        <div className="p-3 md:p-4">
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

        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {WORKSPACE_GROUPS.map((group) => {
            const groupCount = group.id === 'all'
              ? tools.length
              : tools.filter((tool) => getToolGroup(tool) === group.id).length

            return (
              <button
                key={group.id}
                type="button"
                data-active={activeWorkspaceGroup === group.id}
                onClick={() => setActiveWorkspaceGroup(group.id)}
                className="workspace-group-pill rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all"
                style={activeWorkspaceGroup === group.id
                  ? { background: 'var(--portal-text)', color: 'white', boxShadow: '0 10px 22px rgba(26, 24, 20, 0.12)' }
                  : { background: 'rgba(255,255,255,0.78)', color: 'var(--portal-text-muted)', border: '1px solid rgba(26, 24, 20, 0.07)' }}
              >
                {group.label}
                <span className="ml-2 opacity-70">{groupCount}</span>
              </button>
            )
          })}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: 'rgba(26, 24, 20, 0.05)', color: 'var(--portal-text-soft)' }}>
            {visibleTools.length} shown
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
        </div>

        {visibleTools.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {visibleTools.map((tool) => (
              <ToolTile
                key={tool.id}
                tool={tool}
                editMode={editMode}
                onOpen={openTool}
                onRemove={removeTool}
                onUpdate={updateTool}
                onMoveGroup={moveToolToGroup}
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
            <h3 className="mt-4 text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>
              {tools.length > 0 ? `No ${getWorkspaceGroupLabel(activeWorkspaceGroup).toLowerCase()} apps yet` : 'Blank by design'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              {tools.length > 0
                ? 'Add a matching app or move an existing shortcut into this group from its three-dot menu.'
                : 'This workspace starts empty for each new client. Add the inboxes, drives, and daily tools you actually use.'}
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
