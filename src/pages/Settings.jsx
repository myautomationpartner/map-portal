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
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    Icon: Camera,
    gradient: 'from-pink-600 to-purple-500',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    Icon: Music2,
    gradient: 'from-red-500 to-pink-500',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
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

function Section({ title, description, icon: Icon, children }) {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800/60 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-zinc-800/60 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-violet-400" strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-xl px-4 py-3 text-sm text-zinc-300">
        {value || <span className="text-zinc-600">—</span>}
      </div>
    </div>
  )
}

function StatusBadge({ status, message }) {
  if (!status) return null
  const isSuccess = status === 'success'
  return (
    <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 ${isSuccess ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
      {isSuccess ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {message}
    </div>
  )
}

function SocialConnectionsSection({ clientId, returnedPlatform }) {
  const queryClient = useQueryClient()
  const [connectingPlatform, setConnectingPlatform] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  // Auto-sync when returning from Zernio OAuth
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

  const connectedMap = Object.fromEntries(
    connections.map(c => [c.platform, c])
  )

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
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading connections…</span>
        </div>
      ) : (
        <div className="space-y-3">
          {PLATFORMS.map(({ id, label, Icon, gradient, color, bg, border }) => {
            const conn = connectedMap[id]
            const isConnecting = connectingPlatform === id

            return (
              <div
                key={id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  conn
                    ? `${bg} ${border}`
                    : 'bg-zinc-800/30 border-zinc-700/40'
                }`}
              >
                {/* Platform icon */}
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4 text-white" strokeWidth={2} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{label}</p>
                  {conn ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Wifi className={`w-3 h-3 ${color}`} />
                      <p className="text-xs text-zinc-400">
                        {conn.username ? `@${conn.username}` : 'Connected'} · {new Date(conn.connected_at).toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <WifiOff className="w-3 h-3 text-zinc-600" />
                      <p className="text-xs text-zinc-600">Not connected</p>
                    </div>
                  )}
                </div>

                {/* Connect button */}
                <button
                  onClick={() => handleConnect(id)}
                  disabled={!!connectingPlatform || syncing}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    conn
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50'
                      : 'bg-violet-600 hover:bg-violet-500 text-white shadow-sm shadow-violet-500/20'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
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
        <div className={`mt-4 flex items-start gap-2 text-sm rounded-xl px-4 py-3 ${
          syncStatus.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : syncStatus.type === 'info'
            ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {syncStatus.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          {syncStatus.message}
        </div>
      )}

      {/* Sync button */}
      <div className="mt-4 pt-4 border-t border-zinc-800/60 flex items-center justify-between">
        <p className="text-xs text-zinc-600">
          After connecting in the popup, sync to save your accounts here.
        </p>
        <button
          onClick={handleSync}
          disabled={syncing || connectionsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold rounded-lg border border-zinc-700/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          Sync Accounts
        </button>
      </div>
    </Section>
  )
}

export default function Settings() {
  const { session } = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnedPlatform = searchParams.get('connected') || null

  // Clear query params from URL after reading them (clean up after OAuth return)
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

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Account</p>
        <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Manage your account, social connections, and preferences.</p>
      </div>

      <div className="space-y-5">
        {/* Account info */}
        <Section title="Account" description="Your login information" icon={User}>
          {isLoading ? (
            <div className="flex items-center gap-2 text-zinc-500">
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
            <p className="text-xs text-zinc-600 mt-4">
              To update your business details, contact{' '}
              <a href="mailto:billing@myautomationpartner.com" className="text-zinc-500 hover:text-zinc-400 underline underline-offset-2 transition-colors">
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
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Current Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-zinc-800/60 border border-zinc-700/60 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                placeholder="Min. 8 characters"
                className="w-full bg-zinc-800/60 border border-zinc-700/60 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Confirm New Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-zinc-800/60 border border-zinc-700/60 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200"
              />
            </div>

            {pwStatus && <StatusBadge status={pwStatus.type} message={pwStatus.message} />}

            <button
              type="submit"
              disabled={pwLoading}
              className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all duration-200 flex items-center gap-2 shadow-md shadow-violet-500/20 hover:-translate-y-px active:translate-y-0"
            >
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
