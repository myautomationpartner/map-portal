import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildTenantConfig } from '../lib/tenantConfig'
import { portalPath } from '../lib/portalPath'
import { DASHBOARD_PLATFORMS } from '../lib/platformCatalog'
import {
  User, Lock, Building2, CheckCircle2, Loader2, AlertCircle,
  Link2, ExternalLink, Wifi, WifiOff, MessageCircle, Copy, RefreshCw, Mail, Save, Unlink2
} from 'lucide-react'

const SETTINGS_CONNECT_ENDPOINT = '/api/n8n/zernio-connect-url'
const SETTINGS_SYNC_ENDPOINT = '/api/n8n/zernio-sync-accounts'
const SETTINGS_DISCONNECT_ENDPOINT = '/api/social-connections/disconnect'

const PLATFORMS = DASHBOARD_PLATFORMS

async function fetchUserProfile() {
  const { data, error } = await supabase
    .from('users')
    .select('*, clients(*)')
    .single()
  if (error) throw error
  return data
}

async function fetchConnections(clientId) {
  if (!clientId) return []
  const { data, error } = await supabase
    .from('social_connections')
    .select('platform, zernio_account_id, username, connected_at')
    .eq('client_id', clientId)
  if (error) throw error
  return data || []
}

async function websiteChatPortalFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('You need to be signed in to manage website chat.')

  const response = await fetch(portalPath(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload?.error || 'Website chat request failed.')
  }

  return payload
}

async function fetchWebsiteChatSettings() {
  return websiteChatPortalFetch('/api/website-chat/settings')
}

