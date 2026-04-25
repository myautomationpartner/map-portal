import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DollarSign,
  ExternalLink,
  EyeOff,
  Filter,
  Gauge,
  Lightbulb,
  Loader2,
  MapPin,
  Megaphone,
  MoreHorizontal,
  PencilLine,
  Radar,
  Search,
  Sparkles,
  Target,
  ThumbsDown,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import {
  fetchOpportunityRadar,
  fetchProfile,
  recordPlannerFeedbackEvent,
  updateOpportunityState,
  updateOpportunitySuggestionState,
  upsertSocialDraft,
} from '../lib/portalApi'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'local_event', label: 'Events' },
  { id: 'competitor_gap', label: 'Competitors' },
  { id: 'ad_opportunity', label: 'Ads' },
  { id: 'saved', label: 'Saved' },
]

const TYPE_LABELS = {
  local_event: 'Event Opportunity',
  local_trend: 'Local Trend',
  competitor_gap: 'Competitor Signal',
  seasonal_moment: 'Seasonal Moment',
  ad_opportunity: 'Ad Opportunity',
  community_topic: 'Community Topic',
  customer_prompt: 'Audience Prompt',
}

const AD_LABELS = {
  organic_only: 'Organic',
  boost_worthy: 'Boost Worthy',
  dedicated_ad_candidate: 'Ad Ready',
  do_not_advertise: 'No Spend',
}

const ACTION_LABELS = {
  organic_only: 'Add to post now',
  boost_worthy: 'Add post, then consider a boost',
  dedicated_ad_candidate: 'Add campaign-ready post',
  do_not_advertise: 'Keep this organic',
}

const TONES = [
  { bg: '#eef4ff', icon: '#2f6fea', accent: '#2f6fea', soft: 'rgba(47, 111, 234, 0.10)' },
  { bg: '#eaf8f3', icon: '#188f6a', accent: '#188f6a', soft: 'rgba(24, 143, 106, 0.10)' },
  { bg: '#f0ecff', icon: '#7254d8', accent: '#7254d8', soft: 'rgba(114, 84, 216, 0.11)' },
  { bg: '#eaf6ee', icon: '#2b9457', accent: '#2b9457', soft: 'rgba(43, 148, 87, 0.10)' },
  { bg: '#fff2e8', icon: '#e36522', accent: '#e36522', soft: 'rgba(227, 101, 34, 0.10)' },
]

function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '65%'
  return `${Math.round(number * 100)}%`
}

function formatDate(value, fallback = '') {
  if (!value) return fallback

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return fallback
  }
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

