import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Image,
  Loader2,
  Megaphone,
  PencilLine,
  Plus,
  RefreshCw,
  Wand2,
} from 'lucide-react'
import {
  fetchCalendarPosts,
  fetchOpportunityRadar,
  fetchProfile,
  fetchSocialDrafts,
  recordPlannerFeedbackEvent,
  updateOpportunityState,
  updateOpportunitySuggestionState,
  upsertSocialDraft,
} from '../lib/portalApi'
import { stringifyDraftMeta } from '../lib/socialDrafting'

const HIDDEN_RADAR_STATES = new Set(['dismissed', 'archived', 'converted_to_draft'])
const BADGE_STYLES = {
  radar: { label: 'AI idea', background: 'rgba(53,104,166,0.1)', color: '#3568a6', border: 'rgba(53,104,166,0.18)' },
  open: { label: 'Open', background: 'rgba(201,168,76,0.12)', color: '#8c6d1c', border: 'rgba(201,168,76,0.24)' },
  draft: { label: 'Draft', background: 'rgba(93,121,104,0.12)', color: '#4d6c5b', border: 'rgba(93,121,104,0.2)' },
  scheduled: { label: 'Scheduled', background: 'rgba(31,169,113,0.1)', color: '#17875b', border: 'rgba(31,169,113,0.2)' },
  published: { label: 'Posted', background: 'rgba(31,169,113,0.12)', color: '#17875b', border: 'rgba(31,169,113,0.22)' },
  pending: { label: 'Pending', background: 'rgba(201,168,76,0.12)', color: '#8c6d1c', border: 'rgba(201,168,76,0.24)' },
  ad: { label: 'Ad idea', background: 'rgba(216,95,152,0.1)', color: '#b5487b', border: 'rgba(216,95,152,0.2)' },
}
const STATUS_MARKERS = {
  radar: { label: 'AI idea', color: '#3568a6' },
  draft: { label: 'Draft', color: '#c87628' },
  scheduled: { label: 'Scheduled', color: '#1fa971' },
  published: { label: 'Posted', color: '#c9a84c' },
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

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfWeek(date) {
  const current = new Date(date)
  current.setHours(12, 0, 0, 0)
  const day = current.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(current, diff)
}

function toDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeekRangeLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6)
  const startLabel = formatDate(weekStart, { month: 'short', day: 'numeric' })
  const endLabel = formatDate(weekEnd, { month: 'short', day: 'numeric' })
  return `${startLabel} - ${endLabel}`
}

function getMonthLabel(date) {
  return formatDate(date, { month: 'long', year: 'numeric' })
}

function startOfMonth(date) {
  const current = new Date(date)
  current.setDate(1)
  current.setHours(12, 0, 0, 0)
  return current
}

function getMonthGridDays(date) {
  const monthStart = startOfMonth(date)
  const gridStart = startOfWeek(monthStart)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function isDateInWeek(value, weekStart) {
  if (!value) return false
  const date = value instanceof Date
    ? value
    : new Date(String(value).includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return false
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  const end = addDays(start, 7)
  return date >= start && date < end
}

function getPostDisplayDate(post) {
  return post?.scheduled_for || post?.published_at || post?.created_at
}

function getWeekOffsetFromDate(value) {
  const target = value instanceof Date
    ? value
    : new Date(String(value).includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(target.getTime())) return 0

  const currentWeekStart = startOfWeek(new Date())
  const targetWeekStart = startOfWeek(target)
  const diff = targetWeekStart.getTime() - currentWeekStart.getTime()
  return Math.max(0, Math.min(8, Math.round(diff / (7 * 24 * 60 * 60 * 1000))))
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
  const style = BADGE_STYLES[type] || BADGE_STYLES.open
  return (
    <span
      className="content-plan-badge inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
      style={{ background: style.background, color: style.color, borderColor: style.border }}
    >
      {style.label}
    </span>
  )
}

function StatusMarker({ type }) {
  const marker = STATUS_MARKERS[type] || STATUS_MARKERS.radar
  return (
    <span
      className="content-plan-status-marker"
      style={{ color: marker.color, borderColor: `${marker.color}40`, background: `${marker.color}14` }}
      title={marker.label}
      aria-label={marker.label}
    >
      {marker.label}
    </span>
  )
}

function PlanRow({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="content-plan-row grid w-full grid-cols-[82px_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 text-left transition-all last:border-b-0 hover:bg-[rgba(245,235,214,0.42)]"
      data-status={item.badgeType}
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
          {item.statusType ? <Badge type={item.statusType} /> : null}
          {item.adWorthiness && item.adWorthiness !== 'organic_only' ? <Badge type="ad" /> : null}
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-3">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-[10px] object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
              {item.title}
            </p>
            <p className="mt-1 line-clamp-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
              {item.subtitle}
            </p>
          </div>
        </div>
      </div>
      <StatusMarker type={item.badgeType} />
    </button>
  )
}

function ProofChip({ children, onClick, title }) {
  const Component = onClick ? 'button' : 'span'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className="content-plan-proof-chip rounded-full border px-3 py-1 text-xs"
      data-clickable={Boolean(onClick)}
      style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)', background: 'rgba(255,255,255,0.72)' }}
    >
      {children}
    </Component>
  )
}

