import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Bell, ChevronRight, Clock3, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import MobilePartnerTopBar from '../components/MobilePartnerTopBar'
import { fetchOpportunityRadar } from '../lib/portalApi'
import { portalPath } from '../lib/portalPath'
import { supabase } from '../lib/supabase'

const HIDDEN_STATES = new Set(['archived', 'dismissed', 'converted_to_draft'])

function activeItems(opportunities) {
  const now = Date.now()
  return opportunities.flatMap((opportunity) => {
    if (HIDDEN_STATES.has(opportunity.review_state)) return []
    if (opportunity.expires_at && new Date(opportunity.expires_at).getTime() < now) return []
    return (opportunity.client_opportunity_suggestions || [])
      .filter((suggestion) => !HIDDEN_STATES.has(suggestion.review_state) && !suggestion.converted_draft_id)
      .map((suggestion) => ({ opportunity, suggestion }))
  }).sort((a, b) => {
    const aUrgency = Number(a.opportunity.urgency_score || 0)
    const bUrgency = Number(b.opportunity.urgency_score || 0)
    return bUrgency - aUrgency
  })
}

function timingLabel(item) {
  const value = item.suggestion.recommended_publish_at || item.opportunity.starts_at || item.opportunity.expires_at
  if (!value) return 'Ready when you are'
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value))
}

async function portalAuthenticatedFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in again to manage social connections.')
  const response = await fetch(portalPath(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'Could not check social connections.')
  return payload
}

async function fetchSocialConnectionHealth() {
  return portalAuthenticatedFetch('/api/social-connections/health')
}

export default function Notifications() {
  const outlet = useOutletContext() || {}
  const navigate = useNavigate()
  const clientId = outlet.profile?.client_id
  const [connectingPlatform, setConnectingPlatform] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const { data = [], isLoading } = useQuery({
    queryKey: ['opportunity-radar', clientId],
    queryFn: () => fetchOpportunityRadar(clientId),
    enabled: Boolean(clientId),
  })
  const items = useMemo(() => activeItems(data), [data])
  const { data: connectionHealth = { missing: [] }, isLoading: connectionHealthLoading } = useQuery({
    queryKey: ['social-connection-health', clientId],
    queryFn: fetchSocialConnectionHealth,
    enabled: Boolean(clientId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const missingConnections = Array.isArray(connectionHealth?.missing) ? connectionHealth.missing : []
  const notificationCount = items.length + missingConnections.length

  function createPost({ opportunity, suggestion }) {
    navigate(`/post?opportunityId=${encodeURIComponent(opportunity.id)}&suggestionId=${encodeURIComponent(suggestion.id)}&create=1`)
  }

  async function reconnect(platform) {
    setConnectingPlatform(platform)
    setConnectionError('')
    try {
      const redirectUrl = new URL(portalPath('/connect-return'), window.location.origin)
      redirectUrl.searchParams.set('connected', platform)
      redirectUrl.searchParams.set('source', 'notifications')
      redirectUrl.searchParams.set('returnTo', portalPath('/notifications'))
      const result = await portalAuthenticatedFetch('/api/n8n/zernio-connect-url', {
        method: 'POST',
        body: JSON.stringify({ clientId, platform, redirectUrl: redirectUrl.toString() }),
      })
      if (!result.authUrl) throw new Error(`Could not open ${platform} connection.`)
      window.location.assign(result.authUrl)
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Could not start reconnection.')
      setConnectingPlatform('')
    }
  }

  return (
    <div className="mobile-notification-center">
      <MobilePartnerTopBar
        activeMode=""
        notificationCount={notificationCount}
        inboxUnreadCount={outlet.inboxNotificationCount}
      />
      <main className="mobile-notification-center-body">
        <header>
          <span><Bell size={18} /> Notifications</span>
          <h1>What needs you</h1>
          <p>Connection alerts stay here until they are fixed. Content ideas stay review-only until you approve them.</p>
        </header>

        {missingConnections.map((connection) => (
          <article className="mobile-notification-card is-connection-alert" key={`connection-${connection.platform}`}>
            <div className="mobile-notification-card-meta">
              <span><AlertTriangle size={15} /> Connection needs attention</span>
            </div>
            <h2>{connection.label} is disconnected</h2>
            <p>
              {connection.username ? `Reconnect @${String(connection.username).replace(/^@/, '')} ` : `Reconnect ${connection.label} `}
              to keep publishing, metrics, and social messages working.
            </p>
            <button type="button" onClick={() => reconnect(connection.platform)} disabled={connectingPlatform === connection.platform}>
              {connectingPlatform === connection.platform ? <><RefreshCw className="animate-spin" size={17} /> Opening…</> : <>Reconnect {connection.label} <ChevronRight size={18} /></>}
            </button>
          </article>
        ))}

        {connectionError ? <div className="mobile-notification-error">{connectionError}</div> : null}

        {isLoading || connectionHealthLoading ? (
          <div className="mobile-notification-empty"><Loader2 className="animate-spin" /> Looking for current opportunities…</div>
        ) : items.length ? items.map((item) => (
          <article className="mobile-notification-card" key={item.suggestion.id}>
            <div className="mobile-notification-card-meta">
              <span><Sparkles size={15} /> Partner idea</span>
              <span><Clock3 size={14} /> {timingLabel(item)}</span>
            </div>
            <h2>{item.suggestion.title || item.opportunity.title}</h2>
            <p>{item.suggestion.caption_starter || item.opportunity.summary || item.opportunity.why_it_matters}</p>
            <button type="button" onClick={() => createPost(item)}>
              Create this post <ChevronRight size={18} />
            </button>
            <button type="button" className="is-secondary" onClick={() => navigate('/post?fresh=1')}>
              I have another idea
            </button>
          </article>
        )) : !missingConnections.length ? (
          <div className="mobile-notification-empty">
            <Sparkles size={24} />
            <strong>You’re caught up.</strong>
            <span>My Partner will keep looking for timely ideas.</span>
          </div>
        ) : null}
      </main>
    </div>
  )
}
