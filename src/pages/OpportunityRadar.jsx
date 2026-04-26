import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Filter,
  Loader2,
  MapPin,
  Megaphone,
  PencilLine,
  Search,
  Sparkles,
  ThumbsDown,
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

const HIDDEN_REVIEW_STATES = new Set(['dismissed', 'archived', 'converted_to_draft'])

const TYPE_LABELS = {
  local_event: 'Event',
  local_trend: 'Trend',
  competitor_gap: 'Competitor Signal',
  seasonal_moment: 'Seasonal',
  ad_opportunity: 'Ad Idea',
  community_topic: 'Community Topic',
  customer_prompt: 'Customer Prompt',
}

const AD_NOTES = {
  organic_only: 'Post organically first. No paid spend needed yet.',
  boost_worthy: 'Publish organically first. If it gets early engagement, boost it with a small budget.',
  dedicated_ad_candidate: 'Strong enough to turn into a small ad test after review.',
  do_not_advertise: 'Keep this organic and avoid ad spend.',
}

const SUPPORTED_PUBLISH_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok', 'google'])

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

function getAdBriefValue(suggestion, key) {
  const brief = suggestion?.ad_brief_json
  if (!brief || typeof brief !== 'object') return ''
  return brief[key] || ''
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

function getPriorityLabel(opportunity) {
  const score = getPriorityScore(opportunity)
  if (score >= 0.76) return 'High priority'
  if (score >= 0.62) return 'Worth posting'
  return 'Review'
}

function isFallbackExpiration(opportunity) {
  if (!opportunity?.expires_at || opportunity?.starts_at || opportunity?.ends_at) return false
  const createdAt = new Date(opportunity.created_at || Date.now()).getTime()
  const expiresAt = new Date(opportunity.expires_at).getTime()
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return false
  const diffDays = Math.round((expiresAt - createdAt) / (24 * 60 * 60 * 1000))
  return diffDays >= 13 && diffDays <= 15
}

function getTimingSignal(opportunity) {
  const timing = String(opportunity?.suggested_timing || '').toLowerCase()
  const urgency = Number(opportunity?.urgency_score) || 0
  const adWorthiness = opportunity?.ad_worthiness || ''

  if (/(immediate|immediately|today|right now|use now|post now|late april|this week|during the week|just after april 22)/.test(timing)) {
    return { label: 'Use now', tone: '#df4e22' }
  }
  if (/(early may|in may|next week|first week of may)/.test(timing)) {
    return { label: 'Plan for May', tone: '#1765ff' }
  }
  if (/(evergreen|repeat|reuse|repurpose|website hero|service page|paid social test|lead generation)/.test(timing)) {
    return { label: adWorthiness === 'dedicated_ad_candidate' ? 'Ad test idea' : 'Evergreen idea', tone: '#7a4fd4' }
  }
  if (urgency >= 0.78) return { label: 'Use now', tone: '#df4e22' }
  if (urgency >= 0.64) return { label: 'Use this week', tone: '#188f6a' }

  const raw = opportunity?.ends_at || opportunity?.expires_at
  if (raw && !isFallbackExpiration(opportunity)) {
    const diff = Math.ceil((new Date(raw).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    if (Number.isFinite(diff)) {
      if (diff <= 0) return { label: 'Use today', tone: '#df4e22' }
      if (diff <= 2) return { label: 'Use now', tone: '#df4e22' }
      if (diff <= 7) return { label: 'Use this week', tone: '#188f6a' }
      if (diff <= 21) return { label: 'Plan ahead', tone: '#1765ff' }
    }
  }

  return { label: adWorthiness === 'dedicated_ad_candidate' ? 'Ad test idea' : 'Keep in queue', tone: '#6b7280' }
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
  const publishablePlatforms = platforms
    .map((platform) => String(platform || '').trim().toLowerCase())
    .filter((platform) => SUPPORTED_PUBLISH_PLATFORMS.has(platform))
  return publishablePlatforms.length ? publishablePlatforms : ['facebook', 'instagram']
}

function getSourceQuality(opportunity) {
  const evidence = Array.isArray(opportunity?.evidence_json) ? opportunity.evidence_json : []
  const urls = [
    ...(Array.isArray(opportunity?.source_urls) ? opportunity.source_urls : []),
    ...evidence.map((item) => item?.url),
  ].filter(Boolean).map((url) => String(url).toLowerCase())
  const text = [
    opportunity?.opportunity_type,
    opportunity?.title,
    opportunity?.summary,
    opportunity?.local_context,
    opportunity?.why_it_matters,
    ...evidence.map((item) => `${item?.title || ''} ${item?.short_reason || ''}`),
  ].join(' ').toLowerCase()

  if (!urls.length) return { label: 'Needs proof', tone: '#9b5c00' }
  if (/(event|calendar|festival|registration|deadline|week|month|april|may|june)/.test(text)) {
    if (urls.some((url) => /(eventbrite|chamber|county|city|town|school|edu|gov|calendar|business|facebook)/.test(url))) {
      return { label: 'Date-backed', tone: '#188f6a' }
    }
  }
  if (opportunity?.opportunity_type === 'competitor_gap') return { label: 'Competitor signal', tone: '#7a4fd4' }
  if (urls.some((url) => /(linkedin|reddit|facebook|instagram|tiktok)/.test(url))) return { label: 'Social signal', tone: '#1765ff' }
  return { label: 'Web-backed', tone: '#1765ff' }
}

function getAdDecision(opportunity) {
  if (opportunity?.ad_worthiness === 'dedicated_ad_candidate') {
    return { label: 'Build an ad', detail: AD_NOTES.dedicated_ad_candidate, tone: '#7a4fd4' }
  }
  if (opportunity?.ad_worthiness === 'boost_worthy') {
    return { label: 'Boost if it works', detail: AD_NOTES.boost_worthy, tone: '#df4e22' }
  }
  if (opportunity?.ad_worthiness === 'do_not_advertise') {
    return { label: 'Do not advertise', detail: AD_NOTES.do_not_advertise, tone: '#6b7280' }
  }
  return { label: 'Organic first', detail: AD_NOTES.organic_only, tone: '#188f6a' }
}

function EmptyState({ filtered = false, onClearFilter }) {
  return (
    <section className="rounded-lg border bg-white px-6 py-14 text-center" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg" style={{ background: 'rgba(201, 168, 76, 0.14)' }}>
        <Search className="h-6 w-6" style={{ color: 'var(--portal-primary)' }} />
      </div>
      <h2 className="mt-4 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
        {filtered ? 'No ideas match this filter.' : 'No opportunities are ready yet.'}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
        {filtered
          ? 'Try All to see the current Radar queue, or wait for the next research run to add more ideas in this category.'
          : 'Once MAP runs the first research brief, this page will show post-ready ideas with source proof and a quick path into Publisher.'}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onClearFilter}
          className="mt-5 rounded-lg px-4 py-3 text-sm font-semibold"
          style={{ background: 'var(--portal-dark)', color: '#fff' }}
        >
          Show all ideas
        </button>
      ) : null}
    </section>
  )
}

