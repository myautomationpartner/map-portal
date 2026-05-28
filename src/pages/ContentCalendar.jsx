import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SiFacebook, SiGoogle, SiInstagram, SiTiktok, SiX } from 'react-icons/si'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  Linkedin,
  Loader2,
  FileSearch,
  MapPin,
  Megaphone,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import {
  createResearchSource,
  deleteResearchSource,
  deletePost,
  deleteSocialDraft,
  fetchBoostAdAccounts,
  fetchCalendarPosts,
  fetchOpportunityRadar,
  fetchPostBoosts,
  fetchPostBoostReadiness,
  fetchProfile,
  fetchResearchProfile,
  fetchResearchSources,
  fetchSocialDrafts,
  getSecureVaultDocumentUrl,
  launchPostBoost,
  recordPlannerFeedbackEvent,
  startBoostAdsConnection,
  startOpportunityRadar,
  updateClientPartnerProfile,
  updateResearchSource,
  updateOpportunityState,
  updateOpportunitySuggestionState,
  upsertResearchProfile,
  upsertSocialDraft,
} from '../lib/portalApi'
import { derivePlannerBusinessType } from '../lib/plannerIndustryCatalog'
import {
  PARTNER_TRAINING_STEPS,
  buildPartnerBriefItems,
  resolveTrainingProgress,
  resolveTrainingStepComplete,
} from '../lib/partnerTrainingFlow'
import { recommendBoostSetup } from '../lib/boostAssistant'
import { parseDraftMeta, stringifyDraftMeta } from '../lib/socialDrafting'
import { getDraftMediaRefs } from '../lib/campaignDraftAssets'

const HIDDEN_RADAR_STATES = new Set(['dismissed', 'archived', 'converted_to_draft'])
const CLOSED_DRAFT_STATES = new Set(['published', 'published_manually', 'archived', 'superseded'])
const BADGE_STYLES = {
  radar: { label: 'Partner Idea', background: 'rgba(53,104,166,0.1)', color: '#3568a6', border: 'rgba(53,104,166,0.18)' },
  open: { label: 'Open', background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: 'rgba(56,189,248,0.24)' },
  draft: { label: 'Draft', background: 'rgba(255,122,184,0.12)', color: '#ff7ab8', border: 'rgba(255,122,184,0.22)' },
  scheduled: { label: 'Scheduled', background: 'rgba(112,228,255,0.1)', color: '#70e4ff', border: 'rgba(112,228,255,0.22)' },
  published: { label: 'Posted', background: 'rgba(112,228,255,0.12)', color: '#70e4ff', border: 'rgba(112,228,255,0.24)' },
  pending: { label: 'Pending', background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: 'rgba(56,189,248,0.24)' },
  ad: { label: 'Ad idea', background: 'rgba(216,95,152,0.1)', color: '#b5487b', border: 'rgba(216,95,152,0.2)' },
}
const STATUS_MARKERS = {
  radar: { label: 'Partner Idea', color: '#3568a6' },
  draft: { label: 'Draft', color: '#ff7ab8' },
  scheduled: { label: 'Scheduled', color: '#70e4ff' },
  published: { label: 'Posted', color: '#70e4ff' },
}
const STATUS_VIEW_CONFIG = {
  scheduled: { label: 'Scheduled', title: 'Scheduled posts', badgeType: 'scheduled', description: 'Posts waiting for their publish time.' },
  suggested: { label: 'Suggested', title: 'Partner suggestions', badgeType: 'radar', description: 'AI-recommended posts ready to review.' },
  draft: { label: 'Draft', title: 'Draft posts', badgeType: 'draft', description: 'Saved work that can be edited before approval.' },
  setup: { label: 'Needs setup', title: 'Needs setup', badgeType: 'pending', description: 'Posts with platforms or details that may need attention.' },
  approval: { label: 'Needs approval', title: 'Needs approval', badgeType: 'pending', description: 'Drafts and suggestions still waiting for a final edit.' },
}
const PLATFORM_MARKERS = {
  facebook: { label: 'Facebook', Icon: SiFacebook, color: '#1877f2' },
  instagram: { label: 'Instagram', Icon: SiInstagram, color: '#e4405f' },
  google: { label: 'Google Business', Icon: SiGoogle, color: '#34a853' },
  tiktok: { label: 'TikTok', Icon: SiTiktok, color: '#111111' },
  linkedin: { label: 'LinkedIn', Icon: Linkedin, color: '#0a66c2' },
  twitter: { label: 'X / Twitter', Icon: SiX, color: '#111111' },
}
const BOOST_GOALS = [
  { value: 'engagement', label: 'More engagement' },
  { value: 'traffic', label: 'More website visits' },
  { value: 'awareness', label: 'More local awareness' },
  { value: 'video_views', label: 'More video views' },
]
const BOOST_DURATIONS = [
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
]
const BOOSTABLE_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok', 'linkedin', 'twitter'])
const META_BOOST_PLATFORMS = new Set(['facebook', 'instagram'])
const BOOST_AUDIENCE_MODES = [
  { value: 'national', label: 'National' },
  { value: 'zip', label: 'ZIP codes' },
  { value: 'custom', label: 'Custom audience' },
]
const WEEKLY_PARTNER_IDEA_LIMIT = 5
const DAILY_PARTNER_IDEA_LIMIT = 1
const RESEARCH_SOURCE_TYPES = [
  { value: 'local_event_calendar', label: 'Event calendar' },
  { value: 'client_website', label: 'Website page' },
  { value: 'local_news', label: 'Local news' },
  { value: 'chamber', label: 'Chamber / city page' },
  { value: 'competitor_website', label: 'Competitor website' },
  { value: 'competitor_social', label: 'Competitor social' },
  { value: 'manual_reference', label: 'Reference page' },
]
const PARTNER_TRAINING_REFRESH_DAYS = 60
const GAP_FILL_PULL_FORWARD_DAYS = 10
const GAP_FILL_FLEXIBLE_OPPORTUNITY_TYPES = new Set([
  'ad_opportunity',
  'community_topic',
  'competitor_gap',
  'customer_prompt',
  'local_trend',
  'seasonal_moment',
])

function isVisibleDraft(draft = {}) {
  return !CLOSED_DRAFT_STATES.has(String(draft.review_state || '').trim().toLowerCase())
}

function normalizeSentence(value, fallback = '') {
  const text = String(value || '').trim()
  if (!text) return fallback
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function normalizeSourceUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

function listToText(value) {
  return Array.isArray(value) ? value.filter(Boolean).join('\n') : ''
}

function textToList(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24)
}