function buildDraftRow({ profile, opportunity, suggestion }) {
  const publishDate = suggestion.recommended_publish_at ? new Date(suggestion.recommended_publish_at) : nextDefaultPublishDate()
  const dateParts = getDateParts(publishDate)
  const client = profile?.clients || {}
  const plannerProfile = getPlannerProfile(profile)
  const platforms = Array.isArray(suggestion.recommended_platforms) ? suggestion.recommended_platforms : []
  const actionPlan = buildActionPlan(opportunity, suggestion)

  return {
    client_id: profile.client_id,
    planner_client_slug: client.slug || 'opportunity-radar',
    planner_policy_version: plannerProfile?.policy_version || 'opportunity-radar-v1',
    source_workflow: 'opportunity_radar',
    slot_date_local: dateParts.slotDate,
    slot_label: `opportunity_${suggestion.id.slice(0, 8)}`,
    slot_start_local: dateParts.slotStart,
    slot_end_local: dateParts.slotEnd,
    timezone: client.timezone || 'America/New_York',
    scheduled_for: dateParts.scheduledFor,
    post_type: suggestion.suggestion_type === 'ad_brief' ? 'ad_opportunity' : opportunity.opportunity_type,
    draft_title: suggestion.title,
    draft_body: [
      `What is happening: ${opportunity.summary}`,
      `Why now: ${actionPlan.quickReason}`,
      `Suggested visual: ${actionPlan.visualPrompt}`,
    ].filter(Boolean).join('\n\n'),
    draft_caption: actionPlan.readyCaption,
    review_state: 'draft_created',
    review_notes: JSON.stringify({
      source: 'opportunity_radar',
      opportunityId: opportunity.id,
      suggestionId: suggestion.id,
      opportunityType: opportunity.opportunity_type,
      adWorthiness: opportunity.ad_worthiness,
      platforms,
      radarAction: {
        title: opportunity.title,
        summary: opportunity.summary,
        quickReason: actionPlan.quickReason,
        captionStarter: actionPlan.captionStarter,
        callToAction: actionPlan.callToAction,
        readyCaption: actionPlan.readyCaption,
        imagePrompt: actionPlan.visualPrompt,
      },
      generatedAt: new Date().toISOString(),
    }),
    asset_requirements_json: [
      {
        type: 'media_concept',
        suggestion: actionPlan.visualPrompt,
      },
      {
        type: 'media_action',
        options: ['generate_image', 'upload_photo'],
      },
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

function getActiveSuggestions(opportunity) {
  return [...(opportunity?.client_opportunity_suggestions || [])]
    .filter((suggestion) => !['archived', 'dismissed'].includes(suggestion.review_state))
    .sort((a, b) => {
      if (a.suggestion_type === 'ad_brief' && b.suggestion_type !== 'ad_brief') return -1
      if (b.suggestion_type === 'ad_brief' && a.suggestion_type !== 'ad_brief') return 1
      return new Date(a.created_at) - new Date(b.created_at)
    })
}

function getPrimarySuggestion(opportunity, selectedSuggestionId) {
  const suggestions = getActiveSuggestions(opportunity)
  return suggestions.find((suggestion) => suggestion.id === selectedSuggestionId) || suggestions[0] || null
}

function getPriorityScore(opportunity) {
  const confidence = Number(opportunity?.confidence_score) || 0
  const urgency = Number(opportunity?.urgency_score) || 0
  const adBoost = opportunity?.ad_worthiness === 'dedicated_ad_candidate' ? 0.08 : opportunity?.ad_worthiness === 'boost_worthy' ? 0.04 : 0
  return Math.min(1, (urgency * 0.55) + (confidence * 0.45) + adBoost)
}

function getImpactLabel(opportunity) {
  const score = getPriorityScore(opportunity)
  if (score >= 0.76) return 'High'
  if (score >= 0.62) return 'Medium'
  return 'Low'
}

function getPriorityLabel(opportunity) {
  const score = getPriorityScore(opportunity)
  if (score >= 0.76) return 'High'
  if (score >= 0.62) return 'Medium'
  return 'Low'
}

function getDaysLeft(opportunity) {
  const raw = opportunity?.expires_at || opportunity?.ends_at
  if (!raw) return opportunity?.suggested_timing ? 'This week' : 'Review'
  const diff = Math.ceil((new Date(raw).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (!Number.isFinite(diff)) return 'Review'
  if (diff <= 0) return 'Today'
  if (diff === 1) return '1 day left'
  return `${diff} days left`
}

function getTone(index) {
  return TONES[index % TONES.length]
}

function getAdBriefValue(suggestion, key) {
  const brief = suggestion?.ad_brief_json
  if (!brief || typeof brief !== 'object') return ''
  return brief[key] || ''
}

function getSourceLabel(url, index) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host.split('.')[0] || `Source ${index + 1}`
  } catch {
    return `Source ${index + 1}`
  }
}

function getSuggestedPlatforms(suggestion) {
  const platforms = Array.isArray(suggestion?.recommended_platforms) ? suggestion.recommended_platforms : []
  return platforms.length ? platforms : ['facebook', 'instagram']
}

function getCampaignIdeas(suggestion) {
  const starter = suggestion?.caption_starter || suggestion?.title || 'Use this angle in a short post.'
  const direction = suggestion?.creative_direction || 'Pair it with a current photo and a clear call to action.'
  return [
    starter,
    direction,
    suggestion?.title ? `${suggestion.title} - ready for review` : 'Save the angle for this week.',
  ].filter(Boolean).slice(0, 3)
}

function normalizeSentence(value, fallback = '') {
  const text = String(value || '').trim()
  if (!text) return fallback
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function buildActionPlan(opportunity, suggestion) {
  const captionStarter = normalizeSentence(
    suggestion?.caption_starter || opportunity?.summary,
    'Share why this matters right now and give people one simple next step.',
  )
  const callToAction = normalizeSentence(
    getAdBriefValue(suggestion, 'call_to_action') || getAdBriefValue(suggestion, 'cta') || suggestion?.title,
    'Invite people to message you, book, or learn more this week.',
  )
  const visualPrompt = normalizeSentence(
    suggestion?.creative_direction || opportunity?.local_context || opportunity?.why_it_matters,
    'Use a current, real image that clearly connects this post to what is happening now.',
  )
  const quickReason = normalizeSentence(
    opportunity?.why_it_matters || opportunity?.summary,
    'This is timely, specific, and worth posting while it is still current.',
  )

  return {
    captionStarter,
    callToAction,
    visualPrompt,
    quickReason,
    readyCaption: `${captionStarter} ${callToAction}`.replace(/\s+/g, ' ').trim(),
  }
}

function EmptyState() {
  return (
    <section className="rounded-lg border bg-white px-6 py-14 text-center" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg" style={{ background: 'rgba(201, 168, 76, 0.14)' }}>
        <Search className="h-6 w-6" style={{ color: 'var(--portal-primary)' }} />
      </div>
      <h2 className="mt-4 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
        No opportunities are ready yet.
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
        Once MAP runs the first research brief, this page will show a next best action, priority insights, and ad guidance.
      </p>
    </section>
  )
}

function ScoreBlocks({ count = 4, color = '#2f6fea' }) {
  return (
    <div className="mt-2 flex gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className="h-5 w-3.5 rounded-sm"
          style={{ background: index < count ? color : 'rgba(26, 24, 20, 0.09)' }}
        />
      ))}
    </div>
  )
}

function TopControl({ icon: Icon, children }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border bg-white px-4 py-3 text-sm font-semibold"
      style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}
    >
      <Icon className="h-4 w-4" />
      {children}
      <ChevronRight className="h-4 w-4 rotate-90 opacity-60" />
    </button>
  )
}

