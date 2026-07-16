import { useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronRight, Clock3, Loader2, Sparkles } from 'lucide-react'
import MobilePartnerTopBar from '../components/MobilePartnerTopBar'
import { fetchOpportunityRadar } from '../lib/portalApi'

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

export default function Notifications() {
  const outlet = useOutletContext() || {}
  const navigate = useNavigate()
  const clientId = outlet.profile?.client_id
  const { data = [], isLoading } = useQuery({
    queryKey: ['opportunity-radar', clientId],
    queryFn: () => fetchOpportunityRadar(clientId),
    enabled: Boolean(clientId),
  })
  const items = useMemo(() => activeItems(data), [data])

  function createPost({ opportunity, suggestion }) {
    navigate(`/post?opportunityId=${encodeURIComponent(opportunity.id)}&suggestionId=${encodeURIComponent(suggestion.id)}&create=1`)
  }

  return (
    <div className="mobile-notification-center">
      <MobilePartnerTopBar activeMode="" notificationCount={items.length} />
      <main className="mobile-notification-center-body">
        <header>
          <span><Bell size={18} /> Notifications</span>
          <h1>Ideas waiting for you</h1>
          <p>These stay here if you dismiss the phone alert. Nothing posts until you approve it.</p>
        </header>

        {isLoading ? (
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
        )) : (
          <div className="mobile-notification-empty">
            <Sparkles size={24} />
            <strong>You’re caught up.</strong>
            <span>My Partner will keep looking for timely ideas.</span>
          </div>
        )}
      </main>
    </div>
  )
}