function normalizeChoice(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function humanizeValue(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function uniqueChoices(values, limit = 5) {
  const seen = new Set()
  const choices = []

  for (const value of values) {
    const label = String(value || '').trim()
    if (!label) continue
    const key = normalizeChoice(label)
    if (seen.has(key)) continue
    seen.add(key)
    choices.push(label)
    if (choices.length >= limit) break
  }

  return choices
}

function toggleTextListValue(current, value) {
  const item = String(value || '').trim()
  if (!item) return current || ''
  const list = textToList(current)
  const key = normalizeChoice(item)
  const exists = list.some((entry) => normalizeChoice(entry) === key)
  const next = exists
    ? list.filter((entry) => normalizeChoice(entry) !== key)
    : [...list, item]
  return next.join('\n')
}

function listContainsValue(current, value) {
  const key = normalizeChoice(value)
  return Boolean(key) && textToList(current).some((entry) => normalizeChoice(entry) === key)
}

function hasRequiredPartnerTraining(form) {
  return Boolean(
    normalizeChoice(form.audienceSummary) &&
    textToList(form.offerFocusText).length > 0,
  )
}

function buildLocationSummary(form) {
  return [
    form.county,
    form.stateCode,
    form.postalCode,
  ].filter(Boolean).join(', ')
}

function buildPartnerGuidedChoices({ client, form, sources }) {
  const businessName = client?.business_name || 'your business'
  const rawCategory = [
    form.businessSubtype,
    form.businessCategory,
    client?.business_type,
    client?.business_category,
  ].filter(Boolean).join(' ')
  const category = humanizeValue(form.businessSubtype || form.businessCategory || client?.business_type || '')
  const locationSummary = buildLocationSummary(form)
  const hasActiveSources = sources.some((source) => source.is_active)
  const businessText = `${businessName} ${rawCategory} ${category}`.toLowerCase()
  const isAutomation = /automation|consult|professional|service/i.test(businessText)
  const isHomeService = /home|landscap|lawn|roof|plumb|hvac|clean|contract|remodel|repair/i.test(businessText)
  const isFitness = /dance|fitness|gym|studio|class|coach|training/i.test(businessText)
  const isRestaurant = /restaurant|cafe|food|bakery|bar|coffee/i.test(businessText)

  const audienceOptions = uniqueChoices([
    form.audienceSummary,
    isAutomation ? 'Solo owners and lean small-business teams' : '',
    isAutomation ? 'Local service businesses that need faster follow-up' : '',
    isHomeService ? 'Local homeowners who need reliable service' : '',
    isHomeService ? 'Existing customers who need seasonal reminders' : '',
    isFitness ? 'Families and adults looking for classes or coaching' : '',
    isFitness ? 'Current students, members, and parents' : '',
    isRestaurant ? 'Local regulars and nearby first-time visitors' : '',
    'Current customers who already trust the business',
    'People comparing options and looking for a clear next step',
    'Referral partners and community contacts',
  ], 5)

  const offerOptions = uniqueChoices([
    ...textToList(form.offerFocusText),
    isAutomation ? 'One place for customer messages' : '',
    isAutomation ? 'Social posts and content ideas handled with MAP support' : '',
    isAutomation ? 'Customer portal tools that reduce daily admin work' : '',
    isHomeService ? 'Recent project wins and before-and-after work' : '',
    isHomeService ? 'Seasonal maintenance reminders' : '',
    isFitness ? 'Class openings, trial offers, and registration reminders' : '',
    isFitness ? 'Student, member, or customer wins' : '',
    isRestaurant ? 'Menu highlights, specials, and timely reminders' : '',
    hasActiveSources ? 'Ideas from approved research sources' : '',
    category ? `${category} services` : '',
    'A simple next step to contact or book',
    'Seasonal reminders and timely updates',
  ], 6)

  const guardrailOptions = uniqueChoices([
    ...textToList(form.blockedTopicsText),
    'Avoid unsupported guarantees',
    'Avoid sounding like a large corporate agency',
    'Avoid outdated services, stale offers, or sold-out availability',
    'Keep claims practical and easy to prove',
    'Do not overpromise response times or results',
  ], 6)

  const reachOptions = [
    {
      label: 'Local customers nearby',
      detail: locationSummary ? `Use ${locationSummary} as the local context.` : 'Use nearby customers and local community context.',
      updates: { businessReach: 'local', serviceArea: form.serviceArea || locationSummary },
      active: form.businessReach === 'local',
    },
    {
      label: 'Regional customers',
      detail: 'Write for a wider service area without sounding national.',
      updates: { businessReach: 'local', serviceArea: form.serviceArea || locationSummary || 'Regional service area' },
      active: form.businessReach === 'local' && /regional/i.test(form.serviceArea),
    },
    {
      label: 'Online or national customers',
      detail: 'Focus less on geography and more on the problem the customer needs solved.',
      updates: { businessReach: 'national_global', serviceArea: form.serviceArea || 'Online / national' },
      active: form.businessReach === 'national_global',
    },
  ]

  return {
    audienceOptions,
    offerOptions,
    guardrailOptions,
    reachOptions,
  }
}

function buildPartnerProfileForm(client, researchProfile) {
  return {
    businessCategory: client?.business_category || client?.business_type || '',
    businessSubtype: client?.business_subtype || '',
    businessReach: client?.business_reach || 'local',
    countryCode: client?.country_code || 'US',
    stateCode: client?.state_code || '',
    postalCode: client?.postal_code || '',
    county: client?.county || '',
    websiteUrl: client?.website_url || '',
    serviceArea: researchProfile?.service_area || '',
    audienceSummary: researchProfile?.audience_summary || '',
    offerFocusText: listToText(researchProfile?.offer_focus_json),
    blockedTopicsText: listToText(researchProfile?.blocked_topics_json),
    researchNotes: researchProfile?.research_notes || '',
  }
}

function getSourceHost(value) {
  try {
    return new URL(normalizeSourceUrl(value)).hostname.replace(/^www\./, '')
  } catch {
    return String(value || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

function getResearchSourceTypeLabel(value) {
  return RESEARCH_SOURCE_TYPES.find((option) => option.value === value)?.label || 'Source'
}

function formatDate(value, options = {}) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

function daysSince(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000))
}

function getPartnerTrainingStatus(researchProfile) {
  const verifiedAt = researchProfile?.partner_training_verified_at || ''
  const ageDays = daysSince(verifiedAt)
  const isVerified = Boolean(verifiedAt)
  const isStale = isVerified && ageDays !== null && ageDays >= PARTNER_TRAINING_REFRESH_DAYS

  return {
    verifiedAt,
    ageDays,
    isVerified,
    isStale,
    shouldPrompt: !isVerified || isStale,
    label: !isVerified
      ? 'Needs first review'
      : isStale
        ? 'Review recommended'
        : 'Verified',
  }
}

function formatVerifiedDate(value) {
  return formatDate(value, { month: 'short', day: 'numeric', year: 'numeric' })
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

function compareDateStrings(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function getWeekDateStrings(weekStart) {
  return Array.from({ length: 7 }, (_, index) => toDateString(addDays(weekStart, index)))
}

function parseDateAtNoon(value) {
  if (!value) return null
  const date = new Date(String(value).includes('T') ? value : `${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function canUseOpportunityOnDate(opportunity, dateString) {
  const target = parseDateAtNoon(dateString)
  if (!target) return false

  const startsAt = parseDateAtNoon(opportunity?.starts_at)
  if (startsAt && target < startsAt) return false

  const endsAt = parseDateAtNoon(opportunity?.expires_at || opportunity?.ends_at)
  if (endsAt) {
    const endOfDay = new Date(endsAt)
    endOfDay.setHours(23, 59, 59, 999)
    if (target > endOfDay) return false
  }

  return true
}

function canUseOpportunityForGapFillDate(opportunity, dateString) {
  if (canUseOpportunityOnDate(opportunity, dateString)) return true
  if (!GAP_FILL_FLEXIBLE_OPPORTUNITY_TYPES.has(String(opportunity?.opportunity_type || ''))) return false

  const target = parseDateAtNoon(dateString)
  const startsAt = parseDateAtNoon(opportunity?.starts_at)
  const endsAt = parseDateAtNoon(opportunity?.expires_at || opportunity?.ends_at)
  if (!target || !startsAt) return false
  if (endsAt && target > endsAt) return false
  if (target >= startsAt) return false

  const daysUntilStart = Math.ceil((startsAt.getTime() - target.getTime()) / (24 * 60 * 60 * 1000))
  return daysUntilStart > 0 && daysUntilStart <= GAP_FILL_PULL_FORWARD_DAYS
}

function getPostDisplayDate(post) {
  return post?.scheduled_for || post?.published_at || post?.created_at
}

function getDraftPrimaryMediaRef(draft) {
  return getDraftMediaRefs(draft).find((ref) => ref.url || ref.documentId) || null
}

function getDraftMediaRefKey(ref) {
  if (!ref) return ''
  return [
    ref.documentId || '',
    ref.url || '',
    ref.thumbnail || '',
    ref.contentType || '',
    ref.mediaType || '',
  ].join(':')
}

function normalizePostMediaCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== 'object') return null
  const url = [
    candidate.url,
    candidate.thumbnail,
    candidate.previewUrl,
    candidate.preview_url,
    candidate.mediaUrl,
    candidate.media_url,
    candidate.link,
    candidate.signed_url,
  ].find((value) => typeof value === 'string' && value.trim())

  if (!url) return null

  const mediaType = String(
    candidate.mediaType ||
    candidate.media_type ||
    candidate.kind ||
    candidate.type ||
    '',
  ).toLowerCase()
  const contentType = String(
    candidate.contentType ||
    candidate.content_type ||
    candidate.mimeType ||
    candidate.mime_type ||
    '',
  ).toLowerCase()
  const resolvedMediaType = mediaType === 'video' || contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url)
    ? 'video'
    : 'image'

  return {
    url: String(url).trim(),
    mediaType: resolvedMediaType,
    source: candidate.source || 'platform_variant',
  }
}

function getPostVariantMediaPreview(post = {}) {
  const variants = post.platform_variants_json && typeof post.platform_variants_json === 'object'
    ? post.platform_variants_json
    : {}
  const platformOrder = [
    ...(Array.isArray(post.platforms) ? post.platforms : []),
    ...Object.keys(variants),
  ]
  const seen = new Set()

  for (const platform of platformOrder) {
    const key = String(platform || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    const variant = variants[key]
    const preview = normalizePostMediaCandidate(variant?.image || variant?.media || variant)
    if (preview?.url) return preview
  }

  return null
}

function getPostMediaPreview(post = {}, linkedDraftPreview = null) {
  const variantPreview = getPostVariantMediaPreview(post)
  if (variantPreview?.url) return variantPreview
  if (linkedDraftPreview?.url) return linkedDraftPreview
  const fallback = normalizePostMediaCandidate({ url: post.media_url })
  return fallback?.url ? fallback : null
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

function getOpportunityPublishDateString(opportunity, fallbackDateString) {
  const suggestion = getPrimarySuggestion(opportunity)
  const suggestedDate = suggestion?.recommended_publish_at ||
    opportunity?.starts_at ||
    opportunity?.ends_at ||
    opportunity?.expires_at ||
    fallbackDateString
  return toDateString(new Date(String(suggestedDate).includes('T') ? suggestedDate : `${suggestedDate}T12:00:00`))
}

function sortRadarOpportunitiesByPriority(items) {
  return [...items].sort((a, b) => {
    const scoreDelta = getRadarPriority(b) - getRadarPriority(a)
    if (Math.abs(scoreDelta) > 0.01) return scoreDelta
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

function selectWeeklyPartnerIdeas(opportunities, selectedWeekStart, fallbackDateString, occupiedDateStrings = []) {
  const selected = []
  const dateCounts = new Map()
  const occupiedDates = new Set(occupiedDateStrings.filter(Boolean))
  const todayString = toDateString(new Date())
  const openWeekDates = getWeekDateStrings(selectedWeekStart)
    .filter((dateString) => compareDateStrings(dateString, todayString) >= 0)
    .filter((dateString) => !occupiedDates.has(dateString))
  const candidates = sortRadarOpportunitiesByPriority(opportunities)

  for (const opportunity of candidates) {
    const dateString = getOpportunityPublishDateString(opportunity, fallbackDateString)
    if (!isDateInWeek(dateString, selectedWeekStart)) continue
    if (compareDateStrings(dateString, todayString) < 0) continue
    if (occupiedDates.has(dateString)) continue
    if (!canUseOpportunityOnDate(opportunity, dateString)) continue
    const currentCount = dateCounts.get(dateString) || 0
    if (currentCount >= DAILY_PARTNER_IDEA_LIMIT) continue

    selected.push({ opportunity, dateString, isGapFill: false })
    dateCounts.set(dateString, currentCount + 1)
    if (selected.length >= WEEKLY_PARTNER_IDEA_LIMIT) break
  }

  const selectedOpportunityIds = new Set(selected.map((item) => item.opportunity.id))
  for (const dateString of openWeekDates) {
    if (selected.length >= WEEKLY_PARTNER_IDEA_LIMIT) break
    if ((dateCounts.get(dateString) || 0) >= DAILY_PARTNER_IDEA_LIMIT) continue
    const opportunity = candidates.find((candidate) => (
      !selectedOpportunityIds.has(candidate.id) &&
      !isDateInWeek(getOpportunityPublishDateString(candidate, fallbackDateString), selectedWeekStart) &&
      canUseOpportunityForGapFillDate(candidate, dateString)
    ))
    if (!opportunity) continue

    selected.push({ opportunity, dateString, isGapFill: true })
    selectedOpportunityIds.add(opportunity.id)
    dateCounts.set(dateString, (dateCounts.get(dateString) || 0) + 1)
  }

  return selected.sort((a, b) => {
    const dateDelta = new Date(`${a.dateString}T12:00:00`) -
      new Date(`${b.dateString}T12:00:00`)
    if (dateDelta !== 0) return dateDelta
    return getRadarPriority(b.opportunity) - getRadarPriority(a.opportunity)
  })
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

function buildRadarDraftRow({ profile, opportunity, suggestion, dateString }) {
  const publishDate = dateString
    ? new Date(`${dateString}T10:00:00`)
    : suggestion?.recommended_publish_at
      ? new Date(suggestion.recommended_publish_at)
      : nextDefaultPublishDate()
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
      selectedDate: dateString || null,
      dateSource: dateString ? 'publisher_current_week_gap_fill' : 'opportunity_radar_recommendation',
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

function PlatformMarkers({ platforms = [] }) {
  const uniquePlatforms = [...new Set(platforms)].filter((platform) => PLATFORM_MARKERS[platform])
  if (!uniquePlatforms.length) return null

  return (
    <div className="content-plan-platform-markers" aria-label={`Platforms: ${uniquePlatforms.map((platform) => PLATFORM_MARKERS[platform].label).join(', ')}`}>
      {uniquePlatforms.map((platform) => {
        const marker = PLATFORM_MARKERS[platform]
        const Icon = marker.Icon
        return (
          <span
            key={platform}
            className="content-plan-platform-marker"
            title={marker.label}
            style={{ color: marker.color, background: `${marker.color}14`, borderColor: `${marker.color}38` }}
          >
            <Icon className="h-3 w-3" />
          </span>
        )
      })}
    </div>
  )
}

function getBoostStatus(boosts = []) {
  const latest = boosts[0]
  if (!latest) return null

  const status = String(latest.status || 'active')
  const labelMap = {
    pending: 'Boost pending',
    active: 'Boost active',
    paused: 'Boost paused',
    completed: 'Boost complete',
    cancelled: 'Boost cancelled',
    rejected: 'Boost rejected',
    failed: 'Boost failed',
  }
  return {
    label: labelMap[status] || 'Boost saved',
    status,
  }
}

function splitBoostCsv(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeCountryCodesInput(value) {
  return splitBoostCsv(value)
    .map((entry) => entry.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))
    .filter((entry) => entry.length === 2)
}

function normalizeZipCodesInput(value) {
  return splitBoostCsv(value)
    .map((entry) => entry.toUpperCase().replace(/[^A-Z0-9 -]/g, '').trim())
    .filter(Boolean)
}

function normalizeCustomAudienceInput(value) {
  return splitBoostCsv(value)
    .map((entry) => entry.replace(/[^A-Za-z0-9_.:-]/g, '').trim())
    .filter(Boolean)
}

function buildBoostTargeting({ mode, countryCodes, zipCodes, customAudienceIds }) {
  const countries = normalizeCountryCodesInput(countryCodes)
  const primaryCountry = countries[0] || 'US'

  if (mode === 'custom') {
    const customAudiences = normalizeCustomAudienceInput(customAudienceIds)
    return customAudiences.length
      ? { custom_audiences: customAudiences.map((id) => ({ id })) }
      : {}
  }

  if (mode === 'zip') {
    const zips = normalizeZipCodesInput(zipCodes)
    return zips.length
      ? {
          countries: [primaryCountry],
          zips: zips.map((zip) => ({
            key: zip.includes(':') ? zip : `${primaryCountry}:${zip}`,
            name: zip.replace(/^[A-Z]{2}:/, ''),
          })),
        }
      : {}
  }

  return countries.length ? { countries } : {}
}

function hasBoostAudienceTargeting(platform, targeting) {
  if (!META_BOOST_PLATFORMS.has(platform)) return true
  if (!targeting || typeof targeting !== 'object') return false
  return ['countries', 'regions', 'cities', 'zips', 'metros', 'custom_audiences', 'customAudiences']
    .some((key) => Array.isArray(targeting[key]) && targeting[key].length > 0)
}

function BoostPostModal({ item, defaultPlatform, readiness, isReadinessLoading, onClose, onSubmit, isSaving, error, client }) {
  const availablePlatforms = [...new Set(item?.platforms || [])].filter((platform) => BOOSTABLE_PLATFORMS.has(platform))
  const boostRecommendation = useMemo(() => recommendBoostSetup({ item, defaultPlatform }), [defaultPlatform, item])
  const [platform, setPlatform] = useState(boostRecommendation.platform || defaultPlatform || availablePlatforms[0] || 'facebook')
  const [goal, setGoal] = useState(boostRecommendation.goal || 'engagement')
  const [budgetAmount, setBudgetAmount] = useState(boostRecommendation.budgetAmount || '10')
  const [budgetType, setBudgetType] = useState(boostRecommendation.budgetType || 'daily')
  const [durationDays, setDurationDays] = useState(boostRecommendation.durationDays || 5)
  const [audienceMode, setAudienceMode] = useState('national')
  const [countryCodes, setCountryCodes] = useState(client?.country_code || 'US')
  const [zipCodes, setZipCodes] = useState(client?.postal_code || '')
  const [customAudienceIds, setCustomAudienceIds] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [adAccounts, setAdAccounts] = useState([])
  const [isLoadingAdAccounts, setIsLoadingAdAccounts] = useState(false)
  const [isConnectingAds, setIsConnectingAds] = useState(false)
  const [adAccountNotice, setAdAccountNotice] = useState('')

  const readinessByPlatform = new Map((readiness?.platforms || []).map((entry) => [entry.platform, entry]))
  const selectedReadiness = readinessByPlatform.get(platform)
  const selectedIssues = selectedReadiness?.issues || []
  const savedAdAccountId = selectedReadiness?.savedAdAccountId || ''
  const savedAdAccountLabel = selectedReadiness?.savedAdAccountLabel || 'saved ad account'
  const hasLaunchAccount = Boolean(savedAdAccountId || adAccountId.trim())
  const boostTargeting = useMemo(() => buildBoostTargeting({
    mode: audienceMode,
    countryCodes,
    zipCodes,
    customAudienceIds,
  }), [audienceMode, countryCodes, customAudienceIds, zipCodes])
  const audienceReady = hasBoostAudienceTargeting(platform, boostTargeting)
  const canLaunchBoost = availablePlatforms.length > 0
    && !isReadinessLoading
    && (!selectedReadiness || selectedReadiness.canBoost)
    && hasLaunchAccount
    && audienceReady

  useEffect(() => {
    setAdAccountId('')
    setAdAccounts([])
    setAdAccountNotice('')
  }, [platform])

  if (!item?.post) return null

  async function handleLoadAdAccounts() {
    setIsLoadingAdAccounts(true)
    setAdAccountNotice('')
    try {
      const accounts = await fetchBoostAdAccounts(platform)
      setAdAccounts(accounts)
      if (accounts.length === 1) {
        setAdAccountId(accounts[0].adAccountId || accounts[0].id || '')
        setAdAccountNotice('Found one ad account and selected it for this boost.')
      } else if (accounts.length > 1) {
        setAdAccountNotice('Choose the ad account to use for this boost.')
      } else {
        setAdAccountNotice('No connected ad accounts found yet. Use Ads setup, then check again.')
      }
    } catch (loadError) {
      setAdAccountNotice(loadError.message || 'Could not load ad accounts.')
    } finally {
      setIsLoadingAdAccounts(false)
    }
  }

  async function handleConnectAds() {
    const adsPopup = typeof window !== 'undefined'
      ? window.open('', '_blank', 'width=720,height=760')
      : null

    if (adsPopup && !adsPopup.closed) {
      adsPopup.document.write(`
        <title>Opening Zernio Ads…</title>
        <body style="min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#0b0f14;font-family:ui-sans-serif,system-ui,sans-serif;color:#f5f7fb;">
          <main style="max-width:420px;width:100%;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:rgba(255,255,255,.06);padding:24px;">
            <p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#c4a8ff;">Opening Zernio Ads setup…</p>
            <p style="margin:0;font-size:14px;line-height:1.5;color:#a6afc2;">Finish setup in the new tab, then return to MAP.</p>
          </main>
        </body>
      `)
    }

    setIsConnectingAds(true)
    setAdAccountNotice('')
    try {
      const payload = await startBoostAdsConnection({
        platform,
        redirectUrl: typeof window !== 'undefined' ? window.location.href : '',
      })

      if (payload.alreadyConnected) {
        if (adsPopup && !adsPopup.closed) adsPopup.close()
        const accounts = payload.accounts || []
        setAdAccounts(accounts)
        if (accounts.length === 1) {
          setAdAccountId(accounts[0].adAccountId || accounts[0].id || '')
        }
        setAdAccountNotice(accounts.length ? 'Ads account is connected. Choose the account for this boost.' : 'Ads setup is connected. Check ad accounts again.')
        return
      }

      if (payload.authUrl) {
        if (adsPopup && !adsPopup.closed) {
          adsPopup.opener = null
          adsPopup.location.href = payload.authUrl
          adsPopup.focus()
        } else {
          window.open(payload.authUrl, '_blank', 'noopener,noreferrer')
        }
        setAdAccountNotice('Finish Ads setup in Zernio, then click Check ad accounts.')
        return
      }

      if (adsPopup && !adsPopup.closed) adsPopup.close()
      setAdAccountNotice(payload.message || 'Zernio accepted the Ads setup request. Check ad accounts again.')
    } catch (connectError) {
      if (adsPopup && !adsPopup.closed) adsPopup.close()
      setAdAccountNotice(connectError.message || 'Could not start Ads setup.')
    } finally {
      setIsConnectingAds(false)
    }
  }

  return createPortal(
    <div className="portal-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="boost-post-title">
      <section className="portal-modal-panel boost-post-modal">
        <div className="portal-modal-head">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
              Paid boost
            </p>
            <h2 id="boost-post-title" className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Boost this post
            </h2>
          </div>
          <button type="button" onClick={onClose} className="portal-icon-button" aria-label="Close boost setup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="boost-post-preview">
          <div>
            <Badge type="published" />
            <p>{item.caption}</p>
          </div>
          {item.thumbnailUrl ? (
            <CalendarMediaThumb
              item={item}
              className=""
              fallbackClassName="content-plan-chip-media-empty"
              iconClassName="h-5 w-5"
            />
          ) : null}
        </div>

        <div className="boost-assistant-panel">
          <div>
            <span><Sparkles className="h-3.5 w-3.5" /> Boost Assistant</span>
            <strong>{BOOST_GOALS.find((option) => option.value === boostRecommendation.goal)?.label || 'Recommended starter boost'}</strong>
            <p>{boostRecommendation.reason}</p>
            <small>{boostRecommendation.tip}</small>
          </div>
          <button
            type="button"
            className="portal-button-secondary px-3 py-2 text-xs font-semibold"
            onClick={() => {
              setPlatform(boostRecommendation.platform)
              setGoal(boostRecommendation.goal)
              setBudgetAmount(boostRecommendation.budgetAmount)
              setBudgetType(boostRecommendation.budgetType)
              setDurationDays(boostRecommendation.durationDays)
              setAudienceMode('national')
              setCountryCodes(client?.country_code || 'US')
            }}
          >
            Use recommendation
          </button>
        </div>

        <div className="boost-post-grid">
          <label>
            <span>Platform</span>
            <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {availablePlatforms.map((platformId) => {
                const marker = PLATFORM_MARKERS[platformId]
                return (
                  <option key={platformId} value={platformId}>
                    {marker?.label || platformId}
                  </option>
                )
              })}
            </select>
          </label>
          <label>
            <span>Goal</span>
            <select value={goal} onChange={(event) => setGoal(event.target.value)}>
              {BOOST_GOALS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Budget</span>
            <input value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} inputMode="decimal" placeholder="10" />
          </label>
          <label>
            <span>Budget type</span>
            <select value={budgetType} onChange={(event) => setBudgetType(event.target.value)}>
              <option value="daily">Daily</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </label>
          <label>
            <span>Duration</span>
            <select value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))}>
              {BOOST_DURATIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Audience</span>
            <select value={audienceMode} onChange={(event) => setAudienceMode(event.target.value)}>
              {BOOST_AUDIENCE_MODES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {audienceMode === 'national' ? (
            <label>
              <span>Countries</span>
              <input value={countryCodes} onChange={(event) => setCountryCodes(event.target.value.toUpperCase())} placeholder="US" />
            </label>
          ) : null}
          {audienceMode === 'zip' ? (
            <>
              <label>
                <span>Country</span>
                <input value={countryCodes} onChange={(event) => setCountryCodes(event.target.value.toUpperCase())} placeholder="US" />
              </label>
              <label>
                <span>ZIP codes</span>
                <input value={zipCodes} onChange={(event) => setZipCodes(event.target.value)} placeholder="13901, 13905" />
              </label>
            </>
          ) : null}
          {audienceMode === 'custom' ? (
            <label>
              <span>Audience IDs</span>
              <input value={customAudienceIds} onChange={(event) => setCustomAudienceIds(event.target.value)} placeholder="Meta custom audience IDs" />
            </label>
          ) : null}
          {savedAdAccountId ? (
            <div className="boost-post-readiness">
              <span>Ad account</span>
              <strong>Using {savedAdAccountLabel}</strong>
              <small>Saved from a previous {PLATFORM_MARKERS[platform]?.label || platform} boost.</small>
            </div>
          ) : (
            <div className="boost-post-readiness boost-post-readiness--setup">
              <span>Ad account</span>
              {adAccounts.length ? (
                <select value={adAccountId} onChange={(event) => setAdAccountId(event.target.value)}>
                  <option value="">Choose ad account</option>
                  {adAccounts.map((account) => (
                    <option key={account.id || account.adAccountId} value={account.adAccountId || account.id}>
                      {account.label || account.adAccountId}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={adAccountId} onChange={(event) => setAdAccountId(event.target.value)} placeholder="First boost setup" />
              )}
              <div className="boost-ad-account-actions">
                <button type="button" onClick={handleLoadAdAccounts} disabled={isLoadingAdAccounts || isConnectingAds}>
                  {isLoadingAdAccounts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Check ad accounts
                </button>
                <button type="button" onClick={handleConnectAds} disabled={isLoadingAdAccounts || isConnectingAds}>
                  {isConnectingAds ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Ads setup
                </button>
              </div>
              {adAccountNotice ? <small>{adAccountNotice}</small> : <small>First boost only. MAP saves the selected account for future boosts.</small>}
            </div>
          )}
        </div>

        <div className="boost-post-note">
          This launches real ad spend through Zernio. The first boost may need the ad account once; MAP saves it for future boosts.
        </div>

        {isReadinessLoading ? (
          <div className="boost-post-note">Checking account readiness...</div>
        ) : null}

        {!isReadinessLoading && selectedIssues.length ? (
          <div className="boost-post-error">
            {selectedIssues.map((issue) => issue.message).join(' ')}
          </div>
        ) : null}

        {!audienceReady ? (
          <div className="boost-post-error">
            Choose a country, ZIP code, or custom audience before launching a Meta boost.
          </div>
        ) : null}

        {error ? <div className="boost-post-error">{error}</div> : null}

        <div className="portal-modal-actions">
          <button type="button" onClick={onClose} className="portal-button-secondary px-4 py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || !canLaunchBoost}
            onClick={() => onSubmit({
              postId: item.post.id,
              platform,
              goal,
              budgetAmount,
              budgetType,
              durationDays,
              adAccountId: savedAdAccountId || adAccountId,
              targeting: boostTargeting,
              name: `MAP Boost - ${item.title || 'Published post'}`,
            })}
            className="portal-button-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            Launch boost
          </button>
        </div>
      </section>
    </div>,
    window.document.body,
  )
}

function RowActionMenu({ item, actions }) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    const updateMenuPosition = () => {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      if (!buttonRect) return
      const estimatedMenuWidth = menuRef.current?.getBoundingClientRect().width || 188
      const estimatedMenuHeight = menuRef.current?.getBoundingClientRect().height || 150
      const padding = 12
      const gap = 8
      const spaceBelow = window.innerHeight - buttonRect.bottom
      const top = spaceBelow < estimatedMenuHeight + 20
        ? Math.max(padding, buttonRect.top - estimatedMenuHeight - gap)
        : Math.min(window.innerHeight - estimatedMenuHeight - padding, buttonRect.bottom + gap)
      const left = Math.min(
        Math.max(padding, buttonRect.right - estimatedMenuWidth),
        window.innerWidth - estimatedMenuWidth - padding,
      )

      setMenuPosition({ top, left })
    }

    const handlePointerDown = (event) => {
      if (
        buttonRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) return
      setIsOpen(false)
    }

    const frameId = window.requestAnimationFrame(updateMenuPosition)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    window.document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      window.document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isOpen])

  if (!actions.length) return null

  return (
    <div className="content-plan-row-actions">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Open actions for ${item.title}`}
        className="content-plan-row-menu-button"
        onClick={(event) => {
          event.stopPropagation()
          window.dispatchEvent(new CustomEvent('map-calendar-row-menu-open'))
          setIsOpen((value) => !value)
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen ? createPortal(
        <div
          ref={menuRef}
          className="content-plan-row-menu fixed z-[360] min-w-[188px] rounded-[18px] border p-2 shadow-lg"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 360,
            borderColor: 'var(--portal-border)',
            background: 'rgba(255,255,255,0.98)',
            boxShadow: '0 18px 40px rgba(26, 24, 20, 0.12)',
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="space-y-1">
            {actions.map(({ label, Icon, onSelect, destructive }) => (
              <button
                key={label}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setIsOpen(false)
                  onSelect()
                }}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all"
                style={destructive
                  ? { color: 'var(--portal-danger)', background: 'rgba(223, 95, 143, 0.06)' }
                  : { color: 'var(--portal-text)' }}
              >
                {Icon ? <Icon className="h-4 w-4" /> : null}
                {label}
              </button>
            ))}
          </div>
        </div>,
        window.document.body,
      ) : null}
    </div>
  )
}

function CalendarMediaThumb({ item, className = '', fallbackClassName = '', iconClassName = 'h-5 w-5' }) {
  const [failedSrc, setFailedSrc] = useState('')
  const src = item?.thumbnailUrl || ''
  const mediaType = item?.mediaType || ''

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt=""
        className={className}
        loading="lazy"
        onError={() => setFailedSrc(src)}
      />
    )
  }

  return (
    <div className={fallbackClassName} aria-hidden="true">
      {mediaType === 'video' ? <FileSearch className={iconClassName} /> : <Sparkles className={iconClassName} />}
    </div>
  )
}

function CalendarHoverPreview({ preview }) {
  if (!preview?.item) return null

  const { item, position } = preview

  return createPortal(
    <aside
      className="content-plan-hover-preview"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      role="status"
      aria-live="polite"
    >
      <div className="content-plan-hover-preview-head">
        <StatusMarker type={item.badgeType} />
        <span>{item.dayLabel} · {item.timeLabel}</span>
      </div>
      <div className="content-plan-hover-preview-body">
        <CalendarMediaThumb
          item={item}
          className=""
          fallbackClassName="content-plan-hover-preview-empty"
          iconClassName="h-5 w-5"
        />
        <div className="min-w-0">
          <h3>{item.title}</h3>
          <p>{item.caption || item.subtitle}</p>
          <div className="content-plan-hover-preview-meta">
            <PlatformMarkers platforms={item.platforms} />
            <span>{item.source === 'post' ? 'Click to open post' : 'Click to edit in Publisher'}</span>
          </div>
        </div>
      </div>
    </aside>,
    window.document.body,
  )
}

function PlanItemChip({ item, selected, onSelect, actions, onPreviewOpen, onPreviewClose }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onMouseEnter={(event) => onPreviewOpen(item, event.currentTarget)}
      onMouseLeave={onPreviewClose}
      onFocus={(event) => onPreviewOpen(item, event.currentTarget)}
      onBlur={onPreviewClose}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(item.id)
        }
      }}
      className="content-plan-post-chip grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-left transition-all"
      data-status={item.badgeType}
      style={selected ? { borderColor: 'rgba(201, 168, 76, 0.42)', background: 'rgba(245, 235, 214, 0.64)' } : undefined}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          {item.thumbnailUrl ? (
            <CalendarMediaThumb
              item={item}
              className="h-10 w-10 shrink-0 rounded-[10px] object-cover"
              fallbackClassName="content-plan-chip-media-empty h-10 w-10 shrink-0 rounded-[10px]"
              iconClassName="h-4 w-4"
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
      <div className="content-plan-row-status">
        {item.boostStatus ? (
          <span className="content-plan-boost-marker">
            <Megaphone className="h-3 w-3" />
            {item.boostStatus.label.replace(/^Boost /, '')}
          </span>
        ) : null}
        <StatusMarker type={item.badgeType} />
        {(item.badgeType === 'scheduled' || item.badgeType === 'published') ? (
          <PlatformMarkers platforms={item.platforms} />
        ) : null}
      </div>
      <RowActionMenu item={item} actions={actions} />
    </div>
  )
}