function NextBestAction({
  opportunity,
  suggestion,
  onUseSuggestion,
  onSaveOpportunity,
  onDismissOpportunity,
  busyAction,
}) {
  if (!opportunity) return null

  const isSuggestionBusy = suggestion && busyAction === suggestion.id
  const isOpportunityBusy = busyAction === opportunity.id
  const isConverted = suggestion?.review_state === 'converted_to_draft' || suggestion?.converted_draft_id
  const impact = getImpactLabel(opportunity)

  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="grid grid-cols-[clamp(3.5rem,6vw,4.5rem)_minmax(0,1fr)_minmax(180px,28%)_clamp(130px,14vw,160px)] items-center gap-5">
        <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-lg" style={{ background: 'linear-gradient(135deg, #ecf4ff, #dceafe)' }}>
          <TrendingUp className="h-12 w-12" style={{ color: '#2f6fea' }} />
        </div>

        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]" style={{ color: '#1765ff' }}>
            <Sparkles className="h-4 w-4" />
            Next best action
          </p>
          <h2 className="mt-2 max-w-2xl font-display text-[1.55rem] font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>
            {opportunity.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
            {opportunity.summary}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-0">
          <div className="border-l pl-4" style={{ borderColor: 'var(--portal-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--portal-text-muted)' }}>Impact</p>
            <p className="mt-1 text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>{impact}</p>
            <ScoreBlocks count={impact === 'High' ? 5 : impact === 'Medium' ? 3 : 2} color="#e76522" />
          </div>

          <div className="border-l pl-4" style={{ borderColor: 'var(--portal-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--portal-text-muted)' }}>Confidence</p>
            <p className="mt-1 text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>{formatPercent(opportunity.confidence_score)}</p>
            <ScoreBlocks count={Math.max(1, Math.round((Number(opportunity.confidence_score) || 0.65) * 5))} color="#2f6fea" />
          </div>

          <div className="border-l pl-4" style={{ borderColor: 'var(--portal-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--portal-text-muted)' }}>Urgency</p>
            <p className="mt-1 text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>{impact}</p>
            <p className="mt-2 flex items-center gap-1 text-sm" style={{ color: '#df4e22' }}>
              <Clock3 className="h-4 w-4" />
              {getDaysLeft(opportunity)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => suggestion && onUseSuggestion(opportunity, suggestion)}
            disabled={!suggestion || isSuggestionBusy || isConverted}
            className="portal-button-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ background: 'linear-gradient(180deg, #ef6d22, #e0561b)' }}
          >
            {isSuggestionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
            {isConverted ? 'Draft Created' : ACTION_LABELS[opportunity.ad_worthiness] || 'Add to Post Now'}
          </button>
          <button
            type="button"
            onClick={() => onSaveOpportunity(opportunity)}
            disabled={isOpportunityBusy || opportunity.review_state === 'saved'}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}
          >
            {isOpportunityBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
            {opportunity.review_state === 'saved' ? 'Saved' : 'Save for Later'}
          </button>
          <button
            type="button"
            onClick={() => onDismissOpportunity(opportunity)}
            disabled={isOpportunityBusy}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ color: 'var(--portal-text-muted)' }}
          >
            <X className="h-4 w-4" />
            Dismiss
          </button>
        </div>
      </div>
    </section>
  )
}

