import { useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Image,
  Loader2,
  Megaphone,
  PencilLine,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react'
import {
  fetchOpportunityRadar,
  fetchProfile,
  fetchScheduledPosts,
  fetchSocialDrafts,
  recordPlannerFeedbackEvent,
  updateOpportunityState,
  updateOpportunitySuggestionState,
  upsertSocialDraft,
} from '../lib/portalApi'
import { buildCalendarModel, buildDraftPayload } from '../lib/socialPlanner'
import { generateDraftForSlot, stringifyDraftMeta } from '../lib/socialDrafting'

const HIDDEN_RADAR_STATES = new Set(['dismissed', 'archived', 'converted_to_draft'])
const BADGE_STYLES = {
  radar: { label: 'Radar', background: 'rgba(53,104,166,0.1)', color: '#3568a6', border: 'rgba(53,104,166,0.18)' },
  recommended: { label: 'Recommended', background: 'rgba(201,168,76,0.12)', color: '#8c6d1c', border: 'rgba(201,168,76,0.24)' },
  draft: { label: 'Draft', background: 'rgba(93,121,104,0.12)', color: '#4d6c5b', border: 'rgba(93,121,104,0.2)' },
  scheduled: { label: 'Scheduled', background: 'rgba(31,169,113,0.1)', color: '#17875b', border: 'rgba(31,169,113,0.2)' },
  ad: { label: 'Ad idea', background: 'rgba(216,95,152,0.1)', color: '#b5487b', border: 'rgba(216,95,152,0.2)' },
}

function normalizeSentence(value, fallback = '') {
  const text = String(value || '').trim()
  if (!text) return fallback
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function formatDate(value, options = {}) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

function formatSlotDate(dateString) {
  return formatDate(`${dateString}T12:00:00`, { weekday: 'short', month: 'short', day: 'numeric' })
}

function getActiveSuggestions(opportunity) {
  return [...(opportunity?.client_opportunity_suggestions || [])]
    .filter((suggestion) => !['archived', 'dismissed', 'converted_to_draft'].includes(suggestion.review_state) && !suggestion.converted_draft_id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

function getPrimarySuggestion(opportunity) {
  return getActiveSuggestions(opportunity)[0] || null
}

function getAdBriefValue(suggestion, key) {
  const brief = suggestion?.ad_brief_json
  if (!brief || typeof brief !== 'object') return ''
  return brief[key] || ''
}

function getRadarPriority(opportunity) {
  const urgency = Number(opportunity?.urgency_score) || 0
  const confidence = Number(opportunity?.confidence_score) || 0
  const adBoost = opportunity?.ad_worthiness === 'dedicated_ad_candidate'
    ? 0.2
    : opportunity?.ad_worthiness === 'boost_worthy'
      ? 0.1
      : 0
  return urgency + (confidence * 0.35) + adBoost
}

function nextDefaultPublishDate() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setHours(10, 0, 0, 0)
  return date
}

function getDateParts(value) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : nextDefaultPublishDate()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return {
    slotDate: `${year}-${month}-${day}`,
    slotStart: `${hour}:${minute}`,
    slotEnd: `${String(Math.min(date.getHours() + 1, 23)).padStart(2, '0')}:${minute}`,
    scheduledFor: date.toISOString(),
  }
}

function getPlannerProfile(profile) {
  const plannerProfile = profile?.clients?.client_planner_profiles
  return Array.isArray(plannerProfile) ? plannerProfile[0] : plannerProfile
}

function buildRadarAction(opportunity, suggestion) {
  const captionStarter = normalizeSentence(
    suggestion?.caption_starter || opportunity?.summary,
    'Share why this matters right now and give people one simple next step.',
  )
  const callToAction = normalizeSentence(
    getAdBriefValue(suggestion, 'call_to_action') || getAdBriefValue(suggestion, 'cta') || suggestion?.title,
    'Invite people to message you, book, or learn more this week.',
  )
  const imagePrompt = normalizeSentence(
    suggestion?.creative_direction || opportunity?.local_context || opportunity?.why_it_matters,
    'Use a current, real image that clearly connects this post to what is happening now.',
  )
  const whyNow = normalizeSentence(
    opportunity?.suggested_timing || opportunity?.why_it_matters || opportunity?.summary,
    'This is timely enough to review for the current content plan.',
  )

  return {
    captionStarter,
    callToAction,
    imagePrompt,
    whyNow,
    readyCaption: `${captionStarter} ${callToAction}`.replace(/\s+/g, ' ').trim(),
  }
}

function buildRadarDraftRow({ profile, opportunity, suggestion }) {
  const publishDate = suggestion?.recommended_publish_at ? new Date(suggestion.recommended_publish_at) : nextDefaultPublishDate()
  const dateParts = getDateParts(publishDate)
  const client = profile?.clients || {}
  const plannerProfile = getPlannerProfile(profile)
  const action = buildRadarAction(opportunity, suggestion)

  return {
    client_id: profile.client_id,
    planner_client_slug: client.slug || 'content-plan',
    planner_policy_version: plannerProfile?.policy_version || 'content-plan-radar-v1',
    source_workflow: 'opportunity_radar',
    slot_date_local: dateParts.slotDate,
    slot_label: `opportunity_${suggestion.id.slice(0, 8)}`,
    slot_start_local: dateParts.slotStart,
    slot_end_local: dateParts.slotEnd,
    timezone: client.timezone || 'America/New_York',
    scheduled_for: dateParts.scheduledFor,
    post_type: suggestion.suggestion_type === 'ad_brief' ? 'ad_opportunity' : opportunity.opportunity_type,
    draft_title: suggestion.title || opportunity.title,
    draft_body: [
      `What is happening: ${opportunity.summary}`,
      `Why now: ${action.whyNow}`,
      `Suggested visual: ${action.imagePrompt}`,
    ].filter(Boolean).join('\n\n'),
    draft_caption: action.readyCaption,
    review_state: 'draft_created',
    review_notes: stringifyDraftMeta({
      source: 'opportunity_radar',
      sourceSurface: 'content_plan',
      opportunityId: opportunity.id,
      suggestionId: suggestion.id,
      opportunityType: opportunity.opportunity_type,
      adWorthiness: opportunity.ad_worthiness,
      radarAction: {
        title: opportunity.title,
        summary: opportunity.summary,
        captionStarter: action.captionStarter,
        callToAction: action.callToAction,
        readyCaption: action.readyCaption,
        imagePrompt: action.imagePrompt,
      },
      generatedAt: new Date().toISOString(),
    }),
    asset_requirements_json: [
      { type: 'media_concept', suggestion: action.imagePrompt },
      { type: 'media_action', options: ['generate_image', 'upload_photo'] },
    ],
    seasonal_modifier_context_json: [
      {
        source: 'opportunity_radar',
        title: opportunity.title,
        sourceUrls: opportunity.source_urls || [],
      },
    ],
  }
}

function Badge({ type }) {
  const style = BADGE_STYLES[type] || BADGE_STYLES.recommended
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
      style={{ background: style.background, color: style.color, borderColor: style.border }}
    >
      {style.label}
    </span>
  )
}

function PlanRow({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="grid w-full grid-cols-[86px_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-4 text-left transition-all last:border-b-0 hover:bg-[rgba(245,235,214,0.42)]"
      style={{
        borderColor: 'var(--portal-border)',
        background: selected ? 'rgba(245, 235, 214, 0.58)' : 'transparent',
      }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{item.dayLabel}</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-soft)' }}>{item.timeLabel}</p>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge type={item.badgeType} />
          {item.adWorthiness && item.adWorthiness !== 'organic_only' ? <Badge type="ad" /> : null}
        </div>
        <p className="mt-2 truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
          {item.title}
        </p>
        <p className="mt-1 line-clamp-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
          {item.subtitle}
        </p>
      </div>
      <span className="hidden text-xs font-semibold md:inline-flex" style={{ color: 'var(--portal-primary)' }}>
        Review
      </span>
    </button>
  )
}

function ProofChip({ children }) {
  return (
    <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)', background: 'rgba(255,255,255,0.72)' }}>
      {children}
    </span>
  )
}