function WeekDayLane({ day, items, selectedItemId, onSelect, onAddPost, getActions, onPreviewOpen, onPreviewClose }) {
  return (
    <div className="content-plan-day-lane">
      <div className="content-plan-day-stamp">
        <p>{formatDate(day, { weekday: 'short' })}</p>
        <span>{formatDate(day, { month: 'short', day: 'numeric' })}</span>
      </div>
      <div className="content-plan-day-body">
        {items.length > 0 ? (
          <div className="content-plan-day-items">
            {items.map((item) => (
              <PlanItemChip
                key={item.id}
                item={item}
                selected={selectedItemId === item.id}
                onSelect={onSelect}
                actions={getActions(item)}
                onPreviewOpen={onPreviewOpen}
                onPreviewClose={onPreviewClose}
              />
            ))}
          </div>
        ) : (
          <div className="content-plan-empty-day">
            <span>Nothing for today</span>
            <button type="button" onClick={() => onAddPost(toDateString(day))}>
              Create post now
            </button>
          </div>
        )}
      </div>
    </div>
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

const TRAINING_STEP_ICONS = {
  audience: Target,
  area: MapPin,
  promote: Megaphone,
  avoid: ShieldCheck,
  sources: FileSearch,
}

function TrainingChoiceList({
  options,
  isSelected,
  onChoose,
  mode = 'single',
}) {
  if (!options.length) return null

  return (
    <div className="assistant-choice-list assistant-live-choice-list" data-mode={mode}>
      {options.map((option) => {
        const value = typeof option === 'string' ? option : option.label
        const detail = typeof option === 'string' ? '' : option.detail
        const selected = isSelected(option)
        return (
          <button
            key={value}
            type="button"
            className="assistant-choice-button assistant-live-choice-button"
            data-active={selected}
            aria-pressed={selected}
            onClick={() => onChoose(option)}
          >
            <span className="assistant-choice-check" aria-hidden="true">
              {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
            </span>
            <span>
              <strong>{value}</strong>
              {detail ? <small>{detail}</small> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TrainingBriefPreview({ items, progress, verifiedLabel }) {
  return (
    <aside className="assistant-live-brief" aria-label="Partner brief">
      <div className="assistant-live-brief-head">
        <p className="assistant-training-kicker">Brief</p>
        <span>{progress.label}</span>
      </div>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="assistant-live-verified">{verifiedLabel}</p>
    </aside>
  )
}

function TrainingSourceStep({
  sources,
  sourceCount,
  label,
  url,
  sourceType,
  isSaving,
  busySourceId,
  onLabelChange,
  onUrlChange,
  onSourceTypeChange,
  onSave,
  onToggleSource,
  onDeleteSource,
}) {
  return (
    <div className="assistant-live-source-step">
      <div className="assistant-live-source-count">
        <span>{sourceCount} active</span>
      </div>

      <div className="assistant-source-list">
        {sources.length ? sources.map((source) => (
          <div key={source.id} className="assistant-source-row" data-inactive={!source.is_active}>
            <div className="min-w-0">
              <p>{source.label}</p>
              <span>{getResearchSourceTypeLabel(source.source_type)} · {source.url ? getSourceHost(source.url) : source.handle}</span>
            </div>
            <div className="assistant-source-actions">
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.label}`}>
                  <Link2 className="h-4 w-4" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => onToggleSource(source)}
                disabled={busySourceId === source.id}
              >
                {source.is_active ? 'Active' : 'Paused'}
              </button>
              <button
                type="button"
                onClick={() => onDeleteSource(source)}
                disabled={busySourceId === source.id}
                aria-label={`Delete ${source.label}`}
              >
                {busySourceId === source.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )) : (
          <div className="assistant-source-empty">
            Add a website, schedule, or event page.
          </div>
        )}
      </div>

      <form className="assistant-live-source-form" onSubmit={onSave}>
        <label htmlFor="assistant-source-label">Name
          <input
            id="assistant-source-label"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            placeholder="Event calendar"
          />
        </label>
        <label htmlFor="assistant-source-url">URL
          <input
            id="assistant-source-url"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://example.com/events"
          />
        </label>
        <label htmlFor="assistant-source-type">Type
          <select
            id="assistant-source-type"
            value={sourceType}
            onChange={(event) => onSourceTypeChange(event.target.value)}
          >
            {RESEARCH_SOURCE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save source
        </button>
      </form>
    </div>
  )
}

function TrainPartnerModal({
  client,
  form,
  sources,
  trainingStatus,
  label,
  url,
  sourceType,
  isSaving,
  isSavingProfile,
  isVerifying,
  busySourceId,
  error,
  notice,
  onClose,
  onFormChange,
  onSaveProfile,
  onVerify,
  onLabelChange,
  onUrlChange,
  onSourceTypeChange,
  onSave,
  onToggleSource,
  onDeleteSource,
  isRequired,
  isStartingRecommendations,
  recommendationStatus,
}) {
  const [activeStepId, setActiveStepId] = useState('audience')
  const sourceCount = sources.filter((source) => source.is_active).length
  const guidedChoices = buildPartnerGuidedChoices({ client, form, sources })
  const requiredComplete = hasRequiredPartnerTraining(form)
  const trainingProgress = resolveTrainingProgress(form, sources)
  const briefItems = buildPartnerBriefItems({ client, form, sources })
  const trainingSteps = PARTNER_TRAINING_STEPS.map((step) => ({
    ...step,
    Icon: TRAINING_STEP_ICONS[step.id] || Sparkles,
    complete: resolveTrainingStepComplete(step, form, sources),
  }))
  const activeStep = trainingSteps.find((step) => step.id === activeStepId) || trainingSteps[0]
  const activeStepIndex = trainingSteps.findIndex((step) => step.id === activeStep.id)
  const verifiedLabel = trainingStatus?.isVerified
    ? `Verified ${formatVerifiedDate(trainingStatus.verifiedAt)}`
    : 'Not verified yet'
  const stepTitles = {
    audience: 'Who should MAP write for first?',
    area: 'Where should posts feel local?',
    promote: 'What should come up more?',
    avoid: 'What should MAP avoid?',
    sources: 'What should MAP trust?',
  }

  function goToRelativeStep(offset) {
    const nextIndex = Math.min(Math.max(activeStepIndex + offset, 0), trainingSteps.length - 1)
    setActiveStepId(trainingSteps[nextIndex].id)
  }

  function renderStepContent() {
    if (activeStep.id === 'audience') {
      return (
        <TrainingChoiceList
          options={guidedChoices.audienceOptions}
          isSelected={(option) => normalizeChoice(form.audienceSummary) === normalizeChoice(option)}
          onChoose={(option) => onFormChange('audienceSummary', option)}
        />
      )
    }

    if (activeStep.id === 'area') {
      return (
        <TrainingChoiceList
          options={guidedChoices.reachOptions}
          isSelected={(option) => option.active}
          onChoose={(option) => {
            Object.entries(option.updates).forEach(([field, value]) => onFormChange(field, value))
          }}
        />
      )
    }

    if (activeStep.id === 'promote') {
      return (
        <TrainingChoiceList
          mode="multi"
          options={guidedChoices.offerOptions}
          isSelected={(option) => listContainsValue(form.offerFocusText, option)}
          onChoose={(option) => onFormChange('offerFocusText', toggleTextListValue(form.offerFocusText, option))}
        />
      )
    }

    if (activeStep.id === 'avoid') {
      return (
        <TrainingChoiceList
          mode="multi"
          options={guidedChoices.guardrailOptions}
          isSelected={(option) => listContainsValue(form.blockedTopicsText, option)}
          onChoose={(option) => onFormChange('blockedTopicsText', toggleTextListValue(form.blockedTopicsText, option))}
        />
      )
    }

    return (
      <>
        <TrainingSourceStep
          sources={sources}
          sourceCount={sourceCount}
          label={label}
          url={url}
          sourceType={sourceType}
          isSaving={isSaving}
          busySourceId={busySourceId}
          onLabelChange={onLabelChange}
          onUrlChange={onUrlChange}
          onSourceTypeChange={onSourceTypeChange}
          onSave={onSave}
          onToggleSource={onToggleSource}
          onDeleteSource={onDeleteSource}
        />
        <label className="assistant-live-notes" htmlFor="partner-live-notes">
          Notes
          <textarea
            id="partner-live-notes"
            value={form.researchNotes}
            onChange={(event) => onFormChange('researchNotes', event.target.value)}
            placeholder="Seasonal priorities, tone notes, or anything MAP should know."
          />
        </label>
      </>
    )
  }

  return createPortal(
    <div className="assistant-train-overlay" role="presentation" onMouseDown={isRequired ? undefined : onClose}>
      <div
        className="assistant-train-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-train-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="assistant-train-header">
          <div className="assistant-train-icon portal-ai-icon">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
              Partner setup
            </p>
            <h2 id="assistant-train-title" className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Train your Partner
            </h2>
          </div>
          {isRequired ? null : (
            <button type="button" className="assistant-train-close" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="assistant-train-body">
          <section className="assistant-live-setup" aria-label="Partner setup">
            <div className="assistant-live-status">
              <span>{trainingProgress.label}</span>
              <span>{verifiedLabel}</span>
            </div>

            <div className="assistant-live-grid">
              <aside className="assistant-live-steps" aria-label="Steps">
                {trainingSteps.map((step) => {
                  const Icon = step.Icon
                  return (
                    <button
                      key={step.id}
                      type="button"
                      className="assistant-live-step"
                      data-active={activeStep.id === step.id}
                      onClick={() => setActiveStepId(step.id)}
                    >
                      <span className="assistant-live-step-icon" aria-hidden="true">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <strong>{step.label}</strong>
                        <small>{step.complete ? 'Set' : step.required ? 'Needed' : 'Optional'}</small>
                      </span>
                    </button>
                  )
                })}
              </aside>

              <section className="assistant-live-question">
                <div className="assistant-live-question-head">
                  <p className="assistant-training-kicker">{activeStep.label}</p>
                  <h3>{stepTitles[activeStep.id]}</h3>
                </div>

                {renderStepContent()}

                {(error || notice || recommendationStatus) && (
                  <div className="assistant-train-message" data-tone={error ? 'error' : 'success'}>
                    {error || notice || recommendationStatus}
                  </div>
                )}

                <div className="assistant-live-actions">
                  <button
                    type="button"
                    className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
                    onClick={() => goToRelativeStep(-1)}
                    disabled={activeStepIndex === 0}
                  >
                    Back
                  </button>
                  {activeStepIndex < trainingSteps.length - 1 ? (
                    <button
                      type="button"
                      className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
                      onClick={() => goToRelativeStep(1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
                      onClick={onVerify}
                      disabled={isVerifying || isSavingProfile || isStartingRecommendations || (isRequired && !requiredComplete)}
                    >
                      {isVerifying || isStartingRecommendations ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {isRequired ? 'Verify and build' : 'Verify'}
                    </button>
                  )}
                </div>
              </section>

              <TrainingBriefPreview items={briefItems} progress={trainingProgress} verifiedLabel={verifiedLabel} />
            </div>
          </section>

          <details className="assistant-profile-advanced">
            <summary>
              <span>
                <PencilLine className="h-4 w-4" />
                Exact details
              </span>
              <small>Optional</small>
            </summary>

          <form className="assistant-profile-form" onSubmit={onSaveProfile}>
            <div className="assistant-profile-section">
              <div className="assistant-profile-grid">
                <div>
                  <label htmlFor="partner-category">Business category</label>
                  <input id="partner-category" value={form.businessCategory} onChange={(event) => onFormChange('businessCategory', event.target.value)} placeholder="Arts, fitness, local services..." />
                </div>
                <div>
                  <label htmlFor="partner-subtype">Offering type</label>
                  <input id="partner-subtype" value={form.businessSubtype} onChange={(event) => onFormChange('businessSubtype', event.target.value)} placeholder="Dance studio, kids classes..." />
                </div>
                <div>
                  <label htmlFor="partner-reach">Market reach</label>
                  <select id="partner-reach" value={form.businessReach} onChange={(event) => onFormChange('businessReach', event.target.value)}>
                    <option value="local">Local</option>
                    <option value="national_global">National / online</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="partner-website">Website</label>
                  <input id="partner-website" value={form.websiteUrl} onChange={(event) => onFormChange('websiteUrl', event.target.value)} placeholder="https://example.com" />
                </div>
                <div>
                  <label htmlFor="partner-country">Country</label>
                  <input id="partner-country" value={form.countryCode} onChange={(event) => onFormChange('countryCode', event.target.value.toUpperCase())} placeholder="US" />
                </div>
                <div>
                  <label htmlFor="partner-state">State</label>
                  <input id="partner-state" value={form.stateCode} onChange={(event) => onFormChange('stateCode', event.target.value.toUpperCase())} placeholder="NY" />
                </div>
                <div>
                  <label htmlFor="partner-zip">ZIP / postal code</label>
                  <input id="partner-zip" value={form.postalCode} onChange={(event) => onFormChange('postalCode', event.target.value)} placeholder="13901" />
                </div>
                <div>
                  <label htmlFor="partner-county">County</label>
                  <input id="partner-county" value={form.county} onChange={(event) => onFormChange('county', event.target.value)} placeholder="Broome County" />
                </div>
              </div>
            </div>

            <div className="assistant-profile-section">
              <div className="assistant-profile-grid">
                <div>
                  <label htmlFor="partner-service-area">Service area</label>
                  <input id="partner-service-area" value={form.serviceArea} onChange={(event) => onFormChange('serviceArea', event.target.value)} placeholder="Binghamton, Vestal, Johnson City..." />
                </div>
                <div>
                  <label htmlFor="partner-audience">Best audience</label>
                  <input id="partner-audience" value={form.audienceSummary} onChange={(event) => onFormChange('audienceSummary', event.target.value)} placeholder="Families, adult beginners, competitive dancers..." />
                </div>
                <div>
                  <label htmlFor="partner-offers">Promote</label>
                  <textarea id="partner-offers" value={form.offerFocusText} onChange={(event) => onFormChange('offerFocusText', event.target.value)} placeholder={'Summer camp\nRecital tickets\nAdult beginner classes'} />
                </div>
                <div>
                  <label htmlFor="partner-blocked">Avoid</label>
                  <textarea id="partner-blocked" value={form.blockedTopicsText} onChange={(event) => onFormChange('blockedTopicsText', event.target.value)} placeholder={'Old location\nSold-out classes\nOffers no longer available'} />
                </div>
                <div className="assistant-profile-wide">
                  <label htmlFor="partner-notes">Partner notes</label>
                  <textarea id="partner-notes" value={form.researchNotes} onChange={(event) => onFormChange('researchNotes', event.target.value)} placeholder="Seasonal priorities, tone, or key context." />
                </div>
              </div>
            </div>

            <button type="submit" className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" disabled={isSavingProfile}>
              {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Partner profile
            </button>
          </form>
          </details>

        </div>
      </div>
    </div>,
    document.body,
  )
}

function PartnerTrainingPrompt({
  trainingStatus,
  onReview,
  onDismiss,
}) {
  const isStale = trainingStatus?.isStale
  const title = isStale ? 'Your Partner may need a quick refresh' : 'Set up Train your Partner'
  const body = isStale
    ? `It has been ${trainingStatus.ageDays} days since this profile was verified. A quick review keeps posts, campaigns, and images aligned with what you offer now.`
    : 'MAP can use your website, brand, services, sources, and guardrails to create better posts and images. Review what your Partner found, then verify it once it looks right.'

  return createPortal(
    <div className="assistant-training-prompt-overlay" role="presentation" onMouseDown={onDismiss}>
      <section
        className="assistant-training-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-training-prompt-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="assistant-training-prompt-icon">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="assistant-training-kicker">Train your Partner</p>
          <h2 id="assistant-training-prompt-title">{title}</h2>
          <p>{body}</p>
        </div>
        <div className="assistant-training-prompt-actions">
          <button type="button" className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={onReview}>
            <Sparkles className="h-4 w-4" />
            Review training
          </button>
          <button type="button" className="portal-button-secondary inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold" onClick={onDismiss}>
            Remind me later
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default function ContentCalendar() {
  const { requireWriteAccess } = useOutletContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [actionBusyId, setActionBusyId] = useState('')
  const [trainAssistantOpen, setTrainAssistantOpen] = useState(false)
  const [trainingPromptOpen, setTrainingPromptOpen] = useState(false)
  const trainingPromptShownRef = useRef(false)
  const [sourceLabel, setSourceLabel] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceType, setSourceType] = useState('local_event_calendar')
  const [sourceError, setSourceError] = useState('')
  const [sourceNotice, setSourceNotice] = useState('')
  const [recommendationStatus, setRecommendationStatus] = useState('')
  const [isStartingRecommendations, setIsStartingRecommendations] = useState(false)
  const [busySourceId, setBusySourceId] = useState('')
  const [partnerProfileForm, setPartnerProfileForm] = useState(() => buildPartnerProfileForm(null, null))
  const [hoverPreview, setHoverPreview] = useState(null)
  const [boostItem, setBoostItem] = useState(null)
  const [boostError, setBoostError] = useState('')
  const [weekOffset, setWeekOffset] = useState(() => {
    const date = initialParams.get('date')
    return date ? getWeekOffsetFromDate(date) : 0
  })
  const [queueMode, setQueueMode] = useState(() => initialParams.get('view') === 'month' ? 'month' : 'week')
  const [activeStatusView, setActiveStatusView] = useState('')
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
  const client = profile?.clients || {}

  const { data: calendarPosts = [], isLoading: postsLoading, refetch: refetchPosts, isRefetching: isRefetchingPosts } = useQuery({
    queryKey: ['calendar-posts', clientId],
    queryFn: () => fetchCalendarPosts(clientId),
    enabled: !!clientId,
  })

  const { data: postBoosts = [], isLoading: boostsLoading, refetch: refetchBoosts } = useQuery({
    queryKey: ['post-boosts', clientId],
    queryFn: () => fetchPostBoosts(clientId),
    enabled: !!clientId,
  })

  const { data: boostReadiness = null, isLoading: boostReadinessLoading } = useQuery({
    queryKey: ['post-boost-readiness', boostItem?.post?.id],
    queryFn: () => fetchPostBoostReadiness(boostItem.post.id),
    enabled: Boolean(boostItem?.post?.id),
  })

  const { data: drafts = [], isLoading: draftsLoading, refetch: refetchDrafts, isRefetching: isRefetchingDrafts } = useQuery({
    queryKey: ['social-drafts', clientId],
    queryFn: () => fetchSocialDrafts(clientId),
    enabled: !!clientId,
  })

  const draftMediaRefs = useMemo(() => (
    drafts.flatMap((draft) => {
      const ref = getDraftPrimaryMediaRef(draft)
      if (!ref?.url && !ref?.documentId) return []
      const entries = [[`draft:${draft.id}`, ref]]
      if (draft.published_reference) {
        entries.push([`post:${draft.published_reference}`, ref])
      }
      return entries
    })
  ), [drafts])

  const draftMediaRefKey = useMemo(() => (
    draftMediaRefs.map(([draftId, ref]) => `${draftId}:${getDraftMediaRefKey(ref)}`).join('|')
  ), [draftMediaRefs])

  const { data: draftMediaPreviews = {} } = useQuery({
    queryKey: ['social-draft-media-previews', clientId, draftMediaRefKey],
    queryFn: async () => {
      const entries = await Promise.all(draftMediaRefs.map(async ([mediaKey, ref]) => {
        if (ref.url || ref.thumbnail) {
          return [mediaKey, {
            url: ref.thumbnail || ref.url,
            name: ref.name || 'Draft media',
            mediaType: ref.mediaType || '',
            source: ref.source || '',
          }]
        }

        const payload = await getSecureVaultDocumentUrl(ref.documentId, 'view')
        return [mediaKey, {
          url: payload.signed_url || '',
          name: payload.file_name || ref.name || 'Draft media',
          mediaType: ref.mediaType || (String(payload.mime_type || '').startsWith('video/') ? 'video' : 'image'),
          source: ref.source || 'campaign_partner',
        }]
      }))

      return Object.fromEntries(entries.filter(([, preview]) => preview.url))
    },
    enabled: !!clientId && draftMediaRefs.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const { data: researchSources = [], isLoading: researchSourcesLoading } = useQuery({
    queryKey: ['research-sources', clientId],
    queryFn: () => fetchResearchSources(clientId),
    enabled: !!clientId,
  })

  const { data: researchProfile = null, isLoading: researchProfileLoading } = useQuery({
    queryKey: ['research-profile', clientId],
    queryFn: () => fetchResearchProfile(clientId),
    enabled: !!clientId,
  })

  const trainingStatus = useMemo(() => getPartnerTrainingStatus(researchProfile), [researchProfile])
  const trainingIsRequired = !trainingStatus.isVerified

  const { data: opportunities = [], isLoading: radarLoading, refetch: refetchRadar, isRefetching: isRefetchingRadar } = useQuery({
    queryKey: ['opportunity-radar', clientId],
    queryFn: () => fetchOpportunityRadar(clientId),
    enabled: !!clientId && trainingStatus.isVerified,
  })

  const launchBoost = useMutation({
    mutationFn: launchPostBoost,
    onSuccess: async (payload) => {
      setBoostError('')
      setBoostItem(null)
      setActionNotice(payload?.message || 'Boost launched.')
      await queryClient.invalidateQueries({ queryKey: ['post-boosts', clientId] })
      await refetchBoosts()
    },
    onError: (error) => {
      setBoostError(error.message || 'Could not launch this boost.')
    },
  })

  useEffect(() => {
    if (!trainAssistantOpen) return
    setPartnerProfileForm(buildPartnerProfileForm(profile?.clients, researchProfile))
  }, [trainAssistantOpen, profile?.clients, researchProfile])

  const occupiedWeekDates = useMemo(() => {
    const dates = new Set()
    drafts
      .filter(isVisibleDraft)
      .filter((draft) => isDateInWeek(draft.slot_date_local, selectedWeekStart))
      .forEach((draft) => dates.add(draft.slot_date_local))
    calendarPosts
      .filter((post) => isDateInWeek(getPostDisplayDate(post), selectedWeekStart))
      .forEach((post) => dates.add(toDateString(new Date(getPostDisplayDate(post)))))
    return [...dates]
  }, [calendarPosts, drafts, selectedWeekStart])

  const activeRadarOpportunities = useMemo(() => (
    opportunities
      .filter((opportunity) => !HIDDEN_RADAR_STATES.has(opportunity.review_state))
      .filter((opportunity) => getActiveSuggestions(opportunity).length > 0)
  ), [opportunities])

  const radarItems = useMemo(() => (
    selectWeeklyPartnerIdeas(
      activeRadarOpportunities,
      selectedWeekStart,
      selectedWeekStartString,
      occupiedWeekDates,
    )
      .map(({ opportunity, dateString, isGapFill }, index) => {
        const suggestion = getPrimarySuggestion(opportunity)
        const action = buildRadarAction(opportunity, suggestion)
        return {
          id: `radar:${opportunity.id}`,
          source: 'radar',
          badgeType: 'radar',
          dateString,
          isGapFill,
          dayLabel: isDateInWeek(dateString, selectedWeekStart) ? formatSlotDate(dateString) : (index === 0 ? 'Today' : 'This week'),
          timeLabel: isGapFill ? 'Open day' : opportunity.expires_at ? `By ${formatDate(opportunity.expires_at, { month: 'short', day: 'numeric' })}` : 'Review',
          title: suggestion?.title || opportunity.title,
          subtitle: isGapFill ? `Suggested for an open ${formatSlotDate(dateString)} slot` : opportunity.title,
          detailTitle: opportunity.title,
          caption: action.readyCaption,
          whyNow: isGapFill ? `This idea can fill an open day on ${formatSlotDate(dateString)} before anything posts.` : action.whyNow,
          imagePrompt: action.imagePrompt,
          proof: (opportunity.source_urls || []).slice(0, 2),
          adWorthiness: opportunity.ad_worthiness,
          platforms: suggestion?.recommended_platforms || [],
          opportunity,
          suggestion,
        }
      })
  ), [activeRadarOpportunities, occupiedWeekDates, selectedWeekStart, selectedWeekStartString])

  const draftItems = useMemo(() => (
    drafts
      .filter(isVisibleDraft)
      .filter((draft) => isDateInWeek(draft.slot_date_local, selectedWeekStart))
      .map((draft) => {
        const mediaPreview = draftMediaPreviews[`draft:${draft.id}`]
        return {
          id: `draft:${draft.id}`,
          source: 'draft',
          badgeType: 'draft',
          dateString: draft.slot_date_local,
          dayLabel: formatSlotDate(draft.slot_date_local),
          timeLabel: draft.slot_start_local || 'Draft',
          title: draft.draft_title || draft.post_type?.replace(/_/g, ' ') || 'Saved draft',
          subtitle: mediaPreview ? `${draft.review_state?.replace(/_/g, ' ') || 'Draft saved'} · media attached` : draft.review_state?.replace(/_/g, ' ') || 'Draft saved',
          detailTitle: draft.draft_title || 'Saved draft',
          caption: draft.draft_caption || draft.draft_body || 'Open this draft in Publisher to continue editing.',
          whyNow: 'This is already saved and ready for review.',
          imagePrompt: Array.isArray(draft.asset_requirements_json)
            ? draft.asset_requirements_json.find((item) => item?.suggestion)?.suggestion || 'Review media needs in Publisher.'
            : 'Review media needs in Publisher.',
          proof: ['Saved draft'],
          thumbnailUrl: mediaPreview?.url || '',
          mediaType: mediaPreview?.mediaType || '',
          draft,
        }
      })
  ), [draftMediaPreviews, drafts, selectedWeekStart])

  const postBoostsByPostId = useMemo(() => {
    const groups = new Map()
    for (const boost of postBoosts) {
      if (!boost.post_id) continue
      if (!groups.has(boost.post_id)) groups.set(boost.post_id, [])
      groups.get(boost.post_id).push(boost)
    }
    return groups
  }, [postBoosts])

  const postItems = useMemo(() => (
    calendarPosts
      .filter((post) => isDateInWeek(getPostDisplayDate(post), selectedWeekStart))
      .map((post) => {
        const boosts = postBoostsByPostId.get(post.id) || []
        const boostStatus = getBoostStatus(boosts)
        const mediaPreview = getPostMediaPreview(post, draftMediaPreviews[`post:${post.id}`])
        return {
          id: `post:${post.id}`,
          source: 'post',
          badgeType: post.status === 'published' ? 'published' : 'scheduled',
          dateString: toDateString(new Date(getPostDisplayDate(post))),
          dayLabel: formatDate(getPostDisplayDate(post), { weekday: 'short', month: 'short', day: 'numeric' }),
          timeLabel: formatDate(getPostDisplayDate(post), { hour: 'numeric', minute: '2-digit' }),
          title: post.content?.slice(0, 72) || (post.status === 'published' ? 'Posted content' : 'Scheduled post'),
          subtitle: boostStatus?.label || (post.status === 'published' ? 'Already posted' : 'Scheduled and waiting for publish time'),
          detailTitle: post.status === 'published' ? 'Posted content' : 'Scheduled post',
          caption: post.content || 'This post is already on the calendar.',
          whyNow: post.status === 'published'
            ? 'This content has already gone out and stays visible here for context.'
            : 'This item is already planned and helps avoid overfilling the calendar.',
          imagePrompt: mediaPreview ? 'Media is attached to this post.' : 'No media is attached yet.',
          proof: [post.status === 'published' ? 'Posted content' : 'Scheduled content'],
          thumbnailUrl: mediaPreview?.url || '',
          mediaType: mediaPreview?.mediaType || '',
          platforms: post.platforms || [],
          boosts,
          boostStatus,
          post,
        }
      })
  ), [calendarPosts, draftMediaPreviews, postBoostsByPostId, selectedWeekStart])

  const studioCounts = useMemo(() => ({
    ideas: radarItems.length,
    drafts: drafts.filter(isVisibleDraft).length,
    scheduled: calendarPosts.filter((post) => post.status === 'scheduled').length,
    posted: calendarPosts.filter((post) => post.status === 'published').length,
  }), [calendarPosts, drafts, radarItems.length])

  const allDetailItems = useMemo(() => {
    const radarDetailItems = radarItems

    const draftDetailItems = drafts
      .filter(isVisibleDraft)
      .map((draft) => {
        const mediaPreview = draftMediaPreviews[`draft:${draft.id}`]
        return {
          id: `draft:${draft.id}`,
          source: 'draft',
          badgeType: 'draft',
          dateString: draft.slot_date_local,
          dayLabel: formatSlotDate(draft.slot_date_local),
          timeLabel: draft.slot_start_local || 'Draft',
          title: draft.draft_title || draft.post_type?.replace(/_/g, ' ') || 'Saved draft',
          subtitle: mediaPreview ? `${draft.review_state?.replace(/_/g, ' ') || 'Draft saved'} · media attached` : draft.review_state?.replace(/_/g, ' ') || 'Draft saved',
          detailTitle: draft.draft_title || 'Saved draft',
          caption: draft.draft_caption || draft.draft_body || 'Open this draft in Publisher to continue editing.',
          whyNow: 'This is already saved and ready for review.',
          imagePrompt: Array.isArray(draft.asset_requirements_json)
            ? draft.asset_requirements_json.find((item) => item?.suggestion)?.suggestion || 'Review media needs in Publisher.'
            : 'Review media needs in Publisher.',
          proof: ['Saved draft'],
          thumbnailUrl: mediaPreview?.url || '',
          mediaType: mediaPreview?.mediaType || '',
          draft,
        }
      })

    const postDetailItems = calendarPosts
      .map((post) => {
        const boosts = postBoostsByPostId.get(post.id) || []
        const boostStatus = getBoostStatus(boosts)
        const mediaPreview = getPostMediaPreview(post, draftMediaPreviews[`post:${post.id}`])
        return {
          id: `post:${post.id}`,
          source: 'post',
          badgeType: post.status === 'published' ? 'published' : 'scheduled',
          dateString: toDateString(new Date(getPostDisplayDate(post))),
          dayLabel: formatDate(getPostDisplayDate(post), { weekday: 'short', month: 'short', day: 'numeric' }),
          timeLabel: formatDate(getPostDisplayDate(post), { hour: 'numeric', minute: '2-digit' }),
          title: post.content?.slice(0, 72) || (post.status === 'published' ? 'Posted content' : 'Scheduled post'),
          subtitle: boostStatus?.label || (post.status === 'published' ? 'Already posted' : 'Scheduled and waiting for publish time'),
          detailTitle: post.status === 'published' ? 'Posted content' : 'Scheduled post',
          caption: post.content || 'This post is already on the calendar.',
          whyNow: post.status === 'published'
            ? 'This content has already gone out and stays visible here for context.'
            : 'This item is already planned and helps avoid overfilling the calendar.',
          imagePrompt: mediaPreview ? 'Media is attached to this post.' : 'No media is attached yet.',
          proof: [post.status === 'published' ? 'Posted content' : 'Scheduled content'],
          thumbnailUrl: mediaPreview?.url || '',
          mediaType: mediaPreview?.mediaType || '',
          platforms: post.platforms || [],
          boosts,
          boostStatus,
          post,
        }
      })

    return [...radarDetailItems, ...draftDetailItems, ...postDetailItems]
  }, [calendarPosts, draftMediaPreviews, drafts, postBoostsByPostId, radarItems])

  const detailItemsById = useMemo(() => new Map(allDetailItems.map((item) => [item.id, item])), [allDetailItems])

  const statusViewItems = useMemo(() => {
    const needsSetup = allDetailItems.filter((item) => (
      item.source !== 'post' &&
      (item.platforms || []).some((platform) => platform && !PLATFORM_MARKERS[platform])
    ))
    const approvalItems = allDetailItems.filter((item) => item.source === 'radar' || item.source === 'draft')

    return {
      scheduled: allDetailItems.filter((item) => item.source === 'post' && item.badgeType === 'scheduled'),
      suggested: allDetailItems.filter((item) => item.source === 'radar'),
      draft: allDetailItems.filter((item) => item.source === 'draft'),
      setup: needsSetup,
      approval: approvalItems,
    }
  }, [allDetailItems])

  const activeStatusConfig = activeStatusView ? STATUS_VIEW_CONFIG[activeStatusView] : null
  const activeStatusItems = activeStatusView ? (statusViewItems[activeStatusView] || []) : []

  const planItems = useMemo(() => {
    const merged = [...radarItems, ...draftItems, ...postItems]
    return merged
      .sort((a, b) => new Date(`${a.dateString}T12:00:00`) - new Date(`${b.dateString}T12:00:00`))
  }, [draftItems, postItems, radarItems])

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)), [selectedWeekStart])
  const weekItemsByDate = useMemo(() => {
    const groups = new Map()
    for (const day of weekDays) groups.set(toDateString(day), [])
    for (const item of planItems) {
      if (!groups.has(item.dateString)) groups.set(item.dateString, [])
      groups.get(item.dateString).push(item)
    }
    return groups
  }, [planItems, weekDays])

  const selectedItem = allDetailItems.find((item) => item.id === selectedItemId) || (queueMode === 'month' ? null : planItems[0]) || null
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
      .filter(isVisibleDraft)
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
        dateString: item.dateString,
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
            selectedDate: item.dateString || null,
            dateSource: item.isGapFill ? 'publisher_current_week_gap_fill' : 'opportunity_radar_recommendation',
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

  const createSource = useMutation({
    mutationFn: async () => {
      if (!requireWriteAccess('train your Partner')) return null
      const normalizedUrl = normalizeSourceUrl(sourceUrl)
      if (!sourceLabel.trim()) throw new Error('Give this source a short name.')
      if (!normalizedUrl) throw new Error('Add a calendar or event page URL.')

      return createResearchSource({
        clientId,
        sourceType,
        label: sourceLabel,
        url: normalizedUrl,
        priority: sourceType === 'local_event_calendar' ? 1 : 2,
      })
    },
    onSuccess: async (source) => {
      if (!source) return
      setSourceLabel('')
      setSourceUrl('')
      setSourceType('local_event_calendar')
      setSourceError('')
      setSourceNotice('Source saved. Future Radar runs will use it.')
      await queryClient.invalidateQueries({ queryKey: ['research-sources', clientId] })
    },
    onError: (error) => {
      setSourceNotice('')
      setSourceError(error.message || 'Could not save this source.')
    },
  })

  async function savePartnerProfileSnapshot({ verify = false } = {}) {
    if (!requireWriteAccess(verify ? 'verify your Partner training' : 'update your Partner profile')) return null
    const websiteUrl = partnerProfileForm.websiteUrl ? normalizeSourceUrl(partnerProfileForm.websiteUrl) : null
    const businessType = derivePlannerBusinessType({
      businessType: client?.business_type,
      businessSubtype: partnerProfileForm.businessSubtype,
      businessCategory: partnerProfileForm.businessCategory,
    })

    await updateClientPartnerProfile(clientId, {
      business_type: businessType || null,
      business_category: partnerProfileForm.businessCategory,
      business_subtype: partnerProfileForm.businessSubtype,
      business_reach: partnerProfileForm.businessReach,
      country_code: partnerProfileForm.countryCode,
      state_code: partnerProfileForm.stateCode,
      postal_code: partnerProfileForm.postalCode,
      county: partnerProfileForm.county,
      website_url: websiteUrl,
    })

    return upsertResearchProfile({
      clientId,
      serviceArea: partnerProfileForm.serviceArea,
      audienceSummary: partnerProfileForm.audienceSummary,
      offerFocus: textToList(partnerProfileForm.offerFocusText),
      blockedTopics: textToList(partnerProfileForm.blockedTopicsText),
      researchNotes: partnerProfileForm.researchNotes,
      cadence: researchProfile?.cadence || 'weekly',
      partnerTrainingVerifiedAt: verify ? new Date().toISOString() : undefined,
      partnerTrainingVerifiedBy: verify ? profile?.id : undefined,
    })
  }

  const savePartnerProfile = useMutation({
    mutationFn: () => savePartnerProfileSnapshot(),
    onSuccess: async (savedProfile) => {
      if (!savedProfile) return
      setSourceError('')
      setSourceNotice('Partner profile saved. Future ideas will use the updated location, offerings, and guidance.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['research-profile', clientId] }),
      ])
    },
    onError: (error) => {
      setSourceNotice('')
      setSourceError(error.message || 'Could not save the Partner profile.')
    },
  })

  const verifyPartnerTraining = useMutation({
    mutationFn: () => savePartnerProfileSnapshot({ verify: true }),
    onSuccess: async (savedProfile) => {
      if (!savedProfile) return
      setSourceError('')
      setRecommendationStatus('')
      const wasFirstVerification = !trainingStatus.isVerified
      setSourceNotice(wasFirstVerification
        ? 'Training verified. Building your first recommendations now.'
        : `Partner training verified. MAP will remind you again in about ${PARTNER_TRAINING_REFRESH_DAYS} days.`)
      setTrainingPromptOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['research-profile', clientId] }),
      ])
      if (!wasFirstVerification) return

      try {
        setIsStartingRecommendations(true)
        setRecommendationStatus('MAP is researching your business and building better first post ideas.')
        await startOpportunityRadar({
          client_id: clientId,
          mode: 'monthly_foundation',
          max_results: 5,
          firecrawl_limit: 2,
          trigger: 'partner_training_verified',
        })
        await queryClient.invalidateQueries({ queryKey: ['opportunity-radar', clientId] })
        await refetchRadar()
        setRecommendationStatus('First recommendations are ready to review in Publisher.')
        setTrainAssistantOpen(false)
      } catch (error) {
        const alreadyRunning = error?.status === 409 || /already in progress/i.test(error?.message || '')
        setRecommendationStatus(alreadyRunning
          ? 'Training is verified. Recommendations are already being built and will appear shortly.'
          : 'Training is verified. Recommendations did not start automatically; use Refresh in a moment or run Radar again.')
      } finally {
        setIsStartingRecommendations(false)
      }
    },
    onError: (error) => {
      setSourceNotice('')
      setSourceError(error.message || 'Could not verify Partner training.')
    },
  })

  async function handleSaveSource(event) {
    event.preventDefault()
    setSourceError('')
    setSourceNotice('')
    setRecommendationStatus('')
    createSource.mutate()
  }

  async function handleSavePartnerProfile(event) {
    event.preventDefault()
    setSourceError('')
    setSourceNotice('')
    setRecommendationStatus('')
    savePartnerProfile.mutate()
  }

  function handleVerifyPartnerTraining() {
    setSourceError('')
    setSourceNotice('')
    setRecommendationStatus('')
    verifyPartnerTraining.mutate()
  }

  async function handleToggleSource(source) {
    if (!requireWriteAccess('update Partner training sources')) return
    try {
      setBusySourceId(source.id)
      setSourceError('')
      setSourceNotice('')
      await updateResearchSource(source.id, { is_active: !source.is_active })
      await queryClient.invalidateQueries({ queryKey: ['research-sources', clientId] })
      setSourceNotice(source.is_active ? 'Source paused.' : 'Source reactivated.')
    } catch (error) {
      setSourceError(error.message || 'Could not update this source.')
    } finally {
      setBusySourceId('')
    }
  }

  async function handleDeleteSource(source) {
    if (!requireWriteAccess('delete Partner training sources')) return
    if (!window.confirm(`Delete ${source.label} from Partner training sources?`)) return
    try {
      setBusySourceId(source.id)
      setSourceError('')
      setSourceNotice('')
      await deleteResearchSource(source.id)
      await queryClient.invalidateQueries({ queryKey: ['research-sources', clientId] })
      setSourceNotice('Source deleted.')
    } catch (error) {
      setSourceError(error.message || 'Could not delete this source.')
    } finally {
      setBusySourceId('')
    }
  }

  function handlePrimaryAction(item) {
    setActionError('')
    setActionNotice('')
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

  async function handleHideIdea(item) {
    if (!requireWriteAccess('hide Content Studio ideas')) return
    if (!item?.opportunity?.id) return

    try {
      setActionBusyId(item.id)
      setActionError('')
      setActionNotice('')
      if (item.suggestion?.id) {
        await updateOpportunitySuggestionState(item.suggestion.id, { review_state: 'archived' })
      }
      await updateOpportunityState(item.opportunity.id, 'archived')
      if (selectedItemId === item.id) setSelectedItemId('')
      await queryClient.invalidateQueries({ queryKey: ['opportunity-radar', clientId] })
      setActionNotice('Idea hidden from Studio.')
    } catch (error) {
      setActionError(error.message || 'Could not hide this idea.')
    } finally {
      setActionBusyId('')
    }
  }

  async function handleDeleteDraftItem(item) {
    if (!requireWriteAccess('delete drafts')) return
    const draft = item?.draft
    if (!draft?.id) return
    if (!window.confirm('Delete this saved draft?')) return

    try {
      setActionBusyId(item.id)
      setActionError('')
      setActionNotice('')
      try {
        const meta = parseDraftMeta(draft.review_notes)
        await recordPlannerFeedbackEvent({
          clientId,
          draftId: draft.id,
          postType: draft.post_type,
          eventType: 'draft_deleted',
          angleId: meta.angleId || null,
          metadata: {
            source: 'content_studio',
            slotDateLocal: draft.slot_date_local,
            slotLabel: draft.slot_label,
            reviewState: draft.review_state,
          },
        })
      } catch (error) {
        console.error('[ContentStudioFeedback]', error)
      }
      await deleteSocialDraft(draft.id)
      if (selectedItemId === item.id) setSelectedItemId('')
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      setActionNotice('Draft deleted.')
    } catch (error) {
      setActionError(error.message || 'Could not delete this draft.')
    } finally {
      setActionBusyId('')
    }
  }

  async function handleDeleteCalendarPostItem(item) {
    const isPublished = item?.badgeType === 'published'
    if (!requireWriteAccess(isPublished ? 'delete posted items' : 'delete scheduled posts')) return
    const post = item?.post
    if (!post?.id) return
    const confirmMessage = isPublished
      ? 'Delete this posted item? MAP will also try to remove it from the connected social channels. If the platform post is already gone, MAP will remove the local calendar record.'
      : 'Delete this scheduled post? This will also try to cancel it in the publisher workflow.'
    if (!window.confirm(confirmMessage)) return

    try {
      setActionBusyId(item.id)
      setActionError('')
      setActionNotice('')

      const payload = await deletePost(post.id)
      if (selectedItemId === item.id) setSelectedItemId('')
      queryClient.setQueryData(['calendar-posts', clientId], (current = []) => (
        Array.isArray(current) ? current.filter((calendarPost) => calendarPost.id !== post.id) : current
      ))
      await queryClient.invalidateQueries({ queryKey: ['calendar-posts', clientId] })
      setActionNotice(payload?.remoteDelete?.localCleanupAfterRemoteError
        ? `${isPublished ? 'Posted item' : 'Scheduled post'} removed from the calendar. MAP could not confirm the platform delete, so check the connected social channels.`
        : payload?.remoteDelete?.ignoredMissingRemotePost
          ? `${isPublished ? 'Posted item' : 'Scheduled post'} removed from the calendar. The provider reported that the remote post was already gone.`
        : payload?.remoteDelete?.skipped
          ? `${isPublished ? 'Posted item' : 'Scheduled post'} removed from the calendar. No provider post id was stored for remote deletion.`
          : `${isPublished ? 'Posted item' : 'Scheduled post'} deleted.`)
    } catch (error) {
      setActionError(error.message || `Could not delete this ${isPublished ? 'posted item' : 'scheduled post'}.`)
    } finally {
      setActionBusyId('')
    }
  }

  function handleOpenBoost(item) {
    if (!requireWriteAccess('boost posts')) return
    if (!item?.post?.id) return
    if (item.post.status !== 'published') {
      setActionError('Boost is available after a post is published.')
      return
    }
    setHoverPreview(null)
    setBoostError('')
    setBoostItem(item)
  }

  function handleLaunchBoost(input) {
    const now = new Date()
    const durationDays = Number(input.durationDays) || 5
    const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    launchBoost.mutate({
      ...input,
      startsAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      currency: 'USD',
      targeting: input.targeting || {},
    })
  }

  function getRowActions(item) {
    if (!item || actionBusyId === item.id) return []
    if (item.source === 'radar') {
      return [
        { label: 'Make post', Icon: Wand2, onSelect: () => handlePrimaryAction(item) },
        { label: 'Hide idea', Icon: Trash2, destructive: true, onSelect: () => handleHideIdea(item) },
      ]
    }
    if (item.source === 'draft') {
      return [
        { label: 'Edit', Icon: PencilLine, onSelect: () => handlePrimaryAction(item) },
        { label: 'Reschedule', Icon: CalendarDays, onSelect: () => handlePrimaryAction(item) },
        { label: 'Delete', Icon: Trash2, destructive: true, onSelect: () => handleDeleteDraftItem(item) },
      ]
    }
    if (item.source === 'post' && item.badgeType === 'scheduled') {
      return [
        { label: 'Edit', Icon: PencilLine, onSelect: () => handlePrimaryAction(item) },
        { label: 'Reschedule', Icon: CalendarDays, onSelect: () => handlePrimaryAction(item) },
        { label: 'Delete', Icon: Trash2, destructive: true, onSelect: () => handleDeleteCalendarPostItem(item) },
      ]
    }
    if (item.source === 'post') {
      return [
        ...(item.badgeType === 'published' ? [
          { label: item.boostStatus ? 'Boost again' : 'Boost post', Icon: Megaphone, onSelect: () => handleOpenBoost(item) },
        ] : []),
        { label: 'View history', Icon: ArrowUpRight, onSelect: () => navigate('/post/history') },
        { label: 'Delete', Icon: Trash2, destructive: true, onSelect: () => handleDeleteCalendarPostItem(item) },
      ]
    }
    return []
  }

  function handleAddPost(dateString = selectedWeekStartString) {
    const params = new URLSearchParams({
      date: dateString,
      returnTo: 'studio',
      returnView: queueMode === 'month' ? 'month' : 'week',
    })
    navigate(`/post?${params.toString()}`)
  }

  function openStatusView(statusKey) {
    setActiveStatusView(statusKey)
    setSelectedItemId('')
  }

  function chooseCalendarMode(mode) {
    setQueueMode(mode)
    setActiveStatusView('')
    setHoverPreview(null)
  }

  function openCalendarItem(targetItemId) {
    setHoverPreview(null)
    const targetItem = allDetailItems.find((item) => item.id === targetItemId)
    if (targetItem) {
      handlePrimaryAction(targetItem)
    }
  }

  function handleMonthItemClick(dateString, item) {
    if (!item?.targetItemId) {
      handleAddPost(dateString)
      return
    }
    setWeekOffset(getWeekOffsetFromDate(dateString))
    openCalendarItem(item.targetItemId)
  }

  function openCalendarPreview(itemOrId, target) {
    const item = typeof itemOrId === 'string' ? detailItemsById.get(itemOrId) : itemOrId
    if (!item || !target) return

    const rect = target.getBoundingClientRect()
    const previewWidth = Math.min(360, window.innerWidth - 24)
    const previewHeight = 190
    const gap = 12
    const top = Math.min(
      Math.max(12, rect.top + rect.height / 2 - previewHeight / 2),
      window.innerHeight - previewHeight - 12,
    )
    const preferredLeft = rect.right + gap
    const left = preferredLeft + previewWidth > window.innerWidth - 12
      ? Math.max(12, rect.left - previewWidth - gap)
      : preferredLeft

    setHoverPreview({
      item,
      position: { top, left },
    })
  }

  function closeCalendarPreview() {
    setHoverPreview(null)
  }

  const isLoading = profileLoading || postsLoading || draftsLoading || radarLoading || researchSourcesLoading || researchProfileLoading || boostsLoading
  const isRefreshing = isRefetchingPosts || isRefetchingDrafts || isRefetchingRadar
  const isCreating = createRadarDraft.isPending

  useEffect(() => {
    if (isLoading || !clientId || !trainingStatus.shouldPrompt || trainingPromptShownRef.current) return
    trainingPromptShownRef.current = true
    if (!trainingStatus.isVerified) {
      setTrainingPromptOpen(false)
      setTrainAssistantOpen(true)
      return
    }
    setTrainingPromptOpen(true)
  }, [clientId, isLoading, trainingStatus.isVerified, trainingStatus.shouldPrompt])

  useEffect(() => {
    if (!hoverPreview) return undefined

    const closePreview = () => setHoverPreview(null)
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closePreview()
    }

    window.addEventListener('pointerdown', closePreview, true)
    window.addEventListener('scroll', closePreview, true)
    window.addEventListener('wheel', closePreview, { passive: true })
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('map-calendar-row-menu-open', closePreview)

    return () => {
      window.removeEventListener('pointerdown', closePreview, true)
      window.removeEventListener('scroll', closePreview, true)
      window.removeEventListener('wheel', closePreview)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('map-calendar-row-menu-open', closePreview)
    }
  }, [hoverPreview])

  useEffect(() => {
    if (boostItem || trainAssistantOpen || trainingPromptOpen || activeStatusView) {
      setHoverPreview(null)
    }
  }, [activeStatusView, boostItem, trainAssistantOpen, trainingPromptOpen])

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
    <div className="portal-page content-plan-page w-full max-w-none space-y-3 md:p-4 xl:p-5">
      <section className="content-plan-slimbar content-plan-publisher-bar">
        <div className="content-plan-toolbar-left">
          <button
            type="button"
            onClick={() => {
              setWeekOffset(0)
              chooseCalendarMode('week')
            }}
            className="content-plan-toolbar-button"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => chooseCalendarMode('month')}
            className="content-plan-toolbar-button"
            data-active={!activeStatusView && queueMode === 'month'}
          >
            <CalendarDays className="h-4 w-4" />
            Month
          </button>
          <button
            type="button"
            onClick={() => chooseCalendarMode('week')}
            className="content-plan-toolbar-button"
            data-active={!activeStatusView && queueMode === 'week'}
          >
            <Clock3 className="h-4 w-4" />
            Week
          </button>
          <button
            type="button"
            onClick={() => setActionNotice('Use the status pills to filter posts by workflow stage.')}
            className="content-plan-toolbar-button"
          >
            Filter
          </button>
          {['scheduled', 'suggested', 'draft', 'setup'].map((statusKey) => (
            <button
              key={statusKey}
              type="button"
              onClick={() => openStatusView(statusKey)}
              className="content-plan-status-pill"
              data-active={activeStatusView === statusKey}
            >
              {STATUS_VIEW_CONFIG[statusKey].label}
              <span>{statusViewItems[statusKey]?.length || 0}</span>
            </button>
          ))}
        </div>
        <div className="content-plan-actions flex flex-wrap gap-2">
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
              setSourceError('')
              setSourceNotice('')
              setTrainingPromptOpen(false)
              setTrainAssistantOpen(true)
            }}
            className="portal-ai-action portal-ai-action-compact content-plan-train-action inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-semibold"
          >
            <Sparkles className="h-4 w-4" />
            Train your Partner
            {trainingStatus.shouldPrompt ? <span className="content-plan-train-badge">{trainingStatus.isStale ? 'Refresh' : 'Setup'}</span> : null}
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

      {(actionError || actionNotice) && (
        <div
          className="rounded-[14px] px-4 py-3 text-sm font-medium"
          style={actionError
            ? { background: 'rgba(216, 95, 152, 0.1)', color: '#b5487b' }
            : { background: 'rgba(31,169,113,0.1)', color: '#17875b' }}
        >
          {actionError || actionNotice}
        </div>
      )}

      {activeStatusView ? (
        <section className="content-plan-status-page">
          <div className="content-plan-status-head">
            <div>
              <button
                type="button"
                onClick={() => setActiveStatusView('')}
                className="content-plan-toolbar-button"
              >
                Back to calendar
              </button>
              <h2 className="font-display">{activeStatusConfig?.title}</h2>
              <p>{activeStatusConfig?.description}</p>
            </div>
            <Badge type={activeStatusConfig?.badgeType || 'pending'} />
          </div>
          <div className="content-plan-post-list">
            {activeStatusItems.length > 0 ? activeStatusItems.map((item) => (
              <article key={item.id} className="content-plan-post-row">
                <div>
                  <Badge type={item.badgeType} />
                  <h3>{item.detailTitle || item.title}</h3>
                  <p>{item.caption}</p>
                  <div className="content-plan-post-meta">
                    <span>{item.dayLabel}</span>
                    <span>{item.timeLabel}</span>
                    {(item.platforms || []).slice(0, 4).map((platform) => {
                      const marker = PLATFORM_MARKERS[platform]
                      if (!marker) return null
                      const Icon = marker.Icon
                      return (
                        <span key={platform} className="content-plan-platform-chip">
                          <Icon className="h-3.5 w-3.5" style={{ color: marker.color }} />
                          {marker.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrimaryAction(item)}
                    disabled={isCreating}
                    className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                    Edit post
                  </button>
                  {item.source === 'post' && ['scheduled', 'published'].includes(item.badgeType) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCalendarPostItem(item)}
                      disabled={actionBusyId === item.id}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                      style={{ background: 'rgba(196, 85, 110, 0.10)', color: '#b44660', border: '1px solid rgba(196, 85, 110, 0.18)' }}
                    >
                      {actionBusyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            )) : (
              <div className="content-plan-status-empty">
                No posts are in this stage right now.
              </div>
            )}
          </div>
        </section>
      ) : (
      <section className="content-plan-workspace content-plan-calendar-workspace">
        <div className="content-plan-list">
          <div className="content-plan-list-header" style={{ borderColor: 'var(--portal-border)' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                {queueMode === 'month' ? 'Month view' : selectedWeekLabel}
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                {queueMode === 'month' ? getMonthLabel(monthGridDate) : getWeekRangeLabel(selectedWeekStart)}
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
                  onClick={() => chooseCalendarMode(value)}
                  className="content-plan-filter"
                  data-active={queueMode === value}
                >
                  {label}
                </button>
              ))}
            </div>
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
              <button
                type="button"
                onClick={() => setWeekOffset((value) => Math.min(8, value + 1))}
                className="portal-button-secondary inline-flex h-9 w-9 items-center justify-center"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
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
                            onMouseEnter={(event) => openCalendarPreview(item.targetItemId, event.currentTarget)}
                            onMouseLeave={closeCalendarPreview}
                            onFocus={(event) => openCalendarPreview(item.targetItemId, event.currentTarget)}
                            onBlur={closeCalendarPreview}
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
          ) : (
            <div className="content-plan-week-lanes">
              {weekDays.map((day) => {
                const dateString = toDateString(day)
                return (
                  <WeekDayLane
                    key={dateString}
                    day={day}
                    items={weekItemsByDate.get(dateString) || []}
                    selectedItemId={selectedItem?.id || ''}
                    onSelect={openCalendarItem}
                    onAddPost={handleAddPost}
                    getActions={getRowActions}
                    onPreviewOpen={openCalendarPreview}
                    onPreviewClose={closeCalendarPreview}
                  />
                )
              })}
            </div>
          )}
        </div>

        <aside className="content-plan-side-stack">
          <section className="content-plan-load-card">
            <div className="content-plan-side-head">
              <p>Publishing load</p>
              <span>{studioCounts.scheduled + studioCounts.ideas + studioCounts.drafts} active</span>
            </div>
            <div className="content-plan-load-grid">
              <button type="button" onClick={() => openStatusView('scheduled')} className="content-plan-load-button">
                <strong>{studioCounts.scheduled}</strong>
                <span>Scheduled</span>
              </button>
              <button type="button" onClick={() => openStatusView('suggested')} className="content-plan-load-button">
                <strong>{studioCounts.ideas}</strong>
                <span>AI ideas</span>
              </button>
              <button type="button" onClick={() => openStatusView('draft')} className="content-plan-load-button">
                <strong>{studioCounts.drafts}</strong>
                <span>Drafts</span>
              </button>
              <button type="button" onClick={() => openStatusView('approval')} className="content-plan-load-button">
                <strong>{statusViewItems.approval.length}</strong>
                <span>Needs approval</span>
              </button>
            </div>
          </section>

          <section className="content-plan-recommendations-card">
            <div className="content-plan-side-head">
              <p>Use empty days</p>
              <span>{monthOpenCount} open</span>
            </div>
            <div className="content-plan-recommendation-list">
              {radarItems.length > 0 ? radarItems.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePrimaryAction(item)}
                  disabled={isCreating}
                  className="content-plan-recommendation"
                >
                  <span>
                    <Badge type={item.badgeType} />
                    <strong>{item.title}</strong>
                    <small>{item.dayLabel} · {item.timeLabel}</small>
                  </span>
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                </button>
              )) : (
                <div className="content-plan-status-empty">
                  No Partner recommendations are waiting right now.
                </div>
              )}
            </div>
          </section>
        </aside>
      </section>
      )}

      {boostItem || trainAssistantOpen || trainingPromptOpen ? null : <CalendarHoverPreview preview={hoverPreview} />}

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

      {trainAssistantOpen ? (
        <TrainPartnerModal
          client={profile?.clients}
          form={partnerProfileForm}
          sources={researchSources}
          trainingStatus={trainingStatus}
          label={sourceLabel}
          url={sourceUrl}
          sourceType={sourceType}
          isSaving={createSource.isPending}
          isSavingProfile={savePartnerProfile.isPending}
          isVerifying={verifyPartnerTraining.isPending}
          isRequired={trainingIsRequired}
          isStartingRecommendations={isStartingRecommendations}
          recommendationStatus={recommendationStatus}
          busySourceId={busySourceId}
          error={sourceError}
          notice={sourceNotice}
          onClose={() => {
            if (trainingIsRequired) return
            setTrainAssistantOpen(false)
          }}
          onFormChange={(field, value) => setPartnerProfileForm((current) => ({ ...current, [field]: value }))}
          onSaveProfile={handleSavePartnerProfile}
          onVerify={handleVerifyPartnerTraining}
          onLabelChange={setSourceLabel}
          onUrlChange={setSourceUrl}
          onSourceTypeChange={setSourceType}
          onSave={handleSaveSource}
          onToggleSource={handleToggleSource}
          onDeleteSource={handleDeleteSource}
        />
      ) : null}
      {trainingPromptOpen ? (
        <PartnerTrainingPrompt
          trainingStatus={trainingStatus}
          onReview={() => {
            setTrainingPromptOpen(false)
            setSourceError('')
            setSourceNotice('')
            setTrainAssistantOpen(true)
          }}
          onDismiss={() => setTrainingPromptOpen(false)}
        />
      ) : null}
      {boostItem ? (
        <BoostPostModal
          item={boostItem}
          defaultPlatform={(boostItem.platforms || []).find((platform) => ['facebook', 'instagram'].includes(platform)) || (boostItem.platforms || [])[0]}
          readiness={boostReadiness}
          isReadinessLoading={boostReadinessLoading}
          onClose={() => {
            setBoostItem(null)
            setBoostError('')
          }}
          onSubmit={handleLaunchBoost}
          isSaving={launchBoost.isPending}
          error={boostError}
          client={profile?.clients}
        />
      ) : null}
    </div>
  )
}