async function saveWebsiteChatSettings(body) {
  return websiteChatPortalFetch('/api/website-chat/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

async function checkWebsiteChatInstallation() {
  return websiteChatPortalFetch('/api/website-chat/check-installation', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

async function disconnectSocialConnection(platform) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('You need to be signed in to disconnect accounts.')

  const response = await fetch(portalPath(SETTINGS_DISCONNECT_ENDPOINT), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ platform }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Could not disconnect this account.')
  }
  return payload
}

// ── Shared components ─────────────────────────────────────────────────────────

function Section({ title, description, icon: Icon, children }) {
  return (
    <div className="portal-panel rounded-[32px] overflow-hidden">
      <div className="flex items-center gap-3 border-b px-6 py-5" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.20)' }}>
          <Icon className="w-4 h-4" style={{ color: 'var(--portal-primary)' }} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{title}</h2>
          {description && <p className="mt-0.5 text-xs" style={{ color: 'var(--portal-text-muted)' }}>{description}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>{label}</label>
      <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)' }}>
        {value || <span style={{ color: 'var(--portal-text-soft)' }}>—</span>}
      </div>
    </div>
  )
}

function StatusBadge({ status, message }) {
  if (!status) return null
  const isSuccess = status === 'success'
  const isInfo = status === 'info'
  return (
    <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3"
      style={isSuccess
        ? { background: 'rgba(107,193,142,0.08)', border: '1px solid rgba(107,193,142,0.2)', color: '#2f8f57' }
        : isInfo
        ? { background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.2)', color: '#8c6d1c' }
        : { background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#c4556e' }
      }>
      {isSuccess ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {message}
    </div>
  )
}

function formatConnectionDate(value) {
  if (!value) return 'Unknown'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatPlatformLabel(platform) {
  if (!platform) return 'Account'
  if (platform === 'twitter' || platform === 'x') return 'X / Twitter'
  if (platform === 'linkedin') return 'LinkedIn'
  if (platform === 'tiktok') return 'TikTok'
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

function normalizeConnectionPlatform(platform) {
  const value = String(platform || '').trim().toLowerCase()
  const platformMap = {
    fb: 'facebook',
    facebook_page: 'facebook',
    ig: 'instagram',
    tt: 'tiktok',
    linked_in: 'linkedin',
    linkedin_page: 'linkedin',
    linkedin_company: 'linkedin',
    li: 'linkedin',
    x: 'twitter',
    x_twitter: 'twitter',
    xtwitter: 'twitter',
  }
  return platformMap[value] || value
}

function normalizeWorkflowError(data, fallbackMessage) {
  const candidate =
    data?.error ||
    data?.message ||
    data?.details ||
    data?.description ||
    data?.reason

  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim()
  }

  return fallbackMessage
}

// ── Social Connections section ────────────────────────────────────────────────

function SocialConnectionsSection({ clientId, returnedPlatform, requireWriteAccess, billingAccess }) {
  const queryClient = useQueryClient()
  const [connectingPlatform, setConnectingPlatform] = useState(null)
  const [disconnectingPlatform, setDisconnectingPlatform] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)
  const autoSyncTimeoutRef = useRef(null)

  function buildSettingsRedirectUrl(platform) {
    if (typeof window === 'undefined') return ''
    const url = new URL(portalPath('/settings'), window.location.origin)
    url.searchParams.set('connected', platform)
    url.searchParams.set('cid', clientId)
    return url.toString()
  }

  const { data: connections = [], isLoading: connectionsLoading } = useQuery({
    queryKey: ['social_connections', clientId],
    queryFn: () => fetchConnections(clientId),
    enabled: !!clientId,
  })

  const connectedMap = useMemo(
    () => Object.fromEntries(connections.map(c => [normalizeConnectionPlatform(c.platform), c])),
    [connections],
  )

  function clearAutoSyncTimer() {
    if (autoSyncTimeoutRef.current) {
      clearTimeout(autoSyncTimeoutRef.current)
      autoSyncTimeoutRef.current = null
    }
  }

  async function syncZernioAccounts(platform = null) {
    if (!clientId) return { success: false, skipped: true }

    const res = await fetch(portalPath(SETTINGS_SYNC_ENDPOINT), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        platform: platform ? normalizeConnectionPlatform(platform) : undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok || data?.success === false) {
      const details = normalizeWorkflowError(data, 'Zernio did not return the connected account yet.')
      throw new Error(details)
    }

    return data
  }

  async function checkConnectionStatus(platform = null, options = {}) {
    const {
      suppressNoAccountError = false,
      keepStatus = false,
      successPrefix = '',
      syncFirst = true,
    } = options
    const normalizedPlatform = platform ? normalizeConnectionPlatform(platform) : null

    if (!clientId) return { success: false, found: false }

    if (!keepStatus) {
      setSyncStatus(null)
    }

    try {
      if (syncFirst) {
        await syncZernioAccounts(normalizedPlatform)
      }

      const latestConnections = await queryClient.fetchQuery({
        queryKey: ['social_connections', clientId],
        queryFn: () => fetchConnections(clientId),
      })

      const foundConnection = normalizedPlatform
        ? latestConnections.find((entry) => normalizeConnectionPlatform(entry.platform) === normalizedPlatform)
        : latestConnections[0]

      if (foundConnection) {
        setSyncStatus({
          type: 'success',
          message: `${successPrefix}${formatPlatformLabel(normalizedPlatform || foundConnection.platform)} is connected and ready for publishing and metrics.`,
        })
        return { success: true, found: true, connection: foundConnection }
      }

      if (!suppressNoAccountError) {
        setSyncStatus({
          type: 'info',
          message: normalizedPlatform
            ? `We're still waiting for ${formatPlatformLabel(normalizedPlatform)} to finish connecting in Zernio.`
            : 'We are still waiting for Zernio to finish connecting your account.',
        })
      }

      return { success: true, found: false }
    } catch (error) {
      if (!suppressNoAccountError) {
        setSyncStatus({
          type: 'error',
          message: error instanceof Error ? error.message : 'Could not refresh connected accounts from Zernio. Please try again.',
        })
      }
      return { success: false, found: false }
    }
  }

  function startAutoSync(platform, attempt = 0) {
    const maxAttempts = 24
    const delayMs = attempt === 0 ? 1500 : 5000

    clearAutoSyncTimer()
    autoSyncTimeoutRef.current = setTimeout(async () => {
      const normalizedPlatform = normalizeConnectionPlatform(platform)
      const result = await checkConnectionStatus(normalizedPlatform, {
        suppressNoAccountError: true,
        keepStatus: true,
        successPrefix: 'Connected. ',
      })

      if (result?.found) {
        clearAutoSyncTimer()
        setConnectingPlatform(null)
        return
      }

      if (attempt + 1 >= maxAttempts) {
        setConnectingPlatform(null)
        setSyncStatus({
          type: 'info',
          message: `${formatPlatformLabel(normalizedPlatform)} is still finishing in Zernio. This page will update automatically as soon as the connected account is available.`,
        })
        clearAutoSyncTimer()
        return
      }

      startAutoSync(platform, attempt + 1)
    }, delayMs)
  }

  async function handleConnect(platform) {
    if (!requireWriteAccess('change social connections')) return

    const normalizedPlatform = normalizeConnectionPlatform(platform)
    const connectPopup = typeof window !== 'undefined'
      ? window.open('', '_blank', 'width=600,height=700')
      : null

    if (connectPopup && !connectPopup.closed) {
      connectPopup.document.write(`
        <title>Opening ${formatPlatformLabel(normalizedPlatform)}…</title>
        <body style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #1f2937;">
          <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600;">Opening ${formatPlatformLabel(normalizedPlatform)}…</p>
          <p style="margin: 0; font-size: 14px; color: #6b7280;">If nothing happens in a moment, return to the portal and try again.</p>
        </body>
      `)
    }

    setConnectingPlatform(normalizedPlatform)
    setSyncStatus(null)
    clearAutoSyncTimer()

    try {
      const res = await fetch(portalPath(SETTINGS_CONNECT_ENDPOINT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          platform: normalizedPlatform,
          redirectUrl: buildSettingsRedirectUrl(normalizedPlatform),
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
        setSyncStatus({
          type: 'info',
          message: `Finish connecting ${formatPlatformLabel(normalizedPlatform)} in the new tab. We'll sync with Zernio and update this page automatically.`,
        })
        startAutoSync(normalizedPlatform)
      } else {
        if (connectPopup && !connectPopup.closed) {
          connectPopup.close()
        }
        const details = normalizeWorkflowError(data, `Could not get connect URL for ${formatPlatformLabel(normalizedPlatform)}. Try again.`)
        setSyncStatus({ type: 'error', message: details })
        setConnectingPlatform(null)
      }
    } catch {
      if (connectPopup && !connectPopup.closed) {
        connectPopup.close()
      }
      setSyncStatus({ type: 'error', message: 'Failed to reach automation server. Check your connection.' })
      setConnectingPlatform(null)
    }
  }

  async function handleDisconnect(platform, label) {
    if (!requireWriteAccess('disconnect social accounts')) return
    const normalizedPlatform = normalizeConnectionPlatform(platform)
    const confirmed = window.confirm(`Disconnect ${label} from this MAP portal? Publishing, metrics, and inbox messages for this platform will stop until it is connected again.`)
    if (!confirmed) return

    setDisconnectingPlatform(normalizedPlatform)
    setSyncStatus(null)
    clearAutoSyncTimer()

    try {
      await disconnectSocialConnection(normalizedPlatform)
      await queryClient.invalidateQueries({ queryKey: ['social_connections', clientId] })
      setSyncStatus({
        type: 'success',
        message: `${label} is disconnected from this portal. You can connect it again anytime.`,
      })
    } catch (error) {
      setSyncStatus({
        type: 'error',
        message: error instanceof Error ? error.message : `Could not disconnect ${label}.`,
      })
    } finally {
      setDisconnectingPlatform(null)
    }
  }

  useEffect(() => {
    if (!returnedPlatform || !clientId) return
    const normalizedPlatform = normalizeConnectionPlatform(returnedPlatform)

    if (connectedMap[normalizedPlatform]) {
      const timer = window.setTimeout(() => {
        setSyncStatus({
          type: 'success',
          message: `${formatPlatformLabel(normalizedPlatform)} is connected and ready for publishing and metrics.`,
        })
        setConnectingPlatform(null)
      }, 0)
      clearAutoSyncTimer()
      return () => window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => {
      setSyncStatus({
        type: 'info',
        message: `${formatPlatformLabel(normalizedPlatform)} returned from Zernio. Syncing the connected account…`,
      })
    }, 0)
    startAutoSync(normalizedPlatform)
    return () => {
      window.clearTimeout(timer)
      clearAutoSyncTimer()
    }
    // `startAutoSync` is intentionally kept local to this component state machine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedPlatform, clientId, connectedMap])

  useEffect(() => () => clearAutoSyncTimer(), [])

  return (
    <Section
      title="Social Media Accounts"
      description="Connect your social accounts to enable publishing and metrics"
      icon={Link2}
    >
      {connectionsLoading ? (
        <div className="flex items-center gap-2" style={{ color: '#8a7858' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading connections…</span>
        </div>
      ) : (
        <div className="space-y-3">
          {PLATFORMS.map(({ id, label, Icon, accent, soft, connectionEnabled }) => {
            const conn = connectedMap[id]
            const isConnecting = connectingPlatform === id
            const isDisconnecting = disconnectingPlatform === id

            return (
              <div
                key={id}
                className="flex items-center gap-4 p-4 rounded-xl transition-all"
                style={conn
                  ? { background: soft, border: `1px solid ${accent}30` }
                  : { background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)' }
                }>
                {/* Platform icon */}
                <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0" style={{ background: accent }}>
                  <Icon className="w-4 h-4 text-white" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--portal-text)' }}>{label}</p>
                  {conn ? (
                    <div className="mt-0.5 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Wifi className="w-3 h-3" style={{ color: accent }} />
                        <p className="text-xs font-medium" style={{ color: 'var(--portal-text-muted)' }}>
                          {conn.username ? `@${conn.username}` : 'Connected'}
                        </p>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--portal-text-soft)' }}>
                        Last synced: {formatConnectionDate(conn.connected_at)}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <WifiOff className="w-3 h-3" style={{ color: 'var(--portal-text-soft)' }} />
                      <p className="text-xs" style={{ color: 'var(--portal-text-soft)' }}>Not connected</p>
                    </div>
                  )}
                </div>

                {/* Connection actions */}
                <div className="shrink-0 flex items-center gap-2">
                  {conn ? (
                    <>
                      <div
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'rgba(107,193,142,0.10)', border: '1px solid rgba(107,193,142,0.22)', color: '#2f8f57' }}>
                        <CheckCircle2 className="w-3 h-3" />
                        Connected
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(id, label)}
                        disabled={!!disconnectingPlatform || !!connectingPlatform || billingAccess?.readOnly}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.18)', color: '#a83f58' }}
                      >
                        {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink2 className="w-3 h-3" />}
                        {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => connectionEnabled && handleConnect(id)}
                      disabled={!connectionEnabled || !!connectingPlatform || billingAccess?.readOnly}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--portal-primary)' }}>
                      {isConnecting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3 h-3" />
                      )}
                      {isConnecting ? 'Connecting…' : connectionEnabled ? 'Connect' : 'Coming soon'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Status message */}
      {syncStatus && (
        <div className="mt-4">
          <StatusBadge status={syncStatus.type} message={syncStatus.message} />
        </div>
      )}

      <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs" style={{ color: 'var(--portal-text-soft)' }}>
          Connect each platform once in Zernio and this page will keep Supabase updated automatically for publishing and metrics.
        </p>
      </div>
    </Section>
  )
}

// ── Website Chat section ─────────────────────────────────────────────────────

function formatInstallStatus(status) {
  if (status === 'detected') return 'Installed'
  if (status === 'not_detected') return 'Not detected'
  if (status === 'needs_help') return 'Needs help'
  if (status === 'map_install_requested') return 'MAP install requested'
  return 'Not checked'
}

function WebsiteChatSection({ client, requireWriteAccess, billingAccess, tenant }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(null)
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [copying, setCopying] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['website-chat-settings', client?.id],
    queryFn: fetchWebsiteChatSettings,
    enabled: !!client?.id,
  })

  const settings = data?.settings
  const installSnippet = data?.installSnippet || ''

  useEffect(() => {
    if (!settings) return
    setForm({
      widget_color: settings.widget_color || '#C9A84C',
      welcome_heading: settings.welcome_heading || 'Hi there',
      welcome_tagline: settings.welcome_tagline || 'Send us a message and we will get back to you soon.',
      greeting_enabled: settings.greeting_enabled ?? true,
      greeting_message: settings.greeting_message || 'Hi! How can we help?',
      pre_chat_form_enabled: settings.pre_chat_form_enabled ?? true,
      pre_chat_message: settings.pre_chat_message || 'Tell us how to reach you before we start.',
      saved_replies: Array.isArray(settings.saved_replies) ? settings.saved_replies : [],
      automation_rules: Array.isArray(settings.automation_rules) ? settings.automation_rules : [],
    })
  }, [settings])

  function updateForm(key, value) {
    setForm((current) => ({ ...(current || {}), [key]: value }))
  }

  function updateSavedReply(index, key, value) {
    setForm((current) => {
      const replies = [...(current?.saved_replies || [])]
      replies[index] = { ...(replies[index] || {}), [key]: value }
      return { ...(current || {}), saved_replies: replies }
    })
  }

  async function handleCopySnippet() {
    if (!installSnippet) return
    setCopying(true)
    setStatus(null)
    try {
      await navigator.clipboard.writeText(installSnippet)
      setStatus({ type: 'success', message: 'Website chat script copied.' })
    } catch {
      setStatus({ type: 'error', message: 'Could not copy the script. Select the script text and copy it manually.' })
    } finally {
      setCopying(false)
    }
  }

  async function handleSave() {
    if (!requireWriteAccess('update website chat')) return
    if (!form) return
    setSaving(true)
    setStatus(null)
    try {
      const result = await saveWebsiteChatSettings(form)
      await queryClient.invalidateQueries({ queryKey: ['website-chat-settings', client?.id] })
      setStatus({
        type: result?.sync?.warning ? 'info' : 'success',
        message: result?.sync?.warning || 'Website chat settings saved.',
      })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Could not save website chat settings.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleCheckInstall() {
    setChecking(true)
    setStatus(null)
    try {
      const result = await checkWebsiteChatInstallation()
      await queryClient.invalidateQueries({ queryKey: ['website-chat-settings', client?.id] })
      setStatus({
        type: result.detected ? 'success' : 'info',
        message: result.detected
          ? 'Website chat is installed on the saved website.'
          : 'Website chat was not found on the saved homepage yet.',
      })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Could not check website chat installation.' })
    } finally {
      setChecking(false)
    }
  }

  const webPersonBody = [
    `Please add this website chat script to ${client?.website_url || 'our website'} before the closing </body> tag on every public page:`,
    '',
    installSnippet,
  ].join('\n')

  if (isLoading) {
    return (
      <Section title="Website Chat" description="Install and manage the website chat widget" icon={MessageCircle}>
        <div className="flex items-center gap-2" style={{ color: 'var(--portal-text-muted)' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading website chat…</span>
        </div>
      </Section>
    )
  }

  if (!settings) {
    return (
      <Section title="Website Chat" description="Install and manage the website chat widget" icon={MessageCircle}>
        <StatusBadge status="info" message="Website chat is being prepared for this portal." />
      </Section>
    )
  }

  return (
    <Section title="Website Chat" description="Install and manage your customer chat widget" icon={MessageCircle}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{formatInstallStatus(settings.install_status)}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
              {settings.last_checked_at ? `Last checked ${formatConnectionDate(settings.last_checked_at)}` : 'Check your website after installing the script.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCheckInstall}
            disabled={checking}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--portal-primary)' }}
          >
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check installation
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>
              Install script
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopySnippet}
                disabled={!installSnippet || copying}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.86)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)' }}
              >
                {copying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                Copy script
              </button>
              <a
                href={`mailto:?subject=${encodeURIComponent('Website chat install script')}&body=${encodeURIComponent(webPersonBody)}`}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.86)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)' }}
              >
                <Mail className="h-3 w-3" />
                Email to web person
              </a>
              <a
                href={`mailto:${tenant.supportEmail}?subject=${encodeURIComponent('Please install my website chat')}&body=${encodeURIComponent(`Please help install website chat for ${client?.business_name || 'my business'}: ${client?.website_url || ''}`)}`}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--portal-primary)' }}
              >
                <MessageCircle className="h-3 w-3" />
                Request MAP install
              </a>
            </div>
          </div>
          <textarea
            readOnly
            value={installSnippet}
            rows={8}
            className="portal-input w-full resize-y rounded-xl px-4 py-3 font-mono text-xs leading-5 focus:outline-none"
          />
        </div>

        {form && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                Widget color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.widget_color}
                  onChange={(event) => updateForm('widget_color', event.target.value)}
                  className="h-11 w-14 rounded-xl border-0 bg-transparent p-0"
                  disabled={billingAccess?.readOnly}
                />
                <input
                  value={form.widget_color}
                  onChange={(event) => updateForm('widget_color', event.target.value)}
                  className="portal-input w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                  disabled={billingAccess?.readOnly}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                Welcome heading
              </label>
              <input
                value={form.welcome_heading}
                onChange={(event) => updateForm('welcome_heading', event.target.value)}
                className="portal-input w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                disabled={billingAccess?.readOnly}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                Welcome tagline
              </label>
              <input
                value={form.welcome_tagline}
                onChange={(event) => updateForm('welcome_tagline', event.target.value)}
                className="portal-input w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                disabled={billingAccess?.readOnly}
              />
            </div>

            <label className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)' }}>
              <input
                type="checkbox"
                checked={form.greeting_enabled}
                onChange={(event) => updateForm('greeting_enabled', event.target.checked)}
                disabled={billingAccess?.readOnly}
              />
              Send an automatic greeting
            </label>

            <label className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)' }}>
              <input
                type="checkbox"
                checked={form.pre_chat_form_enabled}
                onChange={(event) => updateForm('pre_chat_form_enabled', event.target.checked)}
                disabled={billingAccess?.readOnly}
              />
              Ask for contact info first
            </label>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                Greeting message
              </label>
              <textarea
                value={form.greeting_message}
                onChange={(event) => updateForm('greeting_message', event.target.value)}
                rows={3}
                className="portal-input w-full resize-y rounded-xl px-4 py-3 text-sm focus:outline-none"
                disabled={billingAccess?.readOnly}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                Saved replies
              </label>
              <div className="space-y-3">
                {(form.saved_replies || []).slice(0, 3).map((reply, index) => (
                  <div key={`${reply.title}-${index}`} className="grid gap-2 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)' }}>
                    <input
                      value={reply.title || ''}
                      onChange={(event) => updateSavedReply(index, 'title', event.target.value)}
                      className="portal-input w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      disabled={billingAccess?.readOnly}
                    />
                    <textarea
                      value={reply.message || ''}
                      onChange={(event) => updateSavedReply(index, 'message', event.target.value)}
                      rows={2}
                      className="portal-input w-full resize-y rounded-lg px-3 py-2 text-sm focus:outline-none"
                      disabled={billingAccess?.readOnly}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {status && <StatusBadge status={status.type} message={status.message} />}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || billingAccess?.readOnly}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save website chat
        </button>
      </div>
    </Section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { session, requireWriteAccess, billingAccess } = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnedPlatform = searchParams.get('connected') || null

  useEffect(() => {
    if (returnedPlatform) {
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchUserProfile,
  })

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwStatus, setPwStatus] = useState(null)

  async function handlePasswordChange(e) {
    e.preventDefault()
    if (newPw !== confirmPw) {
      setPwStatus({ type: 'error', message: 'New passwords do not match.' })
      return
    }
    if (newPw.length < 8) {
      setPwStatus({ type: 'error', message: 'Password must be at least 8 characters.' })
      return
    }
    setPwLoading(true)
    setPwStatus(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPw,
    })

    if (signInError) {
      setPwStatus({ type: 'error', message: 'Current password is incorrect.' })
      setPwLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwLoading(false)

    if (error) {
      setPwStatus({ type: 'error', message: error.message })
    } else {
      setPwStatus({ type: 'success', message: 'Password updated successfully.' })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    }
  }

  const client = profile?.clients
  const tenant = buildTenantConfig({ client })

  return (
    <div className="portal-page w-full max-w-none space-y-6 md:p-5 xl:p-6">
      <section className="portal-surface rounded-[36px] p-5 md:p-7">
        <div className="portal-page-header">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Settings
              </span>
            </div>
            <h1 className="portal-page-title font-display">Settings</h1>
          </div>
        </div>
      </section>

      <div className="space-y-5">

        {/* Account info */}
        <Section title="Account" description="Your login information" icon={User}>
          {isLoading ? (
            <div className="flex items-center gap-2" style={{ color: 'var(--portal-text-muted)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Name" value={profile?.name} />
              <Field label="Email" value={profile?.email ?? session?.user?.email} />
              <Field label="Role" value={profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : undefined} />
            </div>
          )}
        </Section>

        {/* Business info */}
        {client && (
          <Section title="Business Profile" description="Details on file for your account" icon={Building2}>
            <div className="space-y-4">
              <Field label="Business Name" value={client.business_name} />
              <Field label="Contact Email" value={client.contact_email} />
              <Field label="Website" value={client.website_url} />
            </div>
            <p className="text-xs mt-4" style={{ color: 'var(--portal-text-soft)' }}>
              To update your business details, contact{' '}
              <a href={`mailto:${tenant.supportEmail}`}
                className="transition-colors hover:text-brand-gold"
                style={{ color: 'var(--portal-text-muted)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                {tenant.supportEmail}
              </a>
            </p>
          </Section>
        )}

        {/* Social connections */}
        {profile?.client_id && (
          <SocialConnectionsSection
            clientId={profile.client_id}
            returnedPlatform={returnedPlatform}
            requireWriteAccess={requireWriteAccess}
            billingAccess={billingAccess}
          />
        )}

        {client && (
          <WebsiteChatSection
            client={client}
            requireWriteAccess={requireWriteAccess}
            billingAccess={billingAccess}
            tenant={tenant}
          />
        )}

        {/* Change password */}
        <Section title="Change Password" description="Update your login password" icon={Lock}>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                Current Password
              </label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                required
                placeholder="••••••••"
                className="portal-input w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                New Password
              </label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                placeholder="Min. 8 characters"
                className="portal-input w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--portal-text-soft)' }}>
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                placeholder="••••••••"
                className="portal-input w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-all"
              />
            </div>

            {pwStatus && <StatusBadge status={pwStatus.type} message={pwStatus.message} />}

            <button
              type="submit"
              disabled={pwLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}>
              {pwLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Updating…</>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </Section>

      </div>
    </div>
  )
}
