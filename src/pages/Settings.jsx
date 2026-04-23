import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildTenantConfig } from '../lib/tenantConfig'
import {
  User, Lock, Building2, CheckCircle2, Loader2, AlertCircle,
  Share2, Camera, Music2, Link2, ExternalLink, Wifi, WifiOff
} from 'lucide-react'

const SETTINGS_CONNECT_ENDPOINT = '/api/n8n/zernio-connect-url'

const PLATFORMS = [
  {
    id: 'facebook',
    label: 'Facebook',
    Icon: Share2,
    accent: '#4267B2',
    connectedBg: 'rgba(66,103,178,0.08)',
    connectedBorder: 'rgba(66,103,178,0.18)',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    Icon: Camera,
    accent: '#C13584',
    connectedBg: 'rgba(193,53,132,0.08)',
    connectedBorder: 'rgba(193,53,132,0.18)',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    Icon: Music2,
    accent: '#111111',
    connectedBg: 'rgba(17,17,17,0.06)',
    connectedBorder: 'rgba(17,17,17,0.14)',
  },
]

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
  return platform.charAt(0).toUpperCase() + platform.slice(1)
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

  const connectedMap = Object.fromEntries(connections.map(c => [c.platform, c]))

  function clearAutoSyncTimer() {
    if (autoSyncTimeoutRef.current) {
      clearTimeout(autoSyncTimeoutRef.current)
      autoSyncTimeoutRef.current = null
    }
  }

  async function checkConnectionStatus(platform = null, options = {}) {
    const {
      suppressNoAccountError = false,
      keepStatus = false,
      successPrefix = '',
    } = options

    if (!clientId) return { success: false, found: false }

    if (!keepStatus) {
      setSyncStatus(null)
    }

    try {
      const latestConnections = await queryClient.fetchQuery({
        queryKey: ['social_connections', clientId],
        queryFn: () => fetchConnections(clientId),
      })

      const foundConnection = platform
        ? latestConnections.find((entry) => entry.platform === platform)
        : latestConnections[0]

      if (foundConnection) {
        setSyncStatus({
          type: 'success',
          message: `${successPrefix}${formatPlatformLabel(platform || foundConnection.platform)} is connected and ready for publishing and metrics.`,
        })
        return { success: true, found: true, connection: foundConnection }
      }

      if (!suppressNoAccountError) {
        setSyncStatus({
          type: 'info',
          message: platform
            ? `We're still waiting for ${formatPlatformLabel(platform)} to finish connecting in Zernio.`
            : 'We are still waiting for Zernio to finish connecting your account.',
        })
      }

      return { success: true, found: false }
    } catch {
      setSyncStatus({ type: 'error', message: 'Could not refresh connected accounts from Supabase. Please try again.' })
      return { success: false, found: false }
    }
  }

  function startAutoSync(platform, attempt = 0) {
    const maxAttempts = 24
    const delayMs = attempt === 0 ? 1500 : 5000

    clearAutoSyncTimer()
    autoSyncTimeoutRef.current = setTimeout(async () => {
      const result = await checkConnectionStatus(platform, {
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
          message: `${formatPlatformLabel(platform)} is still finishing in Zernio. This page will update automatically as soon as the connected account is available.`,
        })
        clearAutoSyncTimer()
        return
      }

      startAutoSync(platform, attempt + 1)
    }, delayMs)
  }

  async function handleConnect(platform) {
    if (!requireWriteAccess('change social connections')) return

    setConnectingPlatform(platform)
    setSyncStatus(null)
    clearAutoSyncTimer()

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
        window.open(data.authUrl, '_blank', 'width=600,height=700,noopener,noreferrer')
        setSyncStatus({
          type: 'info',
          message: `Finish connecting ${formatPlatformLabel(platform)} in the new tab. We'll update this page automatically when Zernio confirms it.`,
        })
        startAutoSync(platform)
      } else {
        const details = normalizeWorkflowError(data, `Could not get connect URL for ${formatPlatformLabel(platform)}. Try again.`)
        setSyncStatus({ type: 'error', message: details })
        setConnectingPlatform(null)
      }
    } catch {
      setSyncStatus({ type: 'error', message: 'Failed to reach automation server. Check your connection.' })
      setConnectingPlatform(null)
    }
  }

  useEffect(() => {
    if (!returnedPlatform || !clientId) return

    if (connectedMap[returnedPlatform]) {
      const timer = window.setTimeout(() => {
        setSyncStatus({
          type: 'success',
          message: `${formatPlatformLabel(returnedPlatform)} is connected and ready for publishing and metrics.`,
        })
        setConnectingPlatform(null)
      }, 0)
      clearAutoSyncTimer()
      return () => window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => {
      setSyncStatus({
        type: 'info',
        message: `${formatPlatformLabel(returnedPlatform)} returned from Zernio. Finalizing the connection…`,
      })
    }, 0)
    startAutoSync(returnedPlatform)
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
          {PLATFORMS.map(({ id, label, Icon, accent, connectedBg, connectedBorder }) => {
            const conn = connectedMap[id]
            const isConnecting = connectingPlatform === id

            return (
              <div
                key={id}
                className="flex items-center gap-4 p-4 rounded-xl transition-all"
                style={conn
                  ? { background: connectedBg, border: `1px solid ${connectedBorder}` }
                  : { background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)' }
                }>
                {/* Platform icon */}
                <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0" style={{ background: accent }}>
                  <Icon className="w-4 h-4 text-white" strokeWidth={2} />
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
                      onClick={() => handleConnect(id)}
                      disabled={!!connectingPlatform || billingAccess?.readOnly}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--portal-primary)' }}>
                      {isConnecting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3 h-3" />
                      )}
                      {isConnecting ? 'Connecting…' : 'Connect'}
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