function InsightIcon({ tone, type }) {
  const Icon = type === 'competitor_gap' ? Megaphone
    : type === 'local_event' || type === 'seasonal_moment' ? CalendarDays
      : type === 'customer_prompt' ? Users
        : MapPin

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg" style={{ background: tone.bg }}>
      <Icon className="h-6 w-6" style={{ color: tone.icon }} />
    </span>
  )
}

function PriorityInsights({ opportunities, selectedOpportunity, onSelect, activeFilter, onFilter }) {
  return (
    <aside className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>Priority insights</p>
        <button
          type="button"
          onClick={() => onFilter(activeFilter === 'all' ? 'ad_opportunity' : 'all')}
          className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs font-semibold"
          style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}
        >
          Filter
          <Filter className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        {opportunities.map((opportunity, index) => {
          const isActive = opportunity.id === selectedOpportunity?.id
          const tone = getTone(index)
          return (
            <button
              key={opportunity.id}
              type="button"
              onClick={() => onSelect(opportunity.id)}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-4 text-left transition last:border-b-0"
              style={{
                borderColor: 'var(--portal-border)',
                background: isActive ? 'linear-gradient(90deg, rgba(47,111,234,0.10), #ffffff)' : '#ffffff',
                boxShadow: isActive ? 'inset 2px 0 0 #2f6fea' : 'inset 2px 0 0 transparent',
              }}
            >
              <InsightIcon tone={tone} type={opportunity.opportunity_type} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{opportunity.title}</span>
                <span className="mt-1 block truncate text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                  {TYPE_LABELS[opportunity.opportunity_type] || 'Opportunity'}
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: tone.soft, color: tone.accent }}>
                    {getPriorityLabel(opportunity)}
                  </span>
                  <span className="text-xs" style={{ color: '#df4e22' }}>{getDaysLeft(opportunity)}</span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 opacity-45" />
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-4 text-sm font-semibold"
        style={{ color: 'var(--portal-text-muted)' }}
      >
        <EyeOff className="h-4 w-4" />
        View dismissed
      </button>
    </aside>
  )
}

function ProofChip({ url, index }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold capitalize transition hover:-translate-y-0.5"
      style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: index % 2 ? '#eef4ff' : '#fff1ed', color: index % 2 ? '#2f6fea' : '#e36522' }}>
        {getSourceLabel(url, index).slice(0, 1)}
      </span>
      {getSourceLabel(url, index)}
      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
    </a>
  )
}