export default function ContentCalendar() {
  const { requireWriteAccess } = useOutletContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [selectedItemId, setSelectedItemId] = useState('')
  const [actionError, setActionError] = useState('')

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id

  const { data: scheduledPosts = [], isLoading: postsLoading, refetch: refetchPosts, isRefetching: isRefetchingPosts } = useQuery({
    queryKey: ['calendar-posts', clientId],
    queryFn: () => fetchScheduledPosts(clientId),
    enabled: !!clientId,
  })

  const { data: drafts = [], isLoading: draftsLoading, refetch: refetchDrafts, isRefetching: isRefetchingDrafts } = useQuery({
    queryKey: ['social-drafts', clientId],
    queryFn: () => fetchSocialDrafts(clientId),
    enabled: !!clientId,
  })

  const { data: opportunities = [], isLoading: radarLoading, refetch: refetchRadar, isRefetching: isRefetchingRadar } = useQuery({
    queryKey: ['opportunity-radar', clientId],
    queryFn: () => fetchOpportunityRadar(clientId),
    enabled: !!clientId,
  })

  const calendar = useMemo(() => {
    if (!profile) return null
    try {
      return buildCalendarModel(profile, scheduledPosts, drafts)
    } catch (error) {
      return { error }
    }
  }, [profile, scheduledPosts, drafts])

  const radarItems = useMemo(() => (
    opportunities
      .filter((opportunity) => !HIDDEN_RADAR_STATES.has(opportunity.review_state))
      .filter((opportunity) => getActiveSuggestions(opportunity).length > 0)
      .sort((a, b) => {
        const scoreDelta = getRadarPriority(b) - getRadarPriority(a)
        if (Math.abs(scoreDelta) > 0.01) return scoreDelta
        return new Date(b.created_at) - new Date(a.created_at)
      })
      .slice(0, 5)
      .map((opportunity, index) => {
        const suggestion = getPrimarySuggestion(opportunity)
        const action = buildRadarAction(opportunity, suggestion)
        return {
          id: `radar:${opportunity.id}`,
          source: 'radar',
          badgeType: 'radar',
          dayLabel: index === 0 ? 'Today' : 'This week',
          timeLabel: opportunity.expires_at ? `By ${formatDate(opportunity.expires_at, { month: 'short', day: 'numeric' })}` : 'Review',
          title: suggestion?.title || opportunity.title,
          subtitle: opportunity.title,
          detailTitle: opportunity.title,
          caption: action.readyCaption,
          whyNow: action.whyNow,
          imagePrompt: action.imagePrompt,
          proof: (opportunity.source_urls || []).slice(0, 2),
          adWorthiness: opportunity.ad_worthiness,
          platforms: suggestion?.recommended_platforms || [],
          opportunity,
          suggestion,
        }
      })
  ), [opportunities])

  const plannerItems = useMemo(() => {
    if (!calendar?.slots) return []
    return calendar.slots
      .filter((slot) => ['recommended_fill', 'occupied_draft'].includes(slot.state) && slot.post_type)
      .slice(0, 5)
      .map((slot) => ({
        id: `planner:${slot.slot_date_local}:${slot.slot_label}`,
        source: slot.state === 'occupied_draft' ? 'draft' : 'recommended',
        badgeType: slot.state === 'occupied_draft' ? 'draft' : 'recommended',
        dayLabel: formatSlotDate(slot.slot_date_local),
        timeLabel: slot.slot_start_local,
        title: slot.post_type.replace(/_/g, ' '),
        subtitle: slot.explanation,
        detailTitle: slot.post_type.replace(/_/g, ' '),
        caption: 'MAP can generate a caption starter for this planner slot when you open it in Publisher.',
        whyNow: 'This slot fits the posting cadence and content mix configured for this customer.',
        imagePrompt: 'Use a clear, real image from the business that matches the post topic.',
        proof: ['Planner cadence', 'Content mix'],
        slot,
      }))
  }, [calendar])

  const draftItems = useMemo(() => (
    drafts
      .filter((draft) => draft.review_state !== 'published')
      .slice(0, 3)
      .map((draft) => ({
        id: `draft:${draft.id}`,
        source: 'draft',
        badgeType: 'draft',
        dayLabel: formatSlotDate(draft.slot_date_local),
        timeLabel: draft.slot_start_local || 'Draft',
        title: draft.draft_title || draft.post_type?.replace(/_/g, ' ') || 'Saved draft',
        subtitle: draft.review_state?.replace(/_/g, ' ') || 'Draft saved',
        detailTitle: draft.draft_title || 'Saved draft',
        caption: draft.draft_caption || draft.draft_body || 'Open this draft in Publisher to continue editing.',
        whyNow: 'This is already saved and ready for review.',
        imagePrompt: Array.isArray(draft.asset_requirements_json)
          ? draft.asset_requirements_json.find((item) => item?.suggestion)?.suggestion || 'Review media needs in Publisher.'
          : 'Review media needs in Publisher.',
        proof: ['Saved draft'],
        draft,
      }))
  ), [drafts])

  const scheduledItems = useMemo(() => (
    scheduledPosts
      .slice(0, 3)
      .map((post) => ({
        id: `scheduled:${post.id}`,
        source: 'scheduled',
        badgeType: 'scheduled',
        dayLabel: formatDate(post.scheduled_for || post.created_at, { weekday: 'short', month: 'short', day: 'numeric' }),
        timeLabel: formatDate(post.scheduled_for || post.created_at, { hour: 'numeric', minute: '2-digit' }),
        title: post.content?.slice(0, 72) || 'Scheduled post',
        subtitle: post.status || 'Scheduled',
        detailTitle: 'Scheduled post',
        caption: post.content || 'This post is already on the schedule.',
        whyNow: 'This item is already planned and helps avoid overfilling the calendar.',
        imagePrompt: 'Media was selected when the post was scheduled.',
        proof: ['Scheduled content'],
      }))
  ), [scheduledPosts])

  const planItems = useMemo(() => {
    const merged = [...radarItems.slice(0, 3), ...plannerItems.slice(0, 4), ...draftItems.slice(0, 2), ...scheduledItems.slice(0, 1)]
    return merged.slice(0, 7)
  }, [draftItems, plannerItems, radarItems, scheduledItems])

  const selectedItem = planItems.find((item) => item.id === selectedItemId) || planItems[0] || null

  const createRadarDraft = useMutation({
    mutationFn: async (item) => {
      if (!requireWriteAccess('turn Content Plan ideas into drafts')) return null
      if (!profile?.client_id) throw new Error('Client profile is still loading.')

      const draft = await upsertSocialDraft(buildRadarDraftRow({
        profile,
        opportunity: item.opportunity,
        suggestion: item.suggestion,
      }))

      await updateOpportunitySuggestionState(item.suggestion.id, {
        review_state: 'converted_to_draft',
        converted_draft_id: draft.id,
      })
      await updateOpportunityState(item.opportunity.id, 'converted_to_draft')

      try {
        await recordPlannerFeedbackEvent({
          clientId: profile.client_id,
          draftId: draft.id,
          postType: item.opportunity.opportunity_type,
          eventType: 'draft_generated',
          angleId: 'content_plan_radar',
          metadata: {
            source: 'content_plan',
            opportunityId: item.opportunity.id,
            suggestionId: item.suggestion.id,
          },
        })
      } catch (error) {
        console.error('[ContentPlanFeedback]', error)
      }

      return draft
    },
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ['opportunity-radar', clientId] })
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      if (draft?.id) navigate(`/post?draftId=${draft.id}`)
    },
    onError: (error) => setActionError(error.message || 'Could not create a Publisher draft.'),
  })

  const createPlannerDraft = useMutation({
    mutationFn: async (slot) => {
      if (!requireWriteAccess('turn planner slots into drafts')) return null
      if (!profile?.client_id || !calendar?.policy) throw new Error('Planner is still loading.')
      const generated = generateDraftForSlot({ profile, policy: calendar.policy, slot, drafts })
      const savedDraft = await upsertSocialDraft({
        ...buildDraftPayload(profile, calendar.policy, slot),
        draft_title: generated.title,
        draft_body: generated.draftBody,
        draft_caption: generated.caption,
        review_state: 'draft_created',
        review_notes: stringifyDraftMeta({
          ...generated.meta,
          generationSource: 'content_plan',
          generationMode: 'deterministic',
          generatedAt: new Date().toISOString(),
        }),
        asset_requirements_json: generated.assetRequirements,
      })

      try {
        await recordPlannerFeedbackEvent({
          clientId,
          draftId: savedDraft.id,
          postType: slot.post_type,
          eventType: 'draft_generated',
          angleId: generated.angle.id,
          metadata: { source: 'content_plan', slotDateLocal: slot.slot_date_local, slotLabel: slot.slot_label },
        })
      } catch (error) {
        console.error('[PlannerFeedback]', error)
      }

      return savedDraft
    },
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      if (draft?.id) navigate(`/post?draftId=${draft.id}`)
    },
    onError: (error) => setActionError(error.message || 'Could not create a planner draft.'),
  })

  function handlePrimaryAction(item) {
    setActionError('')
    if (!item) return
    if (item.source === 'radar') {
      createRadarDraft.mutate(item)
      return
    }
    if (item.source === 'recommended') {
      createPlannerDraft.mutate(item.slot)
      return
    }
    if (item.draft?.id) {
      navigate(`/post?draftId=${item.draft.id}`)
      return
    }
    navigate('/post')
  }

  const isLoading = profileLoading || postsLoading || draftsLoading || radarLoading
  const isRefreshing = isRefetchingPosts || isRefetchingDrafts || isRefetchingRadar
  const isCreating = createRadarDraft.isPending || createPlannerDraft.isPending

  if (isLoading) {
    return (
      <div className="portal-page flex min-h-[60vh] items-center justify-center">
        <div className="portal-surface p-6">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--portal-primary)]" />
        </div>
      </div>
    )
  }

  if (calendar?.error) {
    return (
      <div className="portal-page mx-auto max-w-[1100px] md:p-6 xl:p-8">
        <div className="portal-surface p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
            Content Plan unavailable
          </p>
          <p className="mt-3 text-base" style={{ color: 'var(--portal-text)' }}>
            {calendar.error.message}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-page mx-auto max-w-[1480px] space-y-5 md:p-6 xl:p-8">
      <section className="portal-surface p-5 md:p-6">
        <div className="portal-page-header">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                Publisher + Radar
              </span>
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                Customer approved
              </span>
            </div>
            <h1 className="portal-page-title font-display">Content Plan</h1>
            <p className="portal-page-subtitle text-sm leading-relaxed">
              One weekly workspace for recommended posts, AI-discovered opportunities, drafts, and scheduled content.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                refetchPosts()
                refetchDrafts()
                refetchRadar()
              }}
              disabled={isRefreshing}
              className="portal-button-secondary inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link to="/opportunities" className="portal-button-secondary inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              Radar
            </Link>
            <Link to="/post" className="portal-button-primary inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold">
              <PencilLine className="h-4 w-4" />
              Publisher
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="portal-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--portal-border)' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                This week
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                Plan queue
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <ProofChip>{radarItems.length} Radar</ProofChip>
              <ProofChip>{drafts.length} Drafts</ProofChip>
              <ProofChip>{scheduledPosts.length} Scheduled</ProofChip>
            </div>
          </div>

          {planItems.length > 0 ? (
            <div>
              {planItems.map((item) => (
                <PlanRow
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  onSelect={setSelectedItemId}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              No plan items are ready yet. Run Radar or open Publisher to create the first draft.
            </div>
          )}
        </div>

        <aside className="portal-panel p-5">
          {selectedItem ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge type={selectedItem.badgeType} />
                  <h2 className="mt-3 font-display text-2xl font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>
                    {selectedItem.detailTitle}
                  </h2>
                </div>
                {selectedItem.adWorthiness && selectedItem.adWorthiness !== 'organic_only' ? <Badge type="ad" /> : null}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Caption starter
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>
                    {selectedItem.caption}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Why now
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    {selectedItem.whyNow}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Image idea
                  </p>
                  <div className="mt-2 flex gap-3 rounded-[16px] border p-3" style={{ borderColor: 'var(--portal-border)', background: 'rgba(245,240,235,0.55)' }}>
                    <Image className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--portal-primary)' }} />
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                      {selectedItem.imagePrompt}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Proof
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(selectedItem.proof || []).length > 0
                      ? selectedItem.proof.map((source) => (
                          <ProofChip key={source}>
                            {String(source).replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 34)}
                          </ProofChip>
                        ))
                      : <ProofChip>Planner rule</ProofChip>}
                  </div>
                </div>
              </div>

              {actionError && (
                <div className="mt-5 rounded-[14px] px-4 py-3 text-sm" style={{ background: 'rgba(216, 95, 152, 0.1)', color: '#b5487b' }}>
                  {actionError}
                </div>
              )}

              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  onClick={() => handlePrimaryAction(selectedItem)}
                  disabled={isCreating}
                  className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                  Edit in Publisher
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handlePrimaryAction(selectedItem)}
                    disabled={isCreating}
                    className="portal-button-secondary inline-flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold disabled:opacity-60"
                  >
                    <Wand2 className="h-4 w-4" />
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrimaryAction(selectedItem)}
                    disabled={isCreating}
                    className="portal-button-secondary inline-flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold disabled:opacity-60"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Schedule
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center text-center text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Select an item from the plan to review it.
            </div>
          )}
        </aside>
      </section>

      <section className="portal-command-bar">
        <div className="portal-command-bar-group">
          <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--portal-success)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
            Publish remains manual.
          </span>
          <span className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>
            Radar and planner items become editable drafts before anything goes live.
          </span>
        </div>
        <div className="portal-command-bar-group text-sm" style={{ color: 'var(--portal-text-muted)' }}>
          <Clock3 className="h-4 w-4" />
          Next {calendar?.policy?.planningHorizonDays || 14} days
          <Megaphone className="h-4 w-4" />
          {radarItems.filter((item) => item.adWorthiness && item.adWorthiness !== 'organic_only').length} boost candidates
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </section>
    </div>
  )
}
