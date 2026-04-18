import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  User, Lock, Building2, CheckCircle2, Loader2, AlertCircle,
  Share2, Camera, Music2, Link2, RefreshCw, ExternalLink, Wifi, WifiOff
} from 'lucide-react'

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'

const PLATFORMS = [
  {
    id: 'facebook',
    label: 'Facebook',
    Icon: Share2,
    gradient: 'from-blue-600 to-blue-400',
    color: '#8ab4e0',
    connectedBg: 'rgba(92,143,214,0.08)',
    connectedBorder: 'rgba(92,143,214,0.2)',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    Icon: Camera,
    gradient: 'from-pink-600 to-purple-500',
    color: '#e879a0',
    connectedBg: 'rgba(232,121,160,0.08)',
    connectedBorder: 'rgba(232,121,160,0.2)',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    Icon: Music2,
    gradient: 'from-red-500 to-pink-500',
    color: '#f0948a',
    connectedBg: 'rgba(240,148,138,0.08)',
    connectedBorder: 'rgba(240,148,138,0.2)',
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
    <div className="rounded-2xl overflow-hidden" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
      <div className="px-6 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid #3d3420' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(212,168,58,0.10)', border: '1px solid rgba(212,168,58,0.20)' }}>
          <Icon className="w-4 h-4" style={{ color: '#d4a83a' }} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#f8f2e4' }}>{title}</h2>
          {description && <p className="text-xs mt-0.5" style={{ color: '#8a7858' }}>{description}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#8a7858' }}>{label}</label>
      <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#252015', border: '1px solid #3d3420', color: '#c8b898' }}>
        {value || <span style={{ color: '#4e4228' }}>—</span>}
      </div>
    </div>
  )
}

function StatusBadge({ status, message }) {
  if (!status) return null
  const isSuccess = status === 'success'
  return (
    <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3"
      style={isSuccess
        ? { background: 'rgba(107,193,142,0.08)', border: '1px solid rgba(107,193,142,0.2)', color: '#6bc18e' }
        : { background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#e8899a' }
      }>
      {isSuccess ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {message}
    </div>
  )
}

// ── Social Connections section ────────────────────────────────────────────────

function SocialConnectionsSection({ clientId, returnedPlatform }) {
  const queryClient = useQueryClient()
  const [connectingPlatform, setConnectingPlatform] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  useEffect(() => {
    if (!returnedPlatform || !clientId) return
    setSyncStatus({ type: 'info', message: `${returnedPlatform.charAt(0).toUpperCase() + returnedPlatform.slice(1)} connected! Syncing your accounts…` })
    handleSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedPlatform, clientId])

  const { data: connections = [], isLoading: connectionsLoading } = useQuery({
    queryKey: ['social_connections', clientId],
    queryFn: () => fetchConnections(clientId),
    enabled: !!clientId,
  })

  const connectedMap = Object.fromEntries(connections.map(c => [c.platform, c]))

  async function handleConnect(platform) {
    setConnectingPlatform(platform)
    setSyncStatus(null)
    try {
      const res = await fetch(`${N8N_BASE}/webhook/zernio-connect-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, platform }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700,noopener,noreferrer')
        setSyncStatus({ type: 'info', message: `Connect your ${platform} account in the new tab, then click "Sync Accounts" when done.` })
      } else {
        setSyncStatus({ type: 'error', message: `Could not get connect URL for ${platform}. Try again.` })
      }
    } catch (err) {
      setSyncStatus({ type: 'error', message: 'Failed to reach automation server. Check your connection.' })
    } finally {
      setConnectingPlatform(null)
    }
  }

  async function handleSync() {
    if (!clientId) return
    setSyncing(true)
    setSyncStatus(null)
    try {
      const res = await fetch(`${N8N_BASE}/webhook/zernio-sync-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) {
        await queryClient.invalidateQueries({ queryKey: ['social_connections', clientId] })
        setSyncStatus({ type: 'success', message: `Synced ${data.synced || 0} account${data.synced !== 1 ? 's' : ''} successfully.` })
      } else {
        setSyncStatus({ type: 'error', message: 'Sync completed but returned no accounts.' })
      }
    } catch (err) {
      setSyncStatus({ type: 'error', message: 'Sync failed. Please try again.' })
    } finally {
      setSyncing(false)
    }
  }

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
          {PLATFORMS.map(({ id, label, Icon, gradient, color, connectedBg, connectedBorder }) => {
            const conn = connectedMap[id]
            const isConnecting = connectingPlatform === id

            return (
              <div
                key={id}
                className="flex items-center gap-4 p-4 rounded-xl transition-all"
                style={conn
                  ? { background: connectedBg, border: `1px solid ${connectedBorder}` }
                  : { background: '#252015', border: '1px solid #3d3420' }
                }>
                {/* Platform icon */}
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4 text-white" strokeWidth={2} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#f8f2e4' }}>{label}</p>
                  {conn ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Wifi className="w-3 h-3" style={{ color }} />
                      <p className="text-xs" style={{ color: '#8a7858' }}>
                        {conn.username ? `@${conn.username}` : 'Connected'} · {new Date(conn.connected_at).toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <WifiOff className="w-3 h-3" style={{ color: '#4e4228' }} />
                      <p className="text-xs" style={{ color: '#4e4228' }}>Not connected</p>
                    </div>
                  )}
                </div>

                {/* Connect button */}
                <button
                  onClick={() => handleConnect(id)}
                  disabled={!!connectingPlatform || syncing}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={conn
                    ? { background: '#1e1910', border: '1px solid #3d3420', color: '#8a7858' }
                    : { background: 'rgba(212,168,58,0.12)', border: '1px solid rgba(212,168,58,0.25)', color: '#d4a83a' }
                  }>
                  {isConnecting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3 h-3" />
                  )}
                  {conn ? 'Reconnect' : 'Connect'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Status message */}
      {syncStatus && (
        <div className="mt-4 flex items-start gap-2 text-sm rounded-xl px-4 py-3"
          style={syncStatus.type === 'success'
            ? { background: 'rgba(107,193,142,0.08)', border: '1px solid rgba(107,193,142,0.2)', color: '#6bc18e' }
            : syncStatus.type === 'info'
            ? { background: 'rgba(212,168,58,0.08)', border: '1px solid rgba(212,168,58,0.2)', color: '#d4a83a' }
            : { background: 'rgba(196,85,110,0.08)', border: '1px solid rgba(196,85,110,0.2)', color: '#e8899a' }
          }>
          {syncStatus.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          {syncStatus.message}
        </div>
      )}

      {/* Sync button */}
      <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid #3d3420' }}>
        <p className="text-xs" style={{ color: '#4e4228' }}>
          After connecting in the popup, sync to save your accounts here.
        </p>
        <button
          onClick={handleSync}
          disabled={syncing || connectionsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: '#252015', border: '1px solid #3d3420', color: '#c8b898' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(212,168,58,0.25)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#3d3420'}>
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          Sync Accounts
        </button>
      </div>
    </Section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { session } = useOutletContext()
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

  const inputStyle = {
    background: '#252015',
    border: '1px solid #3d3420',
    color: '#f8f2e4',
  }
  const inputClass = 'w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-all'

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest font-medium mb-1" style={{ color: '#8a7858' }}>Account</p>
        <h1 className="font-display text-2xl md:text-3xl font-semibold" style={{ color: '#f8f2e4' }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: '#8a7858' }}>Manage your account, social connections, and preferences.</p>
      </div>

      <div className="space-y-5">

        {/* Account info */}
        <Section title="Account" description="Your login information" icon={User}>
          {isLoading ? (
            <div className="flex items-center gap-2" style={{ color: '#8a7858' }}>
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
            <p className="text-xs mt-4" style={{ color: '#4e4228' }}>
              To update your business details, contact{' '}
              <a href="mailto:billing@myautomationpartner.com"
                className="transition-colors hover:text-brand-gold"
                style={{ color: '#8a7858', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                billing@myautomationpartner.com
              </a>
            </p>
          </Section>
        )}

        {/* Social connections */}
        {profile?.client_id && (
          <SocialConnectionsSection clientId={profile.client_id} returnedPlatform={returnedPlatform} />
        )}

        {/* Change password */}
        <Section title="Change Password" description="Update your login password" icon={Lock}>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#8a7858' }}>
                Current Password
              </label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                required
                placeholder="••••••••"
                className={inputClass}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#d4a83a'}
                onBlur={e => e.target.style.borderColor = '#3d3420'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#8a7858' }}>
                New Password
              </label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                placeholder="Min. 8 characters"
                className={inputClass}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#d4a83a'}
                onBlur={e => e.target.style.borderColor = '#3d3420'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#8a7858' }}>
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                placeholder="••••••••"
                className={inputClass}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#d4a83a'}
                onBlur={e => e.target.style.borderColor = '#3d3420'}
              />
            </div>

            {pwStatus && <StatusBadge status={pwStatus.type} message={pwStatus.message} />}

            <button
              type="submit"
              disabled={pwLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#d4a83a', color: '#0d0b08' }}>
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