function DetailPanel({ opportunity, suggestion, selectedSuggestionId, onSelectSuggestion }) {
  if (!opportunity) return <EmptyState />

  const suggestions = getActiveSuggestions(opportunity)
  const platforms = getSuggestedPlatforms(suggestion)
  const actionPlan = buildActionPlan(opportunity, suggestion)
  const quickFacts = [
    opportunity.why_it_matters,
    opportunity.local_context,
    opportunity.suggested_timing,
  ].filter(Boolean).slice(0, 3)

  return (
    <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="border-b p-5 md:p-6" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-[0.06em]" style={{ background: 'rgba(47, 111, 234, 0.10)', color: '#1765ff' }}>
              {TYPE_LABELS[opportunity.opportunity_type] || 'Opportunity'}
            </span>
            <h2 className="mt-4 max-w-3xl font-display text-2xl font-semibold leading-tight md:text-3xl" style={{ color: 'var(--portal-text)' }}>
              {opportunity.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Bookmark className="h-5 w-5" style={{ color: 'var(--portal-text-muted)' }} />
            <MoreHorizontal className="h-5 w-5" style={{ color: 'var(--portal-text-muted)' }} />
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-base leading-relaxed" style={{ color: 'var(--portal-text)' }}>
          {opportunity.summary}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
            <MapPin className="h-4 w-4" />
            Local area
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
            <CalendarClock className="h-4 w-4" />
            {formatDate(suggestion?.recommended_publish_at || opportunity.starts_at, 'This week')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
            <Users className="h-4 w-4" />
            Local audience
          </span>
        </div>
      </div>

      <div className="border-b p-5 md:p-6" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>What to do with this</p>
        <div className="mt-4 grid gap-3">
          {quickFacts.map((item) => (
            <div key={item} className="flex gap-3 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: '#2f6fea' }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b p-5 md:p-6" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>Ready-to-use post pieces</p>
        <div className="mt-4 grid gap-3">
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(47,111,234,0.05)' }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#1765ff' }}>Caption starter</p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>{actionPlan.captionStarter}</p>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(24,143,106,0.05)' }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#188f6a' }}>Call to action</p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>{actionPlan.callToAction}</p>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(227,101,34,0.05)' }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#e36522' }}>Visual idea</p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>{actionPlan.visualPrompt}</p>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>Sources and platforms</p>
          {suggestions.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSuggestion(item.id)}
                  className="rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                  style={{
                    borderColor: item.id === selectedSuggestionId ? '#2f6fea' : 'var(--portal-border)',
                    color: item.id === selectedSuggestionId ? '#1765ff' : 'var(--portal-text-muted)',
                    background: item.id === selectedSuggestionId ? 'rgba(47,111,234,0.08)' : '#fff',
                  }}
                >
                  {item.suggestion_type.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(opportunity.source_urls || []).filter(Boolean).slice(0, 3).map((url, index) => (
            <ProofChip key={url} url={url} index={index} />
          ))}
          {platforms.map((platform) => (
            <span key={platform} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold capitalize" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: platform === 'instagram' ? '#e25287' : platform === 'facebook' ? '#2f6fea' : '#21a36d' }} />
              {platform}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function AdReadiness({
  opportunity,
  suggestion,
  onUseSuggestion,
  onSaveOpportunity,
  onDismissSuggestion,
  busyAction,
}) {
  if (!opportunity) return null

  const score = Math.round(getPriorityScore(opportunity) * 100)
  const objective = getAdBriefValue(suggestion, 'objective')
  const budget = getAdBriefValue(suggestion, 'budget')
  const isSuggestionBusy = suggestion && busyAction === suggestion.id
  const isOpportunityBusy = busyAction === opportunity.id
  const isConverted = suggestion?.review_state === 'converted_to_draft' || suggestion?.converted_draft_id

  return (
    <aside className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="border-b p-5" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>Ad readiness</p>
        <div className="mt-4 flex items-center gap-4">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#2f9f9a ${score * 3.6}deg, #e8efed 0deg)` }}
          >
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              {score}%
            </div>
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: '#188f6a' }}>{score >= 70 ? 'Good to go' : 'Needs review'}</p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              {score >= 70 ? 'A few quick wins to improve performance.' : 'Useful insight, but keep the spend conservative.'}
            </p>
            <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#1765ff' }}>
              View checklist
              <ArrowUpRight className="h-4 w-4" />
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>Campaign angle</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>
            {suggestion?.creative_direction || opportunity.why_it_matters || 'Use this as a timely local angle and keep the call to action clear.'}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>Message ideas</p>
          <div className="mt-3 grid gap-2">
            {getCampaignIdeas(suggestion).map((idea) => (
              <div key={idea} className="flex gap-3 rounded-lg border bg-white p-3 text-sm leading-relaxed" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--portal-primary-strong)' }} />
                <span>{idea}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-y py-4" style={{ borderColor: 'var(--portal-border)' }}>
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>
              <CalendarDays className="h-4 w-4" />
              Launch by
            </p>
            <p className="mt-2 text-sm font-semibold" style={{ color: '#188f6a' }}>
              {formatDate(suggestion?.recommended_publish_at || opportunity.starts_at, 'This week')}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>Run through</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--portal-text)' }}>{formatDate(opportunity.expires_at || opportunity.ends_at, getDaysLeft(opportunity))}</p>
          </div>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>
            <DollarSign className="h-4 w-4" />
            Budget cue
          </p>
          <p className="mt-2 text-lg font-semibold" style={{ color: '#188f6a' }}>{budget || '$20-$40/day'}</p>
          <p className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>Suggested starting budget</p>
        </div>

        {objective ? (
          <div className="border-t pt-4" style={{ borderColor: 'var(--portal-border)' }}>
            <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--portal-text)' }}>Objective</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--portal-text)' }}>{objective}</p>
          </div>
        ) : null}

        <div className="grid gap-2 border-t pt-4" style={{ borderColor: 'var(--portal-border)' }}>
          <button
            type="button"
            onClick={() => suggestion && onUseSuggestion(opportunity, suggestion)}
            disabled={!suggestion || isSuggestionBusy || isConverted}
            className="portal-button-primary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ background: 'linear-gradient(180deg, #ef6d22, #e0561b)' }}
          >
            {isSuggestionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
            {isConverted ? 'Draft Created' : 'Add to Post Now'}
          </button>
          <button
            type="button"
            onClick={() => onSaveOpportunity(opportunity)}
            disabled={isOpportunityBusy || opportunity.review_state === 'saved'}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}
          >
            <Bookmark className="h-4 w-4" />
            {opportunity.review_state === 'saved' ? 'Saved' : 'Save for Later'}
          </button>
          <button
            type="button"
            onClick={() => suggestion && onDismissSuggestion(suggestion)}
            disabled={!suggestion || isSuggestionBusy}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ color: 'var(--portal-text-muted)' }}
          >
            <ThumbsDown className="h-4 w-4" />
            Dismiss idea
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function OpportunityRadar() {
  const { requireWriteAccess } = useOutletContext()
  const queryClient = useQueryClient()
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('')
  const [selectedSuggestionId, setSelectedSuggestionId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [actionError, setActionError] = useState('')

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id
  const client = profile?.clients || {}

  const { data: opportunities = [], isLoading: radarLoading, error: radarError } = useQuery({
    queryKey: ['opportunity-radar', clientId],
    queryFn: () => fetchOpportunityRadar(clientId),
    enabled: !!clientId,
  })

  const sortedOpportunities = useMemo(() => {
    const active = opportunities
      .filter((opportunity) => !['dismissed', 'archived'].includes(opportunity.review_state))
      .sort((a, b) => {
        const scoreDelta = getPriorityScore(b) - getPriorityScore(a)
        if (Math.abs(scoreDelta) > 0.01) return scoreDelta
        return new Date(b.created_at) - new Date(a.created_at)
      })

    if (activeFilter === 'all') return active
    if (activeFilter === 'saved') return active.filter((opportunity) => opportunity.review_state === 'saved')
    if (activeFilter === 'ad_opportunity') {
      return active.filter((opportunity) => opportunity.opportunity_type === 'ad_opportunity' || ['boost_worthy', 'dedicated_ad_candidate'].includes(opportunity.ad_worthiness))
    }
    return active.filter((opportunity) => opportunity.opportunity_type === activeFilter)
  }, [activeFilter, opportunities])

  const activeOpportunityId = sortedOpportunities.some((opportunity) => opportunity.id === selectedOpportunityId)
    ? selectedOpportunityId
    : sortedOpportunities[0]?.id || ''

  const selectedOpportunity = useMemo(
    () => sortedOpportunities.find((opportunity) => opportunity.id === activeOpportunityId) || null,
    [activeOpportunityId, sortedOpportunities],
  )

  const activeSuggestionId = getActiveSuggestions(selectedOpportunity).some((suggestion) => suggestion.id === selectedSuggestionId)
    ? selectedSuggestionId
    : getActiveSuggestions(selectedOpportunity)[0]?.id || ''

  const selectedSuggestion = useMemo(
    () => getPrimarySuggestion(selectedOpportunity, activeSuggestionId),
    [activeSuggestionId, selectedOpportunity],
  )

  const updateOpportunity = useMutation({
    mutationFn: ({ id, reviewState }) => updateOpportunityState(id, reviewState),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['opportunity-radar', clientId] })
    },
    onError: (error) => setActionError(error.message || 'Could not update this opportunity.'),
    onSettled: () => setBusyAction(''),
  })

  const updateSuggestion = useMutation({
    mutationFn: ({ id, changes }) => updateOpportunitySuggestionState(id, changes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['opportunity-radar', clientId] })
    },
    onError: (error) => setActionError(error.message || 'Could not update this suggestion.'),
    onSettled: () => setBusyAction(''),
  })

  const useSuggestion = useMutation({
    mutationFn: async ({ opportunity, suggestion }) => {
      if (!requireWriteAccess('turn Opportunity Radar ideas into drafts')) return null
      if (!profile?.client_id) throw new Error('Client profile is still loading.')

      const draft = await upsertSocialDraft(buildDraftRow({ profile, opportunity, suggestion }))
      await updateOpportunitySuggestionState(suggestion.id, {
        review_state: 'converted_to_draft',
        converted_draft_id: draft.id,
      })
      await updateOpportunityState(opportunity.id, 'converted_to_draft')

      try {
        await recordPlannerFeedbackEvent({
          clientId: profile.client_id,
          draftId: draft.id,
          postType: opportunity.opportunity_type,
          eventType: 'draft_generated',
          angleId: 'opportunity_radar',
          metadata: {
            source: 'opportunity_radar',
            opportunityId: opportunity.id,
            suggestionId: suggestion.id,
            adWorthiness: opportunity.ad_worthiness,
          },
        })
      } catch (error) {
        console.error('[OpportunityRadarFeedback]', error)
      }

      return draft
    },
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ['opportunity-radar', clientId] })
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      if (draft?.id) {
        window.location.assign(`/post?draftId=${draft.id}`)
      }
    },
    onError: (error) => setActionError(error.message || 'Could not create a publisher draft from this suggestion.'),
    onSettled: () => setBusyAction(''),
  })

  function handleSaveOpportunity(opportunity) {
    setActionError('')
    setBusyAction(opportunity.id)
    updateOpportunity.mutate({ id: opportunity.id, reviewState: 'saved' })
  }

  function handleDismissOpportunity(opportunity) {
    setActionError('')
    setBusyAction(opportunity.id)
    updateOpportunity.mutate({ id: opportunity.id, reviewState: 'dismissed' })
  }

  function handleDismissSuggestion(suggestion) {
    setActionError('')
    setBusyAction(suggestion.id)
    updateSuggestion.mutate({ id: suggestion.id, changes: { review_state: 'dismissed' } })
  }

  function handleUseSuggestion(opportunity, suggestion) {
    setActionError('')
    setBusyAction(suggestion.id)
    useSuggestion.mutate({ opportunity, suggestion })
  }

  function handleSelectOpportunity(opportunityId) {
    setSelectedOpportunityId(opportunityId)
    setSelectedSuggestionId('')
  }

  const isLoading = profileLoading || radarLoading

  return (
    <div className="portal-page space-y-5 overflow-hidden">
      <header className="flex items-start justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--portal-border)' }}>
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>
            Opportunity Radar
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
            Pick an insight, use the ready-made post copy, and add a visual when you get to Publisher.
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <TopControl icon={MapPin}>{client.business_name ? 'Local area' : 'Service area'}</TopControl>
          <TopControl icon={CalendarDays}>This week</TopControl>
          <Link
            to="/post"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border bg-white px-4 py-3 text-sm font-semibold"
            style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}
          >
            Publisher
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {actionError ? (
        <div className="portal-status-danger flex items-start gap-3 rounded-lg p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">{actionError}</p>
        </div>
      ) : null}

      {radarError ? (
        <div className="portal-status-info flex items-start gap-3 rounded-lg p-4">
          <Megaphone className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">
            Opportunity Radar is waiting on its Supabase tables. Once the migration is live, this page will fill from the research pipeline.
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-lg border bg-white" style={{ borderColor: 'var(--portal-border)' }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--portal-primary)' }} />
        </div>
      ) : sortedOpportunities.length ? (
        <>
          <NextBestAction
            opportunity={selectedOpportunity}
            suggestion={selectedSuggestion}
            onUseSuggestion={handleUseSuggestion}
            onSaveOpportunity={handleSaveOpportunity}
            onDismissOpportunity={handleDismissOpportunity}
            busyAction={busyAction}
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition"
                  style={activeFilter === filter.id
                    ? { background: 'var(--portal-dark)', color: '#fff' }
                    : { background: '#fff', border: '1px solid var(--portal-border)', color: 'var(--portal-text-muted)' }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="inline-flex shrink-0 items-center gap-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              <EyeOff className="h-4 w-4" />
              Customer-approved, never auto-posted
            </div>
          </div>

          <div className="grid grid-cols-[minmax(170px,0.8fr)_minmax(260px,1.6fr)_minmax(190px,0.95fr)] gap-4">
            <PriorityInsights
              opportunities={sortedOpportunities}
              selectedOpportunity={selectedOpportunity}
              onSelect={handleSelectOpportunity}
              activeFilter={activeFilter}
              onFilter={setActiveFilter}
            />

            <DetailPanel
              opportunity={selectedOpportunity}
              suggestion={selectedSuggestion}
              selectedSuggestionId={activeSuggestionId}
              onSelectSuggestion={setSelectedSuggestionId}
            />

            <AdReadiness
              opportunity={selectedOpportunity}
              suggestion={selectedSuggestion}
              onUseSuggestion={handleUseSuggestion}
              onSaveOpportunity={handleSaveOpportunity}
              onDismissSuggestion={handleDismissSuggestion}
              busyAction={busyAction}
            />
          </div>
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}
