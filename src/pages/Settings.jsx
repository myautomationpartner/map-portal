import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildTenantConfig } from '../lib/tenantConfig'
import { DASHBOARD_PLATFORMS } from '../lib/platformCatalog'
import {
  User, Lock, Building2, CheckCircle2, Loader2, AlertCircle,
  Link2, ExternalLink, Wifi, WifiOff
} from 'lucide-react'

const SETTINGS_CONNECT_ENDPOINT = '/api/n8n/zernio-connect-url'
const SETTINGS_SYNC_ENDPOINT = '/api/n8n/zernio-sync-accounts'

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
  const [syncStatus, setSyncStatus] = useState(null)
  const autoSyncTimeoutRef = useRef(null)

  function buildSettingsRedirectUrl(platform) {
    if (typeof window === 'undefined') return ''
    const url = new URL('/settings', window.location.origin)
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

    const res = await fetch(SETTINGS_SYNC_ENDPOINT, {
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
      const res = await fetch(SETTINGS_CONNECT_ENDPOINT, {
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
                    <div
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(107,193,142,0.10)', border: '1px solid rgba(107,193,142,0.22)', color: '#2f8f57' }}>
                      <CheckCircle2 className="w-3 h-3" />
                      Connected
                    </div>
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
    <div className="portal-page mx-auto max-w-[1180px] space-y-6 md:p-6 xl:p-8">
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