function SourceLink({ url, index }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold capitalize transition hover:-translate-y-0.5"
      style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}
    >
      {getSourceLabel(url, index)}
      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
    </a>
  )
}

function InsightQueue({ opportunities, selectedOpportunity, onSelect }) {
  return (
    <aside className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase" style={{ color: 'var(--portal-text)' }}>Choose a post idea</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
          Start with the top item, or save one for later.
        </p>
      </div>

      <div>
        {opportunities.map((opportunity) => {
          const isActive = opportunity.id === selectedOpportunity?.id
          const timingSignal = getTimingSignal(opportunity)
          const sourceQuality = getSourceQuality(opportunity)
          return (
            <button
              key={opportunity.id}
              type="button"
              onClick={() => onSelect(opportunity.id)}
              className="w-full border-b px-4 py-4 text-left transition last:border-b-0"
              style={{
                borderColor: 'var(--portal-border)',
                background: isActive ? 'linear-gradient(90deg, rgba(47,111,234,0.10), #ffffff)' : '#ffffff',
                boxShadow: isActive ? 'inset 2px 0 0 #2f6fea' : 'inset 2px 0 0 transparent',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug" style={{ color: 'var(--portal-text)' }}>
                    {opportunity.title}
                  </span>
                  <span className="mt-1 block text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                    {TYPE_LABELS[opportunity.opportunity_type] || 'Opportunity'}
                  </span>
                </span>
                <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: 'rgba(47,111,234,0.10)', color: '#1765ff' }}>
                  {getPriorityLabel(opportunity)}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                {opportunity.summary}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: timingSignal.tone }}>
                <CalendarDays className="h-3.5 w-3.5" />
                {timingSignal.label}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: sourceQuality.tone }}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {sourceQuality.label}
              </p>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function ActionWorkspace({
  opportunity,
  suggestion,
  selectedSuggestionId,
  onSelectSuggestion,
  onUseSuggestion,
  onSaveOpportunity,
  onDismissOpportunity,
  busyAction,
}) {
  if (!opportunity) return <EmptyState />

  const suggestions = getActiveSuggestions(opportunity)
  const actionPlan = buildActionPlan(opportunity, suggestion)
  const isSuggestionBusy = suggestion && busyAction === suggestion.id
  const isOpportunityBusy = busyAction === opportunity.id
  const isConverted = suggestion?.review_state === 'converted_to_draft' || suggestion?.converted_draft_id

  return (
    <section className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="border-b p-6" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase" style={{ color: '#1765ff' }}>
          <Sparkles className="h-4 w-4" />
          Post this now
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>
          {opportunity.title}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
          {opportunity.summary}
        </p>
      </div>

      <div className="grid gap-3 p-6">
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(47,111,234,0.05)' }}>
          <p className="text-[11px] font-bold uppercase" style={{ color: '#1765ff' }}>Caption starter</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>{actionPlan.captionStarter}</p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(24,143,106,0.05)' }}>
          <p className="text-[11px] font-bold uppercase" style={{ color: '#188f6a' }}>Call to action</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>{actionPlan.callToAction}</p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--portal-border)', background: 'rgba(227,101,34,0.05)' }}>
          <p className="text-[11px] font-bold uppercase" style={{ color: '#e36522' }}>Visual idea</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>{actionPlan.visualPrompt}</p>
        </div>
      </div>

      <div className="border-t px-6 py-4" style={{ borderColor: 'var(--portal-border)' }}>
        {suggestions.length > 1 ? (
          <div className="mb-4 flex flex-wrap gap-2">
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

        <div className="grid grid-cols-[minmax(180px,1fr)_minmax(120px,0.55fr)_minmax(105px,0.45fr)] gap-2">
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
            {isOpportunityBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
            {opportunity.review_state === 'saved' ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => onDismissOpportunity(opportunity)}
            disabled={isOpportunityBusy}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ color: 'var(--portal-text-muted)' }}
          >
            <ThumbsDown className="h-4 w-4" />
            Dismiss
          </button>
        </div>
      </div>
    </section>
  )
}

function ProofRail({ opportunity, suggestion, onDismissSuggestion, busyAction }) {
  if (!opportunity) return null

  const platforms = getSuggestedPlatforms(suggestion)
  const sources = (opportunity.source_urls || []).filter(Boolean).slice(0, 4)
  const timingSignal = getTimingSignal(opportunity)
  const sourceQuality = getSourceQuality(opportunity)
  const adDecision = getAdDecision(opportunity)
  const why = [
    opportunity.why_it_matters,
    opportunity.local_context,
    opportunity.suggested_timing,
  ].filter(Boolean).slice(0, 3)
  const isSuggestionBusy = suggestion && busyAction === suggestion.id

  return (
    <aside className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: 'var(--portal-border)' }}>
      <div className="border-b p-5" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase" style={{ color: 'var(--portal-text)' }}>Why it matters</p>
        <div className="mt-4 grid gap-3">
          {why.map((item) => (
            <div key={item} className="flex gap-3 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: '#2f6fea' }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b p-5" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase" style={{ color: 'var(--portal-text)' }}>Suggested timing</p>
        <p className="mt-2 text-sm font-semibold" style={{ color: '#188f6a' }}>
          {formatDate(suggestion?.recommended_publish_at || opportunity.starts_at, timingSignal.label)}
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
          {opportunity.suggested_timing || 'Use when it fits your next available content slot.'}
        </p>
      </div>

      <div className="border-b p-5" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase" style={{ color: 'var(--portal-text)' }}>Ad decision</p>
        <p className="mt-2 text-sm font-semibold" style={{ color: adDecision.tone }}>
          {adDecision.label}
        </p>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>
          {adDecision.detail}
        </p>
      </div>

      <div className="border-b p-5" style={{ borderColor: 'var(--portal-border)' }}>
        <p className="text-xs font-bold uppercase" style={{ color: 'var(--portal-text)' }}>Platforms</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {platforms.map((platform) => (
            <span key={platform} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold capitalize" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
              {platform}
            </span>
          ))}
        </div>
      </div>

      <div className="p-5">
        <p className="text-xs font-bold uppercase" style={{ color: 'var(--portal-text)' }}>Proof</p>
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: sourceQuality.tone }}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          {sourceQuality.label}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.length ? sources.map((url, index) => <SourceLink key={url} url={url} index={index} />) : (
            <span className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>No public source link attached.</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => suggestion && onDismissSuggestion(suggestion)}
          disabled={!suggestion || isSuggestionBusy}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-60"
          style={{ color: 'var(--portal-text-muted)' }}
        >
          <EyeOff className="h-4 w-4" />
          Hide this suggestion
        </button>
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

  const activeOpportunities = useMemo(() => (
    opportunities
      .filter((opportunity) => !HIDDEN_REVIEW_STATES.has(opportunity.review_state))
      .filter((opportunity) => !getActiveSuggestions(opportunity).some((suggestion) => (
        suggestion.review_state === 'converted_to_draft' || suggestion.converted_draft_id
      )))
      .sort((a, b) => {
        const scoreDelta = getPriorityScore(b) - getPriorityScore(a)
        if (Math.abs(scoreDelta) > 0.01) return scoreDelta
        return new Date(b.created_at) - new Date(a.created_at)
      })
  ), [opportunities])

  const sortedOpportunities = useMemo(() => {
    if (activeFilter === 'all') return activeOpportunities
    if (activeFilter === 'saved') return activeOpportunities.filter((opportunity) => opportunity.review_state === 'saved')
    if (activeFilter === 'ad_opportunity') {
      return activeOpportunities.filter((opportunity) => opportunity.opportunity_type === 'ad_opportunity' || ['boost_worthy', 'dedicated_ad_candidate'].includes(opportunity.ad_worthiness))
    }
    return activeOpportunities.filter((opportunity) => opportunity.opportunity_type === activeFilter)
  }, [activeFilter, activeOpportunities])

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
            Pick one idea, review the ready-made post pieces, then send it to Publisher.
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border bg-white px-4 py-3 text-sm font-semibold" style={{ borderColor: 'var(--portal-border)', color: 'var(--portal-text)' }}>
            <MapPin className="h-4 w-4" />
            {client.business_name ? 'Customer workspace' : 'Service area'}
          </span>
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
      ) : activeOpportunities.length ? (
        <>
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
              <Filter className="h-4 w-4" />
              Customer-approved, never auto-posted
            </div>
          </div>

          {sortedOpportunities.length ? (
            <div className="grid grid-cols-[minmax(210px,0.85fr)_minmax(360px,1.65fr)_minmax(220px,0.9fr)] gap-4">
              <InsightQueue
                opportunities={sortedOpportunities}
                selectedOpportunity={selectedOpportunity}
                onSelect={handleSelectOpportunity}
              />

              <ActionWorkspace
                opportunity={selectedOpportunity}
                suggestion={selectedSuggestion}
                selectedSuggestionId={activeSuggestionId}
                onSelectSuggestion={setSelectedSuggestionId}
                onUseSuggestion={handleUseSuggestion}
                onSaveOpportunity={handleSaveOpportunity}
                onDismissOpportunity={handleDismissOpportunity}
                busyAction={busyAction}
              />

              <ProofRail
                opportunity={selectedOpportunity}
                suggestion={selectedSuggestion}
                onDismissSuggestion={handleDismissSuggestion}
                busyAction={busyAction}
              />
            </div>
          ) : (
            <EmptyState filtered onClearFilter={() => setActiveFilter('all')} />
          )}
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}