export default function ContentCalendar() {
  const { requireWriteAccess } = useOutletContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [actionError, setActionError] = useState('')
  const [weekOffset, setWeekOffset] = useState(() => {
    const date = initialParams.get('date')
    return date ? getWeekOffsetFromDate(date) : 0
  })
  const [queueMode, setQueueMode] = useState(() => initialParams.get('view') === 'month' ? 'month' : 'week')
  const [composerCaptions, setComposerCaptions] = useState({})
  const selectedWeekStart = useMemo(() => startOfWeek(addDays(new Date(), weekOffset * 7)), [weekOffset])
  const selectedWeekStartString = toDateString(selectedWeekStart)
  const selectedWeekLabel = weekOffset === 0 ? 'This week' : getWeekRangeLabel(selectedWeekStart)
  const monthGridDate = startOfMonth(selectedWeekStart)

  useEffect(() => {
    if (initialParams.get('view') || initialParams.get('date') || initialParams.get('scheduled')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [initialParams])

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id

  const { data: calendarPosts = [], isLoading: postsLoading, refetch: refetchPosts, isRefetching: isRefetchingPosts } = useQuery({
    queryKey: ['calendar-posts', clientId],
    queryFn: () => fetchCalendarPosts(clientId),
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

  const radarItems = useMemo(() => (
    opportunities
      .filter((opportunity) => !HIDDEN_RADAR_STATES.has(opportunity.review_state))
      .filter((opportunity) => getActiveSuggestions(opportunity).length > 0)
      .filter((opportunity) => (
        weekOffset === 0 ||
        isDateInWeek(opportunity.expires_at, selectedWeekStart) ||
        isDateInWeek(opportunity.starts_at, selectedWeekStart) ||
        isDateInWeek(opportunity.ends_at, selectedWeekStart) ||
        getActiveSuggestions(opportunity).some((suggestion) => isDateInWeek(suggestion.recommended_publish_at, selectedWeekStart))
      ))
      .sort((a, b) => {
        const scoreDelta = getRadarPriority(b) - getRadarPriority(a)
        if (Math.abs(scoreDelta) > 0.01) return scoreDelta
        return new Date(b.created_at) - new Date(a.created_at)
      })
      .slice(0, 5)
      .map((opportunity, index) => {
        const suggestion = getPrimarySuggestion(opportunity)
        const action = buildRadarAction(opportunity, suggestion)
        const suggestedDate = suggestion?.recommended_publish_at ||
          opportunity.starts_at ||
          opportunity.ends_at ||
          opportunity.expires_at ||
          selectedWeekStartString
        const dateString = toDateString(new Date(String(suggestedDate).includes('T') ? suggestedDate : `${suggestedDate}T12:00:00`))
        return {
          id: `radar:${opportunity.id}`,
          source: 'radar',
          badgeType: 'radar',
          dateString,
          dayLabel: isDateInWeek(dateString, selectedWeekStart) ? formatSlotDate(dateString) : (index === 0 ? 'Today' : 'This week'),
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
  ), [opportunities, selectedWeekStart, selectedWeekStartString, weekOffset])

  const draftItems = useMemo(() => (
    drafts
      .filter((draft) => draft.review_state !== 'published')
      .filter((draft) => isDateInWeek(draft.slot_date_local, selectedWeekStart))
      .map((draft) => ({
        id: `draft:${draft.id}`,
        source: 'draft',
        badgeType: 'draft',
        dateString: draft.slot_date_local,
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
  ), [drafts, selectedWeekStart])

  const postItems = useMemo(() => (
    calendarPosts
      .filter((post) => isDateInWeek(getPostDisplayDate(post), selectedWeekStart))
      .map((post) => ({
        id: `post:${post.id}`,
        source: 'post',
        badgeType: post.status === 'published' ? 'published' : 'scheduled',
        dateString: toDateString(new Date(getPostDisplayDate(post))),
        dayLabel: formatDate(getPostDisplayDate(post), { weekday: 'short', month: 'short', day: 'numeric' }),
        timeLabel: formatDate(getPostDisplayDate(post), { hour: 'numeric', minute: '2-digit' }),
        title: post.content?.slice(0, 72) || (post.status === 'published' ? 'Posted content' : 'Scheduled post'),
        subtitle: post.status === 'published' ? 'Already posted' : 'Scheduled and waiting for publish time',
        detailTitle: post.status === 'published' ? 'Posted content' : 'Scheduled post',
        caption: post.content || 'This post is already on the calendar.',
        whyNow: post.status === 'published'
          ? 'This content has already gone out and stays visible here for context.'
          : 'This item is already planned and helps avoid overfilling the calendar.',
        imagePrompt: post.media_url ? 'Media is attached to this post.' : 'No media is attached yet.',
        proof: [post.status === 'published' ? 'Posted content' : 'Scheduled content'],
        thumbnailUrl: post.media_url || '',
        post,
      }))
  ), [calendarPosts, selectedWeekStart])

  const studioCounts = useMemo(() => ({
    ideas: opportunities
      .filter((opportunity) => !HIDDEN_RADAR_STATES.has(opportunity.review_state))
      .filter((opportunity) => getActiveSuggestions(opportunity).length > 0)
      .length,
    drafts: drafts.filter((draft) => draft.review_state !== 'published').length,
    scheduled: calendarPosts.filter((post) => post.status === 'scheduled').length,
    posted: calendarPosts.filter((post) => post.status === 'published').length,
  }), [calendarPosts, drafts, opportunities])

  const allDetailItems = useMemo(() => {
    const radarDetailItems = opportunities
      .filter((opportunity) => !HIDDEN_RADAR_STATES.has(opportunity.review_state))
      .filter((opportunity) => getActiveSuggestions(opportunity).length > 0)
      .map((opportunity, index) => {
        const suggestion = getPrimarySuggestion(opportunity)
        const action = buildRadarAction(opportunity, suggestion)
        const suggestedDate = suggestion?.recommended_publish_at ||
          opportunity.starts_at ||
          opportunity.ends_at ||
          opportunity.expires_at ||
          selectedWeekStartString
        const dateString = toDateString(new Date(String(suggestedDate).includes('T') ? suggestedDate : `${suggestedDate}T12:00:00`))
        return {
          id: `radar:${opportunity.id}`,
          source: 'radar',
          badgeType: 'radar',
          dateString,
          dayLabel: isDateInWeek(dateString, selectedWeekStart) ? formatSlotDate(dateString) : (index === 0 ? 'Today' : 'This week'),
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

    const draftDetailItems = drafts
      .filter((draft) => draft.review_state !== 'published')
      .map((draft) => ({
        id: `draft:${draft.id}`,
        source: 'draft',
        badgeType: 'draft',
        dateString: draft.slot_date_local,
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

    const postDetailItems = calendarPosts
      .map((post) => ({
        id: `post:${post.id}`,
        source: 'post',
        badgeType: post.status === 'published' ? 'published' : 'scheduled',
        dateString: toDateString(new Date(getPostDisplayDate(post))),
        dayLabel: formatDate(getPostDisplayDate(post), { weekday: 'short', month: 'short', day: 'numeric' }),
        timeLabel: formatDate(getPostDisplayDate(post), { hour: 'numeric', minute: '2-digit' }),
        title: post.content?.slice(0, 72) || (post.status === 'published' ? 'Posted content' : 'Scheduled post'),
        subtitle: post.status === 'published' ? 'Already posted' : 'Scheduled and waiting for publish time',
        detailTitle: post.status === 'published' ? 'Posted content' : 'Scheduled post',
        caption: post.content || 'This post is already on the calendar.',
        whyNow: post.status === 'published'
          ? 'This content has already gone out and stays visible here for context.'
          : 'This item is already planned and helps avoid overfilling the calendar.',
        imagePrompt: post.media_url ? 'Media is attached to this post.' : 'No media is attached yet.',
        proof: [post.status === 'published' ? 'Posted content' : 'Scheduled content'],
        thumbnailUrl: post.media_url || '',
        post,
      }))

    return [...radarDetailItems, ...draftDetailItems, ...postDetailItems]
  }, [calendarPosts, drafts, opportunities, selectedWeekStart, selectedWeekStartString])

  const planItems = useMemo(() => {
    const merged = [...radarItems, ...draftItems, ...postItems]
    return merged
      .sort((a, b) => new Date(`${a.dateString}T12:00:00`) - new Date(`${b.dateString}T12:00:00`))
      .slice(0, 12)
  }, [draftItems, postItems, radarItems])

  const visiblePlanItems = useMemo(() => {
    if (queueMode === 'week') return planItems
    if (queueMode === 'month') return []
    return planItems
  }, [planItems, queueMode])

  const selectedItem = allDetailItems.find((item) => item.id === selectedItemId) || (queueMode === 'month' ? null : visiblePlanItems[0]) || null
  const composerCaption = selectedItem ? (composerCaptions[selectedItem.id] ?? selectedItem.caption ?? '') : ''
  const monthDays = useMemo(() => getMonthGridDays(monthGridDate), [monthGridDate])

  const monthItemsByDate = useMemo(() => {
    const groups = new Map()
    const addItem = (dateString, item) => {
      if (!dateString) return
      if (!groups.has(dateString)) groups.set(dateString, [])
      groups.get(dateString).push(item)
    }
    calendarPosts.forEach((post) => {
      addItem(toDateString(new Date(getPostDisplayDate(post))), {
        type: post.status === 'published' ? 'Posted' : 'Scheduled',
        status: post.status === 'published' ? 'published' : 'scheduled',
        targetItemId: `post:${post.id}`,
        title: post.content || (post.status === 'published' ? 'Posted content' : 'Scheduled post'),
      })
    })
    drafts
      .filter((draft) => draft.review_state !== 'published')
      .forEach((draft) => {
        addItem(draft.slot_date_local, {
          type: 'Draft',
          status: 'draft',
          targetItemId: `draft:${draft.id}`,
          title: draft.draft_title || draft.draft_caption || 'Saved draft',
        })
      })
    opportunities
      .filter((opportunity) => !HIDDEN_RADAR_STATES.has(opportunity.review_state))
      .forEach((opportunity) => {
        getActiveSuggestions(opportunity).forEach((suggestion) => {
          const suggestedDate = suggestion.recommended_publish_at || opportunity.starts_at || opportunity.expires_at
          if (!suggestedDate) return
          addItem(toDateString(new Date(String(suggestedDate).includes('T') ? suggestedDate : `${suggestedDate}T12:00:00`)), {
            type: 'Idea',
            status: 'radar',
            targetItemId: `radar:${opportunity.id}`,
            title: suggestion.title || opportunity.title,
          })
        })
      })
    return groups
  }, [calendarPosts, drafts, opportunities])

  const monthOpenCount = useMemo(() => {
    const monthStart = startOfMonth(monthGridDate)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    return monthDays.filter((day) => {
      const dateString = toDateString(day)
      return day >= monthStart && day < monthEnd && !monthItemsByDate.has(dateString)
    })
      .length
  }, [monthDays, monthGridDate, monthItemsByDate])

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

  function handlePrimaryAction(item) {
    setActionError('')
    if (!item) return
    if (item.source === 'radar') {
      createRadarDraft.mutate(item)
      return
    }
    if (item.draft?.id) {
      navigate(`/post?draftId=${item.draft.id}`)
      return
    }
    if (item.post?.id) {
      navigate(`/post?editPost=${item.post.id}`)
      return
    }
    navigate('/post')
  }

  function handleAddPost(dateString = selectedWeekStartString) {
    const params = new URLSearchParams({
      date: dateString,
      returnTo: 'studio',
      returnView: queueMode === 'month' ? 'month' : 'week',
    })
    navigate(`/post?${params.toString()}`)
  }

  function handleMonthItemClick(dateString, item) {
    if (!item?.targetItemId) {
      handleAddPost(dateString)
      return
    }
    setSelectedItemId(item.targetItemId)
    setWeekOffset(getWeekOffsetFromDate(dateString))
  }

  const isLoading = profileLoading || postsLoading || draftsLoading || radarLoading
  const isRefreshing = isRefetchingPosts || isRefetchingDrafts || isRefetchingRadar
  const isCreating = createRadarDraft.isPending

  if (isLoading) {
    return (
      <div className="portal-page flex min-h-[60vh] items-center justify-center">
        <div className="portal-surface p-6">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--portal-primary)]" />
        </div>
      </div>
    )
  }

  return (
    <div className="portal-page content-plan-page mx-auto max-w-[1500px] space-y-3 md:p-4 xl:p-5">
      <section className="content-plan-slimbar">
        <div className="content-plan-week-inline">
          <button
            type="button"
            onClick={() => setWeekOffset((value) => Math.max(0, value - 1))}
            disabled={weekOffset === 0}
            className="portal-button-secondary inline-flex h-9 w-9 items-center justify-center disabled:opacity-40"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="content-plan-title font-display">{selectedWeekLabel}</h1>
            <p className="content-plan-subtitle text-sm leading-relaxed">
              {getWeekRangeLabel(selectedWeekStart)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWeekOffset((value) => Math.min(8, value + 1))}
            className="portal-button-secondary inline-flex h-9 w-9 items-center justify-center"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="content-plan-actions flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setQueueMode('month')}
            className="portal-button-secondary inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold"
          >
            <CalendarDays className="h-4 w-4" />
            Month view
          </button>
          <button
            type="button"
            onClick={() => handleAddPost()}
            className="portal-button-primary inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            New post
          </button>
          <button
            type="button"
            onClick={() => {
              refetchPosts()
              refetchDrafts()
              refetchRadar()
            }}
            disabled={isRefreshing}
            className="portal-button-secondary inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      <section className="content-plan-workspace">
        <div className="content-plan-list">
          <div className="content-plan-list-header" style={{ borderColor: 'var(--portal-border)' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                {selectedWeekLabel}
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                Content Studio
              </h2>
            </div>
            <div className="content-plan-filterbar">
              {[
                ['week', 'Week'],
                ['month', 'Month'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQueueMode(value)}
                  className="content-plan-filter"
                  data-active={queueMode === value}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <ProofChip onClick={() => navigate('/opportunities')} title="Open Radar ideas">{studioCounts.ideas} AI ideas</ProofChip>
              <ProofChip onClick={() => setQueueMode('week')} title="Show drafts in Studio">{studioCounts.drafts} Drafts</ProofChip>
              <ProofChip onClick={() => navigate('/post/scheduled')} title="Manage scheduled posts">{studioCounts.scheduled} Scheduled</ProofChip>
              <ProofChip onClick={() => navigate('/post/history')} title="View post history">{studioCounts.posted} Posted</ProofChip>
            </div>
          </div>

          {queueMode === 'month' ? (
            <div className="content-plan-month">
              <div className="content-plan-month-head">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Month view
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {getMonthLabel(monthGridDate)}
                  </h3>
                </div>
                <ProofChip>{monthOpenCount} open days</ProofChip>
              </div>
              <div className="content-plan-month-weekdays">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="content-plan-month-grid">
                {monthDays.map((day) => {
                  const dateString = toDateString(day)
                  const dayItems = monthItemsByDate.get(dateString) || []
                  return (
                    <div
                      key={dateString}
                      className="content-plan-month-day"
                      data-muted={!isSameMonth(day, monthGridDate)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                          {day.getDate()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddPost(dateString)}
                          className="content-plan-make-post"
                        >
                          Make post
                        </button>
                      </div>
                      <div className="mt-2 space-y-1">
                        {dayItems.slice(0, 2).map((item, index) => (
                          <button
                            key={`${item.type}-${index}`}
                            type="button"
                            className="content-plan-month-pill"
                            data-status={item.status}
                            onClick={() => handleMonthItemClick(dateString, item)}
                          >
                            <span>{item.type}</span>
                            {item.title}
                          </button>
                        ))}
                        {dayItems.length > 2 ? (
                          <span className="content-plan-month-more">+{dayItems.length - 2} more</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : visiblePlanItems.length > 0 ? (
            <div>
              {visiblePlanItems.map((item) => (
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
              No items match this view yet. Add a post or refresh the research and planner queue.
            </div>
          )}
        </div>

        <aside className="content-plan-detail">
          {selectedItem ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge type={selectedItem.badgeType} />
                  <h2 className="content-plan-detail-title font-display" style={{ color: 'var(--portal-text)' }}>
                    {selectedItem.detailTitle}
                  </h2>
                </div>
                {selectedItem.adWorthiness && selectedItem.adWorthiness !== 'organic_only' ? <Badge type="ad" /> : null}
              </div>

              <div className="content-plan-detail-sections">
                <div className="content-plan-detail-section content-plan-composer">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Post copy
                  </p>
                  <textarea
                    value={composerCaption}
                    onChange={(event) => {
                      if (!selectedItem) return
                      setComposerCaptions((captions) => ({
                        ...captions,
                        [selectedItem.id]: event.target.value,
                      }))
                    }}
                    rows={7}
                    className="content-plan-caption-input"
                    placeholder="Review or adjust the caption before sending it into the publisher."
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: 'var(--portal-text-soft)' }}>
                    <span>{composerCaption.length} characters</span>
                    <span>Manual approval before anything posts</span>
                  </div>
                </div>
                <div className="content-plan-detail-section">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Why now
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    {selectedItem.whyNow}
                  </p>
                </div>
                <div className="content-plan-detail-section">
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
                <div className="content-plan-detail-section">
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

              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={() => handlePrimaryAction(selectedItem)}
                  disabled={isCreating}
                  className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                  Open full editor
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrimaryAction(selectedItem)}
                    disabled={isCreating}
                    className="portal-button-secondary inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    <Wand2 className="h-4 w-4" />
                    Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrimaryAction(selectedItem)}
                    disabled={isCreating}
                    className="portal-button-secondary inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Schedule
                  </button>
                </div>
                <p className="text-center text-xs" style={{ color: 'var(--portal-text-soft)' }}>
                  Radar proof, planner timing, image options, and final publishing now start from this workspace.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center text-center text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Select an item from the plan to review it.
            </div>
          )}
        </aside>
      </section>

      <section className="content-plan-footer">
        <div className="portal-command-bar-group">
          <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--portal-success)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
            Publish remains manual.
          </span>
          <span className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>
            Radar ideas and open calendar days become editable posts before anything goes live.
          </span>
        </div>
        <div className="portal-command-bar-group text-sm" style={{ color: 'var(--portal-text-muted)' }}>
          <Clock3 className="h-4 w-4" />
          Viewing {getWeekRangeLabel(selectedWeekStart)}
          <Megaphone className="h-4 w-4" />
          {radarItems.filter((item) => item.adWorthiness && item.adWorthiness !== 'organic_only').length} boost candidates
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </section>
    </div>
  )
}
