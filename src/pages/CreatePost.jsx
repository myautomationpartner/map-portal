import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useOutletContext, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PLATFORM_CATALOG } from '../lib/platformCatalog.jsx'
import {
  deletePost,
  deleteSocialDraft,
  fetchPostById,
  fetchProfile,
  recordPlannerFeedbackEvent,
  reconcileScheduledPosts,
  fetchScheduledPosts,
  fetchSocialDrafts,
  generatePublisherAssist,
  generatePublisherImage,
  improvePublisherImage,
  updateSocialDraft,
  upsertSocialDraft,
} from '../lib/portalApi'
import { openDropboxChooser } from '../lib/dropboxApi'
import { isGooglePickerConfigured, openGoogleImagePicker } from '../lib/googlePickerApi'
import { buildCalendarModel } from '../lib/socialPlanner'
import { buildDraftPayload } from '../lib/socialPlanner'
import {
  extractAngleChoices,
  extractMediaSuggestion,
  generateDraftForSlot,
  getDraftAngleId,
  parseDraftMeta,
  stringifyDraftMeta,
} from '../lib/socialDrafting'
import {
  AlertCircle, ArrowUpRight, Calendar, CalendarDays, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, History, Loader2,
  Send, Sparkles, UploadCloud, Wand2, X,
  Trash2,
} from 'lucide-react'
import { FaMicrosoft } from 'react-icons/fa'
import { SiDropbox, SiGooglephotos, SiIcloud } from 'react-icons/si'

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'

const PHOTO_LIBRARY_LINKS = [
  { label: 'Google', href: 'https://photos.google.com/', action: 'google', Icon: SiGooglephotos, color: '#4285F4' },
  { label: 'Apple Photos', href: 'https://www.icloud.com/photos/', Icon: SiIcloud, color: '#3693F3' },
  { label: 'Dropbox', action: 'dropbox', Icon: SiDropbox, color: '#0061FF' },
  { label: 'OneDrive', href: 'https://onedrive.live.com/', Icon: FaMicrosoft, color: '#00A4EF' },
]

const PLATFORMS = ['facebook', 'instagram', 'google', 'tiktok', 'linkedin', 'twitter']
  .map((id) => PLATFORM_CATALOG[id])
  .filter(Boolean)

const PLATFORM_FORMAT_RULES = {
  facebook: {
    label: 'Facebook',
    maxChars: 63206,
    guidance: 'Community-first copy, 1-3 short paragraphs, clear CTA.',
    media: '1:1 or 4:5 image works well.',
  },
  instagram: {
    label: 'Instagram',
    maxChars: 2200,
    guidance: 'Strong first line, visual-first wording, light hashtags.',
    media: '1:1 safest; 4:5 gets more feed space.',
  },
  google: {
    label: 'Google Business',
    maxChars: 1500,
    guidance: 'Direct local update with booking or learn-more CTA.',
    media: 'Clean image with no heavy text overlay.',
  },
  tiktok: {
    label: 'TikTok',
    maxChars: 2200,
    guidance: 'Short caption, video/slideshow mindset, few hashtags.',
    media: '9:16 video or slideshow is preferred.',
  },
  linkedin: {
    label: 'LinkedIn',
    maxChars: 3000,
    guidance: 'Professional credibility angle, community or business impact.',
    media: '1.91:1 or 1:1 image works well.',
  },
  twitter: {
    label: 'X / Twitter',
    maxChars: 280,
    guidance: 'Punchy, link-aware, one clear thought.',
    media: 'Image optional; keep copy under 280 characters.',
  },
}

const PLATFORM_IMAGE_TARGETS = {
  facebook: { label: 'Facebook feed', aspectRatio: '4:5', width: 1080, height: 1350, guidance: 'Tall feed crop for stronger mobile presence.' },
  instagram: { label: 'Instagram feed', aspectRatio: '4:5', width: 1080, height: 1350, guidance: 'Feed-safe portrait crop.' },
  google: { label: 'Google Business', aspectRatio: '1:1', width: 1080, height: 1080, guidance: 'Clean square image for local updates.' },
  tiktok: { label: 'TikTok vertical', aspectRatio: '9:16', width: 1080, height: 1920, guidance: 'Vertical crop for TikTok/Reels-style viewing.' },
  linkedin: { label: 'LinkedIn feed', aspectRatio: '1.91:1', width: 1200, height: 628, guidance: 'Wide professional feed crop.' },
  twitter: { label: 'X / Twitter', aspectRatio: '16:9', width: 1200, height: 675, guidance: 'Wide timeline crop.' },
}

const ASSIST_ACTIONS = [
  { id: 'improve', label: 'Improve', description: 'Clean up the caption and make it stronger.' },
  { id: 'shorten', label: 'Shorten', description: 'Keep the idea, cut the extra words.' },
  { id: 'engaging', label: 'More engaging', description: 'Add energy without sounding generic.' },
  { id: 'cta', label: 'Add CTA', description: 'Give readers a clearer next step.' },
  { id: 'variants', label: '3 versions', description: 'Create three different options.' },
  { id: 'platform', label: 'Platform-aware', description: 'Tune it for the selected channels.' },
]

const IMAGE_ASSIST_ACTIONS = [
  { id: 'cleanup', label: 'Clean up', description: 'Improve light, crop, contrast, and sharpness.' },
  { id: 'social', label: 'Make social-ready', description: 'Polish it into a stronger post creative.' },
  { id: 'branded', label: 'Brand polish', description: 'Add a subtle professional MAP-style finish.' },
  { id: 'square', label: 'Square crop', description: 'Create a 1:1 social post version.' },
  { id: 'story', label: 'Story crop', description: 'Create a vertical story/reel-friendly version.' },
]

const SLOT_STATE_STYLES = {
  occupied_planned: {
    label: 'Scheduled',
    background: 'rgba(55, 181, 140, 0.12)',
    color: '#2d876a',
    border: 'rgba(55, 181, 140, 0.2)',
  },
  occupied_draft: {
    label: 'Draft Saved',
    background: 'rgba(201, 168, 76, 0.14)',
    color: '#8c6d1c',
    border: 'rgba(201, 168, 76, 0.22)',
  },
  recommended_fill: {
    label: 'Open',
    background: 'rgba(93, 120, 255, 0.12)',
    color: '#4058c9',
    border: 'rgba(93, 120, 255, 0.2)',
  },
  unavailable_constraint_blocked: {
    label: 'Blocked',
    background: 'rgba(26, 24, 20, 0.08)',
    color: '#5e554d',
    border: 'rgba(26, 24, 20, 0.14)',
  },
}

function isImageAttachment(file) {
  return /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file?.name || '')
}

function getDropboxRenderableImageUrl(link) {
  if (!link) return null

  try {
    const url = new URL(link)
    url.searchParams.delete('dl')
    url.searchParams.set('raw', '1')
    return url.toString()
  } catch {
    return link
  }
}

function getDropboxPreviewSource(attachments) {
  const imageAttachment = (attachments || []).find((file) => isImageAttachment(file))
  if (!imageAttachment) return null
  return getDropboxRenderableImageUrl(imageAttachment.link) || imageAttachment.thumbnail || null
}

function getDropboxThumbSource(file) {
  if (!file) return null
  return getDropboxRenderableImageUrl(file.thumbnail) || null
}

function buildDropboxMediaItem(file, index = 0) {
  if (!file) return null
  const previewUrl = getDropboxRenderableImageUrl(file.link) || getDropboxThumbSource(file)
  return {
    id: `dropbox:${file.link || file.name || index}`,
    type: 'dropbox',
    name: file.name || `Dropbox image ${index + 1}`,
    previewUrl,
    thumbUrl: getDropboxThumbSource(file) || previewUrl,
    link: file.link,
    file,
  }
}

function buildExistingMediaItem(url) {
  if (!url) return null
  return {
    id: `existing:${url}`,
    type: 'existing',
    name: 'Current image',
    previewUrl: url,
    link: url,
  }
}

function clampIndex(index, count) {
  if (!count) return 0
  return Math.min(Math.max(index, 0), count - 1)
}

function base64ToImageFile(base64, mimeType = 'image/png', filename = 'generated-post-image.png') {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], filename, { type: mimeType })
}

function dataUrlToFile(dataUrl, filename = 'platform-image.png') {
  const match = String(dataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (!match) throw new Error('Could not prepare the platform image.')
  return base64ToImageFile(match[2], match[1], filename)
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target?.result || '')
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(source, { crossOrigin = false } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (crossOrigin) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not prepare the selected image for Image Assist.'))
    image.src = source
  })
}

async function normalizeImageForAssist(source) {
  const image = await loadImageElement(source)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Could not read the selected image size.')
  }

  const maxDimension = 2048
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare the selected image for Image Assist.')

  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

function centerCropRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = targetWidth / targetHeight

  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio
    return { sx: (sourceWidth - width) / 2, sy: 0, sw: width, sh: sourceHeight }
  }

  const height = sourceWidth / targetRatio
  return { sx: 0, sy: (sourceHeight - height) / 2, sw: sourceWidth, sh: height }
}

async function cropImageForTarget(source, target) {
  const image = await loadImageElement(source, { crossOrigin: /^https?:\/\//i.test(source) })
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) throw new Error('Could not read the selected image size.')

  const { sx, sy, sw, sh } = centerCropRect(sourceWidth, sourceHeight, target.width, target.height)
  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not format this image for platforms.')

  context.fillStyle = '#f4f1ec'
  context.fillRect(0, 0, target.width, target.height)
  context.drawImage(image, sx, sy, sw, sh, 0, 0, target.width, target.height)
  return canvas.toDataURL('image/png')
}

function getDraftMetaImagePrompt(draft) {
  const meta = parseDraftMeta(draft?.review_notes)
  if (typeof meta?.radarAction?.imagePrompt === 'string' && meta.radarAction.imagePrompt.trim()) {
    return meta.radarAction.imagePrompt.trim()
  }
  return ''
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

function isMissingRemoteDelete(payload, raw) {
  const message = [
    payload?.message,
    payload?.error,
    raw,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return message.includes('404') && message.includes('post not found')
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return null
  const [, year, month, day] = match
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  }
}

function parseLocalDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '')
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  }
}

function formatCalendarDate(dateString) {
  const parsed = parseDateOnly(dateString)
  if (!parsed) return dateString
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0))
  if (Number.isNaN(date.getTime())) return dateString

  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date)
  } catch {
    return dateString
  }
}

function formatMonthLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Calendar'

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return 'Calendar'
  }
}

function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildMonthGrid(baseDate) {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - startOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return {
      key: toDateKey(date),
      label: date.getDate(),
      date,
      inMonth: date.getMonth() === month,
      isToday: toDateKey(date) === toDateKey(new Date()),
    }
  })
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function formatLocalDateTime(value) {
  const parsed = parseLocalDateTime(value)
  if (!parsed) return 'Pick a calendar slot'
  const date = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute)
  if (Number.isNaN(date.getTime())) return 'Pick a calendar slot'

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  } catch {
    return 'Pick a calendar slot'
  }
}

function formatDetailedLocalDateTime(value) {
  const parsed = parseLocalDateTime(value)
  if (!parsed) return 'Pick a calendar slot'
  const date = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute)
  if (Number.isNaN(date.getTime())) return 'Pick a calendar slot'

  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  } catch {
    return formatLocalDateTime(value)
  }
}

function localDateTimeToIso(value) {
  const parsed = parseLocalDateTime(value)
  if (!parsed) {
    throw new Error('Please choose a valid schedule time from the calendar.')
  }

  const scheduled = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute)
  if (Number.isNaN(scheduled.getTime())) {
    throw new Error('Please choose a valid schedule time from the calendar.')
  }

  return scheduled.toISOString()
}

function normalizeTimeForInput(value) {
  const match = /^(\d{2}):(\d{2})/.exec(value || '')
  return match ? `${match[1]}:${match[2]}` : ''
}

function slotToInputValue(slot) {
  const time = normalizeTimeForInput(slot?.slot_start_local)
  return slot?.slot_date_local && time ? `${slot.slot_date_local}T${time}` : ''
}

function isoToLocalInputValue(value, timeZone) {
  if (!value) return ''

  try {
    const parts = getDatePartsForZone(new Date(value), timeZone || 'America/New_York')
    return `${parts.date}T${parts.time}`
  } catch {
    return ''
  }
}

function getMinScheduleValue() {
  const threshold = new Date(Date.now() + 5 * 60_000)
  threshold.setSeconds(0, 0)
  const local = new Date(threshold.getTime() - threshold.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function getSlotKey(slot) {
  return slot ? `${slot.slot_date_local}::${slot.slot_label}` : ''
}

function buildSlotFromDraft(draft) {
  if (!draft) return null

  return {
    slot_date_local: draft.slot_date_local,
    slot_label: draft.slot_label,
    slot_start_local: draft.slot_start_local,
    slot_end_local: draft.slot_end_local,
    timezone: draft.timezone,
    scheduled_for: draft.scheduled_for,
    post_type: draft.post_type,
    state: 'occupied_draft',
    explanation: 'Draft created from Opportunity Radar.',
  }
}

function getDatePartsForZone(value, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function buildPublishErrorMessage(payload, fallbackText, timingMode) {
  const fallback = String(fallbackText || '').trim()
  if (!fallback && (!payload || Object.keys(payload).length === 0)) {
    return 'Publish webhook returned an empty response from n8n. Check the Social Publisher (Zernio) workflow response.'
  }

  const normalizeReason = (value) => {
    if (!value) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'object') {
      return String(
        value.error
        || value.message
        || value.detail
        || value.details?.error
        || value.details?.message
        || value.details
        || '',
      ).trim()
    }
    return String(value).trim()
  }

  const failedEntries = [
    ...(Array.isArray(payload?.platformResults) ? payload.platformResults : []),
    ...(Array.isArray(payload?.results) ? payload.results : []),
    ...(Array.isArray(payload?.platforms) ? payload.platforms : []),
  ]
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const platform = entry.platform || entry.name || entry.id || 'Platform'
      const status = String(entry.status || '').toLowerCase()
      const reason = normalizeReason(entry.error || entry.message || entry.detail || entry.details || '')
      return {
        platform,
        failed: status.includes('fail') || status.includes('error') || Boolean(reason),
        reason,
      }
    })
    .filter((entry) => entry.failed)

  if (failedEntries.length > 0) {
    const summary = failedEntries
      .slice(0, 4)
      .map((entry) => `${entry.platform}: ${entry.reason || 'failed'}`)
      .join('; ')
    return failedEntries.length === 1 ? summary : `Platform errors: ${summary}`
  }

  const messageCandidates = [
    normalizeReason(payload?.message),
    normalizeReason(payload?.error),
    normalizeReason(payload?.details),
    normalizeReason(payload?.detail),
    fallback,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  const generic = timingMode === 'now' ? 'Publishing failed. Please try again.' : 'Scheduling failed. Please try again.'
  return messageCandidates[0] || generic
}

function findDraftForSlot(drafts, slot) {
  if (!slot) return null
  return drafts.find((draft) => draft.slot_date_local === slot.slot_date_local && draft.slot_label === slot.slot_label) || null
}

function buildDraftTitle(postType, angleChoices, angleId) {
  const chosen = angleChoices.find((choice) => choice.id === angleId)
  const readablePostType = (postType || 'draft').replace(/_/g, ' ')
  return chosen ? `${readablePostType} · ${chosen.label}` : readablePostType
}

function getCaptionDeltaRatio(originalCaption, nextCaption) {
  const before = (originalCaption || '').trim()
  const after = (nextCaption || '').trim()
  if (!before && !after) return 0
  const baseline = Math.max(before.length, after.length, 1)
  return Math.abs(before.length - after.length) / baseline
}

function normalizeCaption(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripHashtags(value) {
  return normalizeCaption(value).replace(/(^|\s)#[\w-]+/g, '').replace(/\s{2,}/g, ' ').trim()
}

function truncateCaption(value, maxChars) {
  const text = normalizeCaption(value)
  if (!maxChars || text.length <= maxChars) return text
  const limit = Math.max(0, maxChars - 1)
  const slice = text.slice(0, limit)
  const boundary = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'))
  return `${slice.slice(0, boundary > limit * 0.72 ? boundary : limit).trim()}…`
}

function sentenceParts(value) {
  return normalizeCaption(value)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function buildLocalHashtags(profile) {
  const client = profile?.clients || {}
  const tags = []
  const businessType = String(client.business_type || client.business_subtype || '').toLowerCase()
  const cityOrArea = String(client.county || client.state_code || '').replace(/[^a-z0-9]/gi, '')

  if (businessType.includes('dance')) tags.push('#DanceStudio', '#DanceLife')
  if (cityOrArea) tags.push(`#${cityOrArea}`)
  if (!tags.length) tags.push('#LocalBusiness')

  return [...new Set(tags)].slice(0, 4)
}

function formatCaptionForPlatform(platformId, caption, profile) {
  const base = normalizeCaption(caption)
  const noTags = stripHashtags(base)
  const firstSentence = sentenceParts(noTags)[0] || noTags
  const businessName = profile?.clients?.business_name || 'our team'

  if (!base) return ''

  switch (platformId) {
    case 'instagram': {
      const hashtags = buildLocalHashtags(profile)
      const captionWithTags = /#[\w-]+/.test(base)
        ? base
        : `${base}\n\n${hashtags.join(' ')}`
      return truncateCaption(captionWithTags, PLATFORM_FORMAT_RULES.instagram.maxChars)
    }
    case 'google':
      return truncateCaption(noTags, PLATFORM_FORMAT_RULES.google.maxChars)
    case 'tiktok': {
      const short = truncateCaption(firstSentence || noTags, 180)
      const tags = buildLocalHashtags(profile).slice(0, 2)
      return truncateCaption(`${short} ${tags.join(' ')}`.trim(), PLATFORM_FORMAT_RULES.tiktok.maxChars)
    }
    case 'linkedin': {
      const intro = noTags.toLowerCase().includes(String(businessName).toLowerCase())
        ? noTags
        : `${businessName} update: ${noTags}`
      return truncateCaption(intro, PLATFORM_FORMAT_RULES.linkedin.maxChars)
    }
    case 'twitter':
      return truncateCaption(noTags, PLATFORM_FORMAT_RULES.twitter.maxChars)
    case 'facebook':
    default:
      return truncateCaption(base, PLATFORM_FORMAT_RULES.facebook.maxChars)
  }
}

function buildPlatformVariants(platformIds, caption, profile, existingVariants = {}) {
  return platformIds.reduce((variants, platformId) => {
    const existing = existingVariants?.[platformId] || {}
    variants[platformId] = {
      ...existing,
      caption: existing.caption || formatCaptionForPlatform(platformId, caption, profile),
      format: platformId,
      rules: PLATFORM_FORMAT_RULES[platformId] || null,
      generated_at: existing.generated_at || new Date().toISOString(),
    }
    return variants
  }, {})
}

function PlatformPreview({ platformId, profile, content, imagePreview, dropboxAttachments, scheduledFor, platformImage }) {
  const platform = PLATFORMS.find((item) => item.id === platformId)
  if (!platform) return null

  const businessName = profile?.clients?.business_name || 'Your Business'
  const previewTime = scheduledFor ? formatDetailedLocalDateTime(scheduledFor) : 'Ready to publish'
  const attachmentCount = dropboxAttachments.length
  const visualPreview = platformImage?.url || platformImage?.preview_url || imagePreview || getDropboxPreviewSource(dropboxAttachments)
  const Icon = platform.Icon
  const rules = PLATFORM_FORMAT_RULES[platformId] || {}
  const platformMeta = {
    instagram: { label: 'Feed post', badge: visualPreview ? 'Media first' : 'Needs image', handlePrefix: '@' },
    facebook: { label: 'Community post', badge: visualPreview ? 'Feed ready' : 'Text post', handlePrefix: '' },
    google: { label: 'Business update', badge: 'Local update', handlePrefix: '' },
    tiktok: { label: 'Vertical caption', badge: visualPreview ? 'Video/photo' : 'Caption only', handlePrefix: '@' },
    linkedin: { label: 'Professional update', badge: visualPreview ? 'Feed media' : 'Text update', handlePrefix: '' },
    twitter: { label: 'Timeline post', badge: visualPreview ? 'Media post' : 'Text post', handlePrefix: '@' },
  }[platformId] || { label: 'Preview', badge: 'Draft', handlePrefix: '' }
  const handle = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'business'
  const caption = content || 'Your caption preview will appear here.'

  return (
    <div
      className="platform-preview-card"
      data-platform={platformId}
      style={{
        '--platform-accent': platform.accent,
        '--platform-soft': platform.soft,
      }}
    >
      <div className="platform-preview-accent" />
      <header className="platform-preview-header">
        <div className="platform-preview-icon">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="platform-preview-title-row">
            <p>{businessName}</p>
            <span>{platform.shortLabel}</span>
          </div>
          <p className="platform-preview-subtitle">
            {platformMeta.handlePrefix ? `${platformMeta.handlePrefix}${handle} · ` : ''}{platformMeta.label}
          </p>
        </div>
      </header>

      <div className="platform-preview-media" data-empty={!visualPreview}>
        {visualPreview ? (
          <img src={visualPreview} alt={`${platform.label} preview`} />
        ) : (
          <div>
            <Icon className="h-5 w-5" />
            <p>{rules.media || 'Add an image to preview the final creative.'}</p>
          </div>
        )}
        <span>{platformMeta.badge}</span>
      </div>

      <div className="platform-preview-copy">
        <p className="whitespace-pre-wrap">
          {platformId === 'instagram' && content ? <strong>{businessName} </strong> : null}
          {caption}
        </p>
      </div>

      <footer className="platform-preview-footer">
        <span>{previewTime}</span>
        <span>{attachmentCount > 1 ? `${attachmentCount} assets` : rules.label || platform.label}</span>
      </footer>
    </div>
  )
}

function ReviewModal({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  profile,
  content,
  imagePreview,
  dropboxAttachments,
  selectedPlatforms,
  setSelectedPlatforms,
  previewPlatform,
  setPreviewPlatform,
  timingMode,
  scheduledFor,
  platformCaptions,
  platformImageVariants,
}) {
  if (!open) return null

  const activePlatforms = Object.entries(selectedPlatforms)
    .filter(([, enabled]) => enabled)
    .map(([platformId]) => platformId)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(9,7,4,0.58)] p-3 md:items-center md:p-6">
      <div
        className="max-h-[92vh] w-full max-w-[980px] overflow-y-auto rounded-[34px] p-5 md:p-7"
        style={{ background: 'rgba(248,244,238,0.98)', border: '1px solid var(--portal-border)', boxShadow: '0 30px 80px rgba(16, 12, 7, 0.28)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
              Final approval
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Choose platforms and review the post
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
              Each platform preview is slightly different so you can approve what it will feel like before it goes out.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'rgba(26,24,20,0.06)', color: 'var(--portal-text)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-[28px] p-4" style={{ background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                Platforms
              </p>
              <div className="mt-3 space-y-2">
                {PLATFORMS.map(({ id, label, Icon, accent, soft }) => {
                  const active = selectedPlatforms[id]
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        const nextValue = !selectedPlatforms[id]
                        const next = { ...selectedPlatforms, [id]: nextValue }
                        setSelectedPlatforms(next)
                        if (nextValue) {
                          setPreviewPlatform(id)
                          return
                        }

                        if (previewPlatform === id) {
                          const nextActive = Object.entries(next).find(([, enabled]) => enabled)?.[0] || ''
                          setPreviewPlatform(nextActive)
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all"
                      style={active
                        ? { background: soft, border: `2px solid ${accent}88`, color: accent, fontWeight: 950 }
                        : { background: 'rgba(255,255,255,0.82)', border: '1px solid var(--portal-border)', color: 'var(--portal-text-muted)' }}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: active ? accent : 'rgba(26,24,20,0.08)' }}>
                        <Icon className="h-4 w-4" style={{ color: active ? '#fff' : accent }} />
                      </div>
                      <span className="flex-1 text-sm font-semibold">{label}</span>
                      <div
                        className="flex h-4 w-4 items-center justify-center rounded-full border-2"
                        style={active ? { borderColor: accent, background: accent } : { borderColor: 'var(--portal-border-strong)' }}
                      >
                        {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[28px] p-4" style={{ background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                Timing
              </p>
              <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                {timingMode === 'now' ? 'Publish now' : formatDetailedLocalDateTime(scheduledFor)}
              </p>
              {timingMode !== 'now' && scheduledFor && (
                <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                  This will schedule the post for {formatDetailedLocalDateTime(scheduledFor)}.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {activePlatforms.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {activePlatforms.map((platformId) => {
                    const platform = PLATFORMS.find((item) => item.id === platformId)
                    if (!platform) return null
                    const Icon = platform.Icon

                    return (
                      <button
                        key={platformId}
                        type="button"
                        onClick={() => setPreviewPlatform(platformId)}
                        className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em]"
                        style={previewPlatform === platformId
                          ? { background: platform.soft, color: platform.accent, border: `2px solid ${platform.accent}88`, fontWeight: 950 }
                          : { background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text-soft)', border: '1px solid var(--portal-border)' }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {platform.label}
                      </button>
                    )
                  })}
                </div>

                <PlatformPreview
                  platformId={previewPlatform}
                  profile={profile}
                  content={platformCaptions?.[previewPlatform] || content}
                  imagePreview={imagePreview}
                  dropboxAttachments={dropboxAttachments}
                  scheduledFor={scheduledFor}
                  platformImage={platformImageVariants?.[previewPlatform]}
                />
              </>
            ) : (
              <div className="rounded-[28px] p-6 text-sm" style={{ background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)', color: 'var(--portal-text-muted)' }}>
                Select at least one platform to preview and approve.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-2xl px-4 py-3 text-sm font-semibold"
            style={{ background: 'rgba(26,24,20,0.06)', color: 'var(--portal-text)' }}
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || activePlatforms.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {timingMode === 'now' ? 'Publishing…' : 'Scheduling…'}
              </>
            ) : (
              <>
                {timingMode === 'now' ? <Send className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                {timingMode === 'now' ? 'Approve & Publish' : 'Approve & Schedule'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CreatePost() {
  const { requireWriteAccess } = useOutletContext()

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') || ''
  const returnView = searchParams.get('returnView') || ''
  const fileInputRef = useRef(null)
  const composerRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const hydratingDraftRef = useRef(false)

  const [content, setContent] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [localImageItems, setLocalImageItems] = useState([])
  const [mediaSlideIndex, setMediaSlideIndex] = useState(0)
  const [imageGenerateState, setImageGenerateState] = useState('idle')
  const [imageGenerateError, setImageGenerateError] = useState('')
  const [imageImproveState, setImageImproveState] = useState('idle')
  const [imageImproveMode, setImageImproveMode] = useState('')
  const [imageImproveError, setImageImproveError] = useState('')
  const [dropboxAttachments, setDropboxAttachments] = useState([])
  const [timingMode, setTimingMode] = useState('slot')
  const [selectedPlatforms, setSelectedPlatforms] = useState({
    facebook: false,
    instagram: false,
    google: false,
    tiktok: false,
    linkedin: false,
    twitter: false,
  })
  const [scheduledFor, setScheduledFor] = useState('')
  const [submitState, setSubmitState] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [publishResult, setPublishResult] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [previewPlatform, setPreviewPlatform] = useState('')
  const [selectedDay, setSelectedDay] = useState('')
  const [viewedMonth, setViewedMonth] = useState(() => startOfMonth(new Date()))
  const [activeDraftId, setActiveDraftId] = useState('')
  const [activeSlotKey, setActiveSlotKey] = useState('')
  const [selectedAngleId, setSelectedAngleId] = useState('')
  const [angleChoices, setAngleChoices] = useState([])
  const [mediaSuggestion, setMediaSuggestion] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [draftDirty, setDraftDirty] = useState(false)
  const [generatedCaption, setGeneratedCaption] = useState('')
  const [editingScheduledPostId, setEditingScheduledPostId] = useState('')
  const [editingScheduledPostRef, setEditingScheduledPostRef] = useState('')
  const [existingMediaUrl, setExistingMediaUrl] = useState('')
  const [deleteBusyKey, setDeleteBusyKey] = useState('')
  const [assistState, setAssistState] = useState('idle')
  const [assistAction, setAssistAction] = useState('')
  const [assistError, setAssistError] = useState('')
  const [assistSuggestions, setAssistSuggestions] = useState([])
  const [platformVariants, setPlatformVariants] = useState({})
  const [platformFormatStatus, setPlatformFormatStatus] = useState('')
  const [imageFormatState, setImageFormatState] = useState('idle')
  const [imageFormatStatus, setImageFormatStatus] = useState('')

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id
  const draftTargetDate = searchParams.get('date') || ''
  const draftTargetSlot = searchParams.get('slot') || ''
  const draftTargetId = searchParams.get('draftId') || ''
  const editTargetPostId = searchParams.get('editPost') || ''

  const { data: scheduledPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['calendar-posts', clientId],
    queryFn: async () => {
      await reconcileScheduledPosts(clientId)
      return fetchScheduledPosts(clientId)
    },
    enabled: !!clientId,
  })

  const { data: drafts = [], isLoading: draftsLoading } = useQuery({
    queryKey: ['social-drafts', clientId],
    queryFn: () => fetchSocialDrafts(clientId),
    enabled: !!clientId,
  })

  const { data: connections = [] } = useQuery({
    queryKey: ['social-connections', clientId],
    queryFn: () => fetchConnections(clientId),
    enabled: !!clientId,
  })

  const calendar = useMemo(() => {
    if (!profile) return null
    try {
      return buildCalendarModel(profile, scheduledPosts, drafts, draftTargetDate
        ? { startDate: new Date(`${draftTargetDate}T12:00:00`), horizonDays: 7 }
        : undefined)
    } catch (error) {
      return { error }
    }
  }, [profile, scheduledPosts, drafts, draftTargetDate])

  const groupedSlots = useMemo(() => {
    if (!calendar?.slots) return []
    const groups = new Map()
    for (const slot of calendar.slots) {
      if (!groups.has(slot.slot_date_local)) groups.set(slot.slot_date_local, [])
      groups.get(slot.slot_date_local).push(slot)
    }
    return [...groups.entries()]
  }, [calendar])

  const slotsByDate = useMemo(() => new Map(groupedSlots), [groupedSlots])
  const monthGrid = useMemo(() => buildMonthGrid(viewedMonth), [viewedMonth])

  const activePlatforms = Object.entries(selectedPlatforms)
    .filter(([, enabled]) => enabled)
    .map(([platformId]) => platformId)
  const connectedPlatformIds = useMemo(
    () => new Set(connections.map((connection) => connection.platform).filter(Boolean)),
    [connections],
  )
  const connectedActivePlatforms = activePlatforms.filter((platformId) => connectedPlatformIds.has(platformId))
  const disconnectedActivePlatforms = activePlatforms.filter((platformId) => !connectedPlatformIds.has(platformId))

  const charLimit = selectedPlatforms.google ? 1500 : 2200
  const charOver = content.length > charLimit
  const charPercent = Math.min((content.length / charLimit) * 100, 100)
  const isSubmitting = submitState === 'uploading' || submitState === 'posting'
  const minScheduleValue = getMinScheduleValue()
  const googlePickerReady = isGooglePickerConfigured()
  const creativeItems = useMemo(() => {
    const items = []
    if (localImageItems.length) {
      items.push(...localImageItems)
    } else if (imagePreview && !existingMediaUrl) {
      items.push({
        id: 'image-preview',
        type: imageFile ? 'local' : 'generated',
        name: imageFile?.name || 'Selected image',
        previewUrl: imagePreview,
        file: imageFile,
      })
    }
    const existingItem = localImageItems.length || imagePreview ? null : buildExistingMediaItem(existingMediaUrl)
    if (existingItem) items.push(existingItem)
    dropboxAttachments.forEach((file, index) => {
      const item = buildDropboxMediaItem(file, index)
      if (item) items.push(item)
    })
    return items
  }, [dropboxAttachments, existingMediaUrl, imageFile, imagePreview, localImageItems])
  const activeCreativeIndex = clampIndex(mediaSlideIndex, creativeItems.length)
  const activeCreativeItem = creativeItems[activeCreativeIndex] || null
  const dropboxPreviewSource = activeCreativeItem?.type === 'dropbox'
    ? activeCreativeItem.previewUrl
    : getDropboxPreviewSource(dropboxAttachments)
  const mediaPreviewSource = activeCreativeItem?.previewUrl || imagePreview || existingMediaUrl
  const canImproveImage = Boolean(clientId && mediaPreviewSource && !isSubmitting)
  const selectedDaySlots = selectedDay ? (slotsByDate.get(selectedDay) || []) : []
  const selectableDaySlots = selectedDaySlots.filter((slot) => ['recommended_fill', 'occupied_draft'].includes(slot.state))
  const activeSlot = useMemo(() => {
    if (!activeSlotKey || !calendar?.slots) return null
    return calendar.slots.find((slot) => getSlotKey(slot) === activeSlotKey) || null
  }, [activeSlotKey, calendar])
  const activeDraft = useMemo(() => drafts.find((draft) => draft.id === activeDraftId) || findDraftForSlot(drafts, activeSlot), [activeDraftId, drafts, activeSlot])
  const imageGenerationPrompt = useMemo(
    () => getDraftMetaImagePrompt(activeDraft) || mediaSuggestion,
    [activeDraft, mediaSuggestion],
  )
  const canGenerateImage = Boolean(clientId && content.trim() && imageGenerationPrompt)
  const canUseAssist = Boolean(clientId && content.trim() && !isSubmitting)
  const scheduledPostsDetailed = useMemo(() => {
    const timezone = calendar?.policy?.timezone || profile?.clients?.timezone || 'America/New_York'

    return scheduledPosts.flatMap((post) => {
      if (!post?.scheduled_for) return []
      try {
        const parts = getDatePartsForZone(new Date(post.scheduled_for), timezone)
        return [{
          ...post,
          localDate: parts.date,
          localTime: parts.time,
        }]
      } catch {
        return []
      }
    })
  }, [scheduledPosts, calendar?.policy?.timezone, profile?.clients?.timezone])
  const scheduledPostsByDate = useMemo(() => {
    const byDate = new Map()

    for (const post of scheduledPostsDetailed) {
      if (!byDate.has(post.localDate)) byDate.set(post.localDate, [])
      byDate.get(post.localDate).push(post)
    }

    return byDate
  }, [scheduledPostsDetailed])
  const scheduledPostsForSelectedDay = selectedDay ? (scheduledPostsByDate.get(selectedDay) || []) : []
  const editingScheduledPost = useMemo(
    () => scheduledPostsDetailed.find((post) => post.id === editingScheduledPostId) || null,
    [scheduledPostsDetailed, editingScheduledPostId],
  )
  const scheduledPostCount = useMemo(
    () => scheduledPostsDetailed.filter((post) => post.status === 'scheduled').length,
    [scheduledPostsDetailed],
  )

  const timingSummary = timingMode === 'now'
    ? 'Publishing as soon as you approve'
    : scheduledFor
      ? formatDetailedLocalDateTime(scheduledFor)
      : timingMode === 'custom'
        ? 'Choose any date and time'
        : 'Pick a slot from the calendar'
  const platformCaptions = useMemo(() => {
    return Object.fromEntries(
      activePlatforms.map((platformId) => [
        platformId,
        platformVariants?.[platformId]?.caption || formatCaptionForPlatform(platformId, content, profile),
      ]),
    )
  }, [activePlatforms, platformVariants, content, profile])
  const platformImageVariants = useMemo(() => {
    return Object.fromEntries(
      activePlatforms
        .map((platformId) => [platformId, platformVariants?.[platformId]?.image])
        .filter(([, image]) => Boolean(image?.preview_url || image?.url)),
    )
  }, [activePlatforms, platformVariants])

  useEffect(() => {
    if (mediaSlideIndex >= creativeItems.length && creativeItems.length > 0) {
      setMediaSlideIndex(creativeItems.length - 1)
    }
  }, [creativeItems.length, mediaSlideIndex])

  useEffect(() => {
    if (!activePlatforms.includes(previewPlatform)) {
      setPreviewPlatform(activePlatforms[0] || '')
    }
  }, [activePlatforms, previewPlatform])

  useEffect(() => {
    if (!selectedDay && groupedSlots[0]?.[0]) {
      setSelectedDay(groupedSlots[0][0])
    }
  }, [groupedSlots, selectedDay])

  useEffect(() => {
    if (!selectedDay) return
    const parsed = parseDateOnly(selectedDay)
    if (!parsed) return
    setViewedMonth(new Date(parsed.year, parsed.month - 1, 1))
  }, [selectedDay])

  const applyDraftToComposer = useCallback((draft, slot) => {
    const meta = parseDraftMeta(draft?.review_notes)
    hydratingDraftRef.current = true
    setActiveDraftId(draft.id || '')
    setActiveSlotKey(getSlotKey(slot))
    setSelectedAngleId(getDraftAngleId(draft))
    setAngleChoices(extractAngleChoices(draft))
    setMediaSuggestion(extractMediaSuggestion(draft))
    setGeneratedCaption(draft.draft_caption || '')
    setContent(draft.draft_caption || '')
    setPlatformVariants(meta.platformVariants || {})
    setPlatformFormatStatus(meta.platformVariants ? 'Saved platform captions loaded.' : '')
    setDraftDirty(false)
    setDraftStatus(draft.draft_caption ? 'Draft loaded.' : 'Draft ready.')
    setDraftError('')
    setTimingMode('slot')
    setScheduledFor(slotToInputValue(slot))
    setSelectedDay(slot.slot_date_local)
    const parsed = parseDateOnly(slot.slot_date_local)
    if (parsed) setViewedMonth(new Date(parsed.year, parsed.month - 1, 1))

    window.setTimeout(() => {
      hydratingDraftRef.current = false
    }, 0)
  }, [])

  const applyGeneratedDraftToComposer = useCallback((generated, slot, draftId = '') => {
    hydratingDraftRef.current = true
    setActiveDraftId(draftId)
    setActiveSlotKey(getSlotKey(slot))
    setSelectedAngleId(generated.angle.id)
    setAngleChoices(generated.angleChoices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      shortLabel: choice.shortLabel,
    })))
    setMediaSuggestion(generated.mediaSuggestion)
    setGeneratedCaption(generated.caption)
    setContent(generated.caption)
    setPlatformVariants({})
    setPlatformFormatStatus('')
    setDraftDirty(false)
    setDraftError('')
    setTimingMode('slot')
    setScheduledFor(slotToInputValue(slot))
    setSelectedDay(slot.slot_date_local)
    const parsed = parseDateOnly(slot.slot_date_local)
    if (parsed) setViewedMonth(new Date(parsed.year, parsed.month - 1, 1))

    window.setTimeout(() => {
      hydratingDraftRef.current = false
    }, 0)
  }, [])

  const recordPlannerFeedbackSafely = useCallback(async (event, options = {}) => {
    if (!clientId || !event?.postType || !event?.eventType) return

    try {
      await recordPlannerFeedbackEvent({
        clientId,
        ...event,
      })

      if (options.invalidateProfile) {
        await queryClient.invalidateQueries({ queryKey: ['profile'] })
      }
    } catch (error) {
      console.error('[PlannerFeedback]', error)
    }
  }, [clientId, queryClient])

  const resolveDraftForSlot = useCallback(async (slot, options = {}) => {
    if (!profile || !calendar?.policy) return

    const preferredAngleId = options.preferredAngleId || ''
    const existingDraft = findDraftForSlot(drafts, slot)
    const existingMediaSuggestion = existingDraft ? extractMediaSuggestion(existingDraft) : ''
    const existingAngleChoices = existingDraft ? extractAngleChoices(existingDraft) : []
    const shouldGenerate =
      !existingDraft?.draft_caption ||
      !existingMediaSuggestion ||
      existingAngleChoices.length === 0 ||
      Boolean(preferredAngleId)
    let generated = null

    setDraftLoading(true)
    setDraftError('')
    setErrorMsg('')

    try {
      if (!shouldGenerate && existingDraft) {
        applyDraftToComposer(existingDraft, slot)
        return
      }

      generated = generateDraftForSlot({
        profile,
        policy: calendar.policy,
        slot,
        drafts,
        preferredAngleId,
      })
      const existingMeta = parseDraftMeta(existingDraft?.review_notes)
      const nextMeta = {
        ...existingMeta,
        ...generated.meta,
        generationSource: options.source || (existingDraft ? 'regenerate_angle' : 'slot_click'),
        generationMode: 'deterministic',
        generationSignature: `${slot.slot_date_local}:${slot.slot_label}:${slot.post_type}:${generated.angle.id}`,
        regenerationCount: (existingMeta.regenerationCount || 0) + (preferredAngleId ? 1 : 0),
        editCount: existingMeta.editCount || 0,
        publishCount: existingMeta.publishCount || 0,
        deleteCount: existingMeta.deleteCount || 0,
        generatedAt: new Date().toISOString(),
      }

      // Update the assistant panel immediately so the click feels responsive
      // even before the saved draft round-trip completes.
      applyGeneratedDraftToComposer(generated, slot, existingDraft?.id || '')
      setDraftStatus(preferredAngleId ? 'Updating the draft angle…' : 'Generating draft…')

      const row = {
        ...buildDraftPayload(profile, calendar.policy, slot),
        ...(existingDraft?.id ? { id: existingDraft.id } : {}),
        draft_title: generated.title,
        draft_body: generated.draftBody,
        draft_caption: generated.caption,
        review_state: 'draft_created',
        review_notes: stringifyDraftMeta(nextMeta),
        asset_requirements_json: generated.assetRequirements,
      }

      const savedDraft = await upsertSocialDraft(row)
      await recordPlannerFeedbackSafely({
        draftId: savedDraft.id,
        postType: slot.post_type,
        eventType: preferredAngleId ? 'draft_regenerated' : 'draft_generated',
        angleId: generated.angle.id,
        metadata: {
          source: options.source || (existingDraft ? 'regenerate_angle' : 'slot_click'),
          generationSignature: nextMeta.generationSignature,
          previousAngleId: existingMeta.angleId || null,
          selectedAngleId: generated.angle.id,
          slotDateLocal: slot.slot_date_local,
          slotLabel: slot.slot_label,
        },
      }, { invalidateProfile: Boolean(preferredAngleId) })
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      applyDraftToComposer(savedDraft, slot)
      setDraftStatus(preferredAngleId ? 'Caption regenerated with a new angle.' : 'Draft created and loaded.')
    } catch (error) {
      console.error('[SocialDraft]', error)
      if (generated) {
        applyGeneratedDraftToComposer(generated, slot, existingDraft?.id || '')
        setDraftStatus('Draft loaded into the editor, but we could not save the slot yet.')
      } else {
        setDraftError(error.message || 'Could not resolve this draft.')
      }
    } finally {
      setDraftLoading(false)
    }
  }, [profile, calendar, drafts, queryClient, clientId, applyDraftToComposer, applyGeneratedDraftToComposer, recordPlannerFeedbackSafely])

  const persistDraftEdits = useCallback(async (nextCaption) => {
    if (!activeDraftId || !activeSlot || hydratingDraftRef.current) return

    const currentMeta = parseDraftMeta(activeDraft?.review_notes)
    const nextTitle = buildDraftTitle(activeSlot.post_type, angleChoices, selectedAngleId)
    const deltaRatio = getCaptionDeltaRatio(generatedCaption, nextCaption)

    try {
      const savedDraft = await updateSocialDraft(activeDraftId, {
        draft_title: nextTitle,
        draft_body: [
          `Post type: ${activeSlot.post_type.replace(/_/g, ' ')}`,
          `Angle: ${currentMeta.angleLabel || selectedAngleId || 'custom'}`,
          `Media idea: ${mediaSuggestion || 'None'}`,
        ].join('\n'),
        draft_caption: nextCaption.trim(),
        review_state: 'in_review',
        review_notes: stringifyDraftMeta({
          ...currentMeta,
          angleChoices,
          mediaSuggestion,
          platformVariants: buildPlatformVariants(activePlatforms, nextCaption, profile, platformVariants),
          editCount: (currentMeta.editCount || 0) + 1,
          lastEditedAt: new Date().toISOString(),
          editSeverity: deltaRatio >= 0.35 ? 'heavy' : 'light',
        }),
      })

      await recordPlannerFeedbackSafely({
        draftId: savedDraft.id,
        postType: activeSlot.post_type,
        eventType: 'draft_edited',
        angleId: currentMeta.angleId || selectedAngleId || null,
        editSeverity: deltaRatio >= 0.35 ? 'heavy' : 'light',
        metadata: {
          deltaRatio,
          slotDateLocal: activeSlot.slot_date_local,
          slotLabel: activeSlot.slot_label,
        },
      })
      setDraftStatus(deltaRatio >= 0.35 ? 'Draft edits saved. Future defaults will treat this as a heavier edit.' : 'Draft edits saved.')
      setGeneratedCaption(savedDraft.draft_caption || nextCaption.trim())
      setDraftDirty(false)
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
    } catch (error) {
      console.error('[SocialDraftAutosave]', error)
      setDraftError(error.message || 'Could not save draft edits.')
    }
  }, [activeDraftId, activeSlot, activeDraft, angleChoices, selectedAngleId, generatedCaption, mediaSuggestion, platformVariants, activePlatforms, profile, queryClient, clientId, recordPlannerFeedbackSafely])

  const loadScheduledPostForEditing = useCallback((post) => {
    if (!post) return

    const timezone = calendar?.policy?.timezone || profile?.clients?.timezone || 'America/New_York'
    setEditingScheduledPostId(post.id)
    setEditingScheduledPostRef(post.n8n_execution_id || '')
    setContent(post.content || '')
    const savedPlatformVariants = post.platform_variants_json || {}
    const hasSavedPlatformVariants = Object.keys(savedPlatformVariants).length > 0
    setPlatformVariants(savedPlatformVariants)
    setPlatformFormatStatus(hasSavedPlatformVariants ? 'Saved platform captions loaded.' : 'Run Partner Format to create platform captions for this edit.')
    setSelectedPlatforms({
      facebook: Boolean(post.platforms?.includes('facebook')),
      instagram: Boolean(post.platforms?.includes('instagram')),
      google: Boolean(post.platforms?.includes('google')),
      tiktok: Boolean(post.platforms?.includes('tiktok')),
      linkedin: Boolean(post.platforms?.includes('linkedin')),
      twitter: Boolean(post.platforms?.includes('twitter')),
    })
    setPreviewPlatform(post.platforms?.[0] || 'facebook')
    setTimingMode('custom')
    setScheduledFor(isoToLocalInputValue(post.scheduled_for, timezone))
    setSelectedDay(post.localDate || selectedDay)
    setExistingMediaUrl(post.media_url || '')
    setImageFile(null)
    setLocalImageItems([])
    setImagePreview(post.media_url || null)
    setMediaSlideIndex(0)
    setImageGenerateState('idle')
    setImageGenerateError('')
    setImageImproveState('idle')
    setImageImproveMode('')
    setImageImproveError('')
    setPlatformVariants({})
    setPlatformFormatStatus('')
    setDropboxAttachments([])
    setActiveDraftId('')
    setActiveSlotKey('')
    setSelectedAngleId('')
    setAngleChoices([])
    setMediaSuggestion('')
    setDraftStatus('Editing a scheduled post. Save changes to update the live schedule.')
    setDraftError('')
    setDraftDirty(false)
    setErrorMsg('')
    setSearchParams({ date: post.localDate || selectedDay || '', editPost: post.id })
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [calendar?.policy?.timezone, profile?.clients?.timezone, selectedDay, setSearchParams])

  useEffect(() => {
    if (!calendar?.slots || !draftTargetDate || !draftTargetSlot || draftLoading) return

    const slot = calendar.slots.find((entry) => entry.slot_date_local === draftTargetDate && entry.slot_label === draftTargetSlot)
    if (!slot || getSlotKey(slot) === activeSlotKey) return

    resolveDraftForSlot(slot, { source: 'calendar_link' })
  }, [calendar, draftTargetDate, draftTargetSlot, draftLoading, activeSlotKey, drafts, resolveDraftForSlot])

  useEffect(() => {
    if (!draftTargetId || !drafts.length || draftLoading) return
    if (activeDraftId === draftTargetId) return

    const draft = drafts.find((entry) => entry.id === draftTargetId)
    const slot = buildSlotFromDraft(draft)
    if (!draft || !slot) return

    applyDraftToComposer(draft, slot)
    setDraftStatus('Opportunity Radar draft loaded.')
  }, [draftTargetId, drafts, draftLoading, activeDraftId, applyDraftToComposer])

  useEffect(() => {
    if (!editTargetPostId || scheduledPostsDetailed.length === 0) return
    if (editingScheduledPostId === editTargetPostId) return

    const target = scheduledPostsDetailed.find((post) => post.id === editTargetPostId)
    if (target) {
      loadScheduledPostForEditing(target)
    }
  }, [editTargetPostId, scheduledPostsDetailed, editingScheduledPostId, loadScheduledPostForEditing])

  useEffect(() => {
    if (!draftDirty || !activeDraftId || hydratingDraftRef.current) return undefined

    autosaveTimerRef.current = window.setTimeout(() => {
      persistDraftEdits(content)
    }, 800)

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [draftDirty, activeDraftId, content, generatedCaption, mediaSuggestion, selectedAngleId, angleChoices, activeSlot, persistDraftEdits])

  async function handleFileChange(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    await addLocalImageFiles(files)
    event.target.value = ''
  }

  async function addLocalImageFiles(files, source = 'local') {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) {
      setErrorMsg('Only image files are supported.')
      return
    }

    if (imageFiles.length !== files.length) {
      setErrorMsg('Some files were skipped because only image files are supported.')
    } else {
      setErrorMsg('')
    }

    const items = await Promise.all(imageFiles.map(async (file, index) => ({
      id: `${source}:${file.name}:${file.lastModified}:${index}:${Date.now()}`,
      type: source === 'google' ? 'google' : 'local',
      name: file.name || `Image ${index + 1}`,
      file,
      previewUrl: await readFileAsDataUrl(file),
    })))

    setLocalImageItems(items)
    setImageFile(items[0]?.file || null)
    setImagePreview(items[0]?.previewUrl || null)
    setExistingMediaUrl('')
    setMediaSlideIndex(0)
    setImageGenerateState('idle')
    setImageGenerateError('')
    setImageImproveState('idle')
    setImageImproveMode('')
    setImageImproveError('')
    clearPlatformImageVariants('')
  }

  async function handleChooseGoogle() {
    if (!requireWriteAccess('choose Google media')) return
    if (isSubmitting) return

    setImageGenerateError('')
    setImageImproveError('')
    setErrorMsg('')

    try {
      const files = await openGoogleImagePicker()
      if (!files.length) return
      await addLocalImageFiles(files, 'google')
      setDraftStatus(`${files.length} Google image${files.length === 1 ? '' : 's'} added.`)
    } catch (error) {
      console.error('[GooglePicker]', error)
      setErrorMsg(error.message || 'Could not open Google image picker.')
    }
  }

  async function handleChooseDropbox() {
    if (!requireWriteAccess('choose Dropbox media')) return
    if (isSubmitting) return

    setImageGenerateError('')
    setImageImproveError('')
    setErrorMsg('')

    try {
      const selectedFiles = await openDropboxChooser({
        multiselect: true,
        linkType: 'preview',
      })
      const imageFiles = selectedFiles.filter((file) => isImageAttachment(file))
      if (!imageFiles.length) {
        if (selectedFiles.length) setErrorMsg('Choose image files from Dropbox for post creative.')
        return
      }

      setDropboxAttachments((previous) => {
        const existingLinks = new Set(previous.map((file) => file.link))
        return [
          ...previous,
          ...imageFiles.filter((file) => file.link && !existingLinks.has(file.link)),
        ]
      })
      setMediaSlideIndex(creativeItems.length)
      clearPlatformImageVariants('')
      setDraftStatus(`${imageFiles.length} Dropbox image${imageFiles.length === 1 ? '' : 's'} added.`)
    } catch (error) {
      console.error('[DropboxChooser]', error)
      setErrorMsg(error.message || 'Could not open Dropbox chooser.')
    }
  }

  async function handleGenerateImage() {
    if (!requireWriteAccess('generate images for posts')) return
    if (!canGenerateImage) {
      setImageGenerateError('Load a Radar draft or media idea before generating an image.')
      return
    }

    setImageGenerateState('generating')
    setImageGenerateError('')
    setErrorMsg('')

    try {
      const payload = await generatePublisherImage({
        client_id: clientId,
        business_name: profile?.clients?.business_name || '',
        prompt: imageGenerationPrompt,
        caption: content,
        size: '1024x1024',
        quality: 'low',
      })
      const file = base64ToImageFile(payload.image_base64, payload.mime_type || 'image/png')
      const previewUrl = `data:${payload.mime_type || 'image/png'};base64,${payload.image_base64}`
      setLocalImageItems([{
        id: `generated:${Date.now()}`,
        type: 'generated',
        name: 'Generated image',
        file,
        previewUrl,
      }])
      setImageFile(file)
      setImagePreview(previewUrl)
      setExistingMediaUrl('')
      setMediaSlideIndex(0)
      clearPlatformImageVariants('')
      setImageGenerateState('ready')
      setImageImproveState('idle')
      setImageImproveMode('')
      setImageImproveError('')
      setDraftStatus('Generated image added. You can replace it with an upload if you prefer.')
    } catch (error) {
      console.error('[GeneratePublisherImage]', error)
      setImageGenerateError(error.message || 'Could not generate an image right now.')
      setImageGenerateState('error')
    }
  }

  async function getImageImproveInput() {
    if (activeCreativeItem?.type === 'dropbox' || activeCreativeItem?.type === 'existing') {
      const imageUrl = activeCreativeItem.link || activeCreativeItem.previewUrl || ''
      if (imageUrl && /^https?:\/\//i.test(imageUrl)) return { image_url: imageUrl }
    }

    const activeFile = activeCreativeItem?.file || imageFile
    if (activeFile) {
      const fileType = String(activeFile.type || '').toLowerCase()
      const fileName = String(activeFile.name || '').toLowerCase()
      if (fileType.includes('heic') || fileType.includes('heif') || /\.(heic|heif)$/.test(fileName)) {
        throw new Error('iPhone HEIC photos need to be saved or exported as JPG before Image Assist can improve them.')
      }
      if (!/^image\/(png|jpe?g|webp)$/i.test(fileType)) {
        throw new Error('Image Assist supports JPG, PNG, and WebP images.')
      }
      const dataUrl = await readFileAsDataUrl(activeFile)
      return { image_data_url: await normalizeImageForAssist(dataUrl) }
    }

    const activePreview = activeCreativeItem?.previewUrl || imagePreview
    if (typeof activePreview === 'string' && activePreview.startsWith('data:image/')) {
      return { image_data_url: await normalizeImageForAssist(activePreview) }
    }

    const imageUrl = existingMediaUrl || dropboxPreviewSource || ''
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      return { image_url: imageUrl }
    }

    throw new Error('Add or select an image before using Image Assist.')
  }

  async function handleImproveImage(mode) {
    if (!requireWriteAccess('improve images with Partner')) return

    setImageImproveState('improving')
    setImageImproveMode(mode)
    setImageImproveError('')
    setImageGenerateError('')
    setErrorMsg('')

    try {
      const imageInput = await getImageImproveInput()
      const payload = await improvePublisherImage({
        client_id: clientId,
        business_name: profile?.clients?.business_name || '',
        caption: content,
        platforms: activePlatforms,
        mode,
        quality: 'low',
        ...imageInput,
      })
      const file = base64ToImageFile(payload.image_base64, payload.mime_type || 'image/png', `partner-improved-${mode || 'image'}.png`)
      const previewUrl = `data:${payload.mime_type || 'image/png'};base64,${payload.image_base64}`
      setLocalImageItems([{
        id: `improved:${mode}:${Date.now()}`,
        type: 'local',
        name: `Partner improved ${mode || 'image'}`,
        file,
        previewUrl,
      }])
      setImageFile(file)
      setImagePreview(previewUrl)
      setExistingMediaUrl('')
      setMediaSlideIndex(0)
      clearPlatformImageVariants('')
      setImageImproveState('ready')
      setDraftStatus('Improved image attached. Review it before approving the post.')
    } catch (error) {
      console.error('[ImprovePublisherImage]', error)
      setImageImproveError(error.message || 'Could not improve this image right now.')
      setImageImproveState('error')
    }
  }

  async function handlePartnerAssist(actionId) {
    if (!requireWriteAccess('use Partner Assist')) return
    if (!content.trim()) {
      setAssistError('Write or load a caption before using Partner Assist.')
      return
    }

    setAssistState('loading')
    setAssistAction(actionId)
    setAssistError('')
    setErrorMsg('')

    try {
      const payload = await generatePublisherAssist({
        client_id: clientId,
        action: actionId,
        caption: content,
        platforms: activePlatforms,
        max_chars: charLimit,
        context: [
          activeSlot?.post_type ? `Post type: ${activeSlot.post_type}` : '',
          mediaSuggestion ? `Image idea: ${mediaSuggestion}` : '',
          scheduledFor ? `Timing: ${formatDetailedLocalDateTime(scheduledFor)}` : '',
        ].filter(Boolean).join('\n'),
      })

      setAssistSuggestions(Array.isArray(payload?.suggestions) ? payload.suggestions : [])
      setAssistState('ready')
    } catch (error) {
      console.error('[PartnerAssist]', error)
      setAssistSuggestions([])
      setAssistError(error.message || 'Partner Assist could not improve this caption right now.')
      setAssistState('error')
    }
  }

  function applyAssistSuggestion(suggestion) {
    if (!suggestion?.caption) return

    setContent(suggestion.caption)
    setPlatformVariants({})
    setPlatformFormatStatus('Caption updated. Run Partner Format again to refresh platform captions.')
    setErrorMsg('')
    setAssistState('applied')
    setDraftStatus('Partner Assist suggestion applied. Review it before approving the post.')
    if (!hydratingDraftRef.current && activeDraftId) {
      setDraftDirty(true)
    }
  }

  function handleGeneratePlatformVariants() {
    if (!content.trim()) {
      setPlatformFormatStatus('Write or load a caption before formatting by platform.')
      return
    }
    if (!activePlatforms.length) {
      setPlatformFormatStatus('Select at least one platform before formatting.')
      return
    }

    setPlatformVariants(buildPlatformVariants(activePlatforms, content, profile))
    setPlatformFormatStatus('Platform captions formatted. Review and edit each one before approval.')
  }

  function getResolvedPlatformVariants(platformIds = activePlatforms) {
    return buildPlatformVariants(platformIds, content, profile, platformVariants)
  }

  function clearPlatformImageVariants(message = '') {
    setPlatformVariants((current) => {
      const next = { ...current }
      Object.keys(next).forEach((platformId) => {
        if (next[platformId]?.image) {
          next[platformId] = { ...next[platformId] }
          delete next[platformId].image
        }
      })
      return next
    })
    setImageFormatState('idle')
    setImageFormatStatus(message)
  }

  async function getMasterImageSourceForFormatting() {
    const activeFile = activeCreativeItem?.file || imageFile
    if (activeFile) {
      const fileType = String(activeFile.type || '').toLowerCase()
      const fileName = String(activeFile.name || '').toLowerCase()
      if (fileType.includes('heic') || fileType.includes('heif') || /\.(heic|heif)$/.test(fileName)) {
        throw new Error('iPhone HEIC photos need to be saved or exported as JPG before image formatting.')
      }
      if (!/^image\/(png|jpe?g|webp)$/i.test(fileType)) {
        throw new Error('Image formatting supports JPG, PNG, and WebP images.')
      }
      return readFileAsDataUrl(activeFile)
    }

    const activePreview = activeCreativeItem?.previewUrl || imagePreview
    if (typeof activePreview === 'string' && activePreview.startsWith('data:image/')) {
      return activePreview
    }

    const imageUrl = activeCreativeItem?.link || activeCreativeItem?.previewUrl || existingMediaUrl || dropboxPreviewSource || ''
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) return imageUrl

    throw new Error('Add or select an image before formatting it for platforms.')
  }

  async function handleFormatPlatformImages() {
    if (!requireWriteAccess('format images for platforms')) return
    if (!activePlatforms.length) {
      setImageFormatStatus('Select at least one platform before formatting images.')
      return
    }

    setImageFormatState('formatting')
    setImageFormatStatus('')
    setErrorMsg('')

    try {
      const source = await getMasterImageSourceForFormatting()
      const entries = await Promise.all(activePlatforms.map(async (platformId) => {
        const target = PLATFORM_IMAGE_TARGETS[platformId]
        if (!target) return null
        const previewUrl = await cropImageForTarget(source, target)
        return [platformId, {
          preview_url: previewUrl,
          aspect_ratio: target.aspectRatio,
          width: target.width,
          height: target.height,
          label: target.label,
          guidance: target.guidance,
          source: 'smart_crop',
          generated_at: new Date().toISOString(),
        }]
      }))

      setPlatformVariants((current) => {
        const withCaptions = buildPlatformVariants(activePlatforms, content, profile, current)
        entries.filter(Boolean).forEach(([platformId, image]) => {
          withCaptions[platformId] = {
            ...(withCaptions[platformId] || {}),
            image,
          }
        })
        return withCaptions
      })
      setImageFormatState('ready')
      setImageFormatStatus('Platform images formatted. Review each preview before approval.')
    } catch (error) {
      console.error('[FormatPlatformImages]', error)
      setImageFormatState('error')
      setImageFormatStatus(error.message || 'Could not format this image for platforms.')
    }
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    setLocalImageItems([])
    setExistingMediaUrl('')
    setMediaSlideIndex(0)
    setImageGenerateState('idle')
    setImageGenerateError('')
    setImageImproveState('idle')
    setImageImproveMode('')
    setImageImproveError('')
    clearPlatformImageVariants('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeDropboxAttachment(link) {
    setDropboxAttachments((previous) => previous.filter((file) => file.link !== link))
    setMediaSlideIndex((current) => Math.max(0, current - 1))
    clearPlatformImageVariants('')
  }

  function selectCreativeItem(index) {
    const item = creativeItems[index]
    setMediaSlideIndex(index)
    if (item?.type === 'local' || item?.type === 'generated' || item?.type === 'google') {
      setImageFile(item.file || null)
      setImagePreview(item.previewUrl || null)
      setExistingMediaUrl('')
    } else if (item?.type === 'existing') {
      setImageFile(null)
      setImagePreview(null)
      setExistingMediaUrl(item.previewUrl || item.link || '')
    } else if (item?.type === 'dropbox') {
      setImageFile(null)
      setImagePreview(null)
      setExistingMediaUrl('')
    }
  }

  function showPreviousCreative() {
    if (creativeItems.length <= 1) return
    selectCreativeItem((activeCreativeIndex - 1 + creativeItems.length) % creativeItems.length)
  }

  function showNextCreative() {
    if (creativeItems.length <= 1) return
    selectCreativeItem((activeCreativeIndex + 1) % creativeItems.length)
  }

  function removeCreativeItem(item = activeCreativeItem) {
    if (!item) return
    if (item.type === 'dropbox') {
      removeDropboxAttachment(item.link)
      return
    }
    if (item.type === 'local' || item.type === 'generated' || item.type === 'google') {
      const nextItems = localImageItems.filter((media) => media.id !== item.id)
      setLocalImageItems(nextItems)
      const nextActive = nextItems[clampIndex(activeCreativeIndex, nextItems.length)] || null
      setImageFile(nextActive?.file || null)
      setImagePreview(nextActive?.previewUrl || null)
      setMediaSlideIndex(clampIndex(activeCreativeIndex, nextItems.length))
      if (!nextItems.length) removeImage()
      clearPlatformImageVariants('')
      return
    }
    removeImage()
  }

  function chooseSlot(slot) {
    const nextValue = slotToInputValue(slot)
    if (!nextValue) return

    setTimingMode('slot')
    setScheduledFor(nextValue)
    setSelectedDay(slot.slot_date_local)
    setErrorMsg('')
    setEditingScheduledPostId('')
    setEditingScheduledPostRef('')
    setExistingMediaUrl('')
    setImageFile(null)
    setLocalImageItems([])
    setImagePreview(null)
    setMediaSlideIndex(0)
    setImageGenerateState('idle')
    setImageGenerateError('')
    setImageImproveState('idle')
    setImageImproveMode('')
    setImageImproveError('')
    setDropboxAttachments([])
    setSearchParams({ date: slot.slot_date_local, slot: slot.slot_label })
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    resolveDraftForSlot(slot, { source: 'slot_click' })
  }

  function chooseNow() {
    setTimingMode('now')
    setScheduledFor('')
    setErrorMsg('')
    setDraftError('')
    setEditingScheduledPostId('')
    setEditingScheduledPostRef('')
  }

  async function handleDeleteDraft(slot) {
    if (!requireWriteAccess('delete drafts')) return

    const draft = findDraftForSlot(drafts, slot)
    if (!draft) return
    if (!window.confirm('Delete this saved draft?')) return

    try {
      setDeleteBusyKey(`draft:${draft.id}`)
      await recordPlannerFeedbackSafely({
        draftId: draft.id,
        postType: draft.post_type,
        eventType: 'draft_deleted',
        angleId: parseDraftMeta(draft.review_notes).angleId || null,
        metadata: {
          slotDateLocal: draft.slot_date_local,
          slotLabel: draft.slot_label,
          reviewState: draft.review_state,
        },
      }, { invalidateProfile: true })
      await deleteSocialDraft(draft.id)
      if (activeDraftId === draft.id) {
        hydratingDraftRef.current = true
        setActiveDraftId('')
        setActiveSlotKey('')
        setSelectedAngleId('')
        setAngleChoices([])
        setMediaSuggestion('')
        setGeneratedCaption('')
        setContent('')
        setPlatformVariants({})
        setPlatformFormatStatus('')
        setDraftDirty(false)
        setDraftStatus('')
        setDraftError('')
      }
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      setErrorMsg('')
    } catch (error) {
      setErrorMsg(error.message || 'Could not delete this draft.')
    } finally {
      setDeleteBusyKey('')
    }
  }

  async function handleDeleteScheduledPost(post) {
    if (!requireWriteAccess('delete scheduled posts')) return

    if (!post?.id) return
    if (!window.confirm('Delete this scheduled post? This will also try to cancel it in the publisher workflow.')) return

    try {
      setDeleteBusyKey(`post:${post.id}`)
      if (post.n8n_execution_id) {
        const response = await fetch(`${N8N_BASE}/webhook/social-publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete',
            postId: post.id,
            clientId,
            zernioPostId: post.n8n_execution_id,
          }),
        })
        const raw = await response.text()
        let payload = {}
        try {
          payload = raw ? JSON.parse(raw) : {}
        } catch {
          payload = {}
        }
        if (!response.ok || payload?.success === false) {
          if (isMissingRemoteDelete(payload, raw)) {
            payload = { success: true }
          } else {
          throw new Error(buildPublishErrorMessage(payload, raw, 'custom'))
          }
        }
      }

      await deletePost(post.id)

      if (editingScheduledPostId === post.id) {
        setEditingScheduledPostId('')
        setEditingScheduledPostRef('')
        setExistingMediaUrl('')
        setImageFile(null)
        setLocalImageItems([])
        setImagePreview(null)
        setMediaSlideIndex(0)
        setDropboxAttachments([])
        setContent('')
        setPlatformVariants({})
        setPlatformFormatStatus('')
        setScheduledFor('')
        setErrorMsg('')
        setDraftStatus('')
        setSearchParams({})
      }

      await queryClient.invalidateQueries({ queryKey: ['calendar-posts', clientId] })
    } catch (error) {
      setErrorMsg(error.message || 'Could not delete this scheduled post.')
    } finally {
      setDeleteBusyKey('')
    }
  }

  function chooseCustomTime(dayKey = '') {
    setTimingMode('custom')
    setSelectedDay(dayKey || selectedDay)
    if (dayKey) {
      const parsed = parseDateOnly(dayKey)
      if (parsed) setViewedMonth(new Date(parsed.year, parsed.month - 1, 1))
    }
    if (dayKey && !scheduledFor.startsWith(`${dayKey}T`)) {
      setScheduledFor(`${dayKey}T12:00`)
    } else if (!scheduledFor) {
      setScheduledFor(getMinScheduleValue())
    }
    setErrorMsg('')
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function uploadToR2(file) {
    const extension = file.name.split('.').pop()
    const filename = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
    const formData = new FormData()
    formData.append('file', file, filename)
    formData.append('filename', filename)
    formData.append('clientId', clientId)

    const response = await fetch(`${N8N_BASE}/webhook/r2-upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) throw new Error('Image upload failed.')
    const { publicUrl } = await response.json()
    return publicUrl
  }

  async function uploadPlatformImageVariants(variants) {
    const nextVariants = { ...variants }
    const entries = Object.entries(nextVariants).filter(([, variant]) => variant?.image?.preview_url?.startsWith('data:image/'))

    for (const [platformId, variant] of entries) {
      const target = PLATFORM_IMAGE_TARGETS[platformId]
      const file = dataUrlToFile(
        variant.image.preview_url,
        `${platformId}-${target?.aspectRatio || 'social'}.png`.replace(/[^a-z0-9.-]+/gi, '-'),
      )
      const url = await uploadToR2(file)
      nextVariants[platformId] = {
        ...variant,
        image: {
          ...variant.image,
          url,
          preview_url: undefined,
          uploaded_at: new Date().toISOString(),
        },
      }
    }

    return nextVariants
  }

  function validatePost() {
    if (!content.trim()) {
      return 'Write some post copy before publishing.'
    }
    if (charOver) {
      return `Your post exceeds the ${charLimit}-character limit.`
    }
    if (!clientId) {
      return 'Unable to identify your client profile. Please refresh.'
    }
    if (activePlatforms.length === 0) {
      return 'Select at least one platform preview before approval.'
    }
    if (connectedActivePlatforms.length === 0) {
      return 'Connect at least one social account in Settings before publishing.'
    }
    const overLimitPlatform = activePlatforms.find((platformId) => {
      const rules = PLATFORM_FORMAT_RULES[platformId]
      const caption = platformCaptions[platformId] || ''
      return rules?.maxChars && caption.length > rules.maxChars
    })
    if (overLimitPlatform) {
      const rules = PLATFORM_FORMAT_RULES[overLimitPlatform]
      return `${rules.label} caption exceeds the ${rules.maxChars}-character platform limit.`
    }

    if (timingMode !== 'now') {
      if (!scheduledFor) {
        return timingMode === 'custom'
          ? 'Choose a custom date and time.'
          : 'Pick a time from the calendar before scheduling.'
      }
      if (scheduledFor < minScheduleValue) {
        return 'Please choose a future time.'
      }

      try {
        localDateTimeToIso(scheduledFor)
      } catch (error) {
        return error.message
      }
    }

    return ''
  }

  function openReview() {
    const validationError = validatePost()
    if (validationError) {
      setErrorMsg(validationError)
      return
    }

    if (content.trim() && activePlatforms.some((platformId) => !platformVariants?.[platformId]?.caption)) {
      setPlatformVariants((current) => buildPlatformVariants(activePlatforms, content, profile, current))
      setPlatformFormatStatus('Platform captions formatted for final review.')
    }
    setErrorMsg('')
    setReviewOpen(true)
  }

  async function handleSubmit() {
    if (!requireWriteAccess('publish or schedule posts')) {
      setReviewOpen(false)
      return
    }

    const validationError = validatePost()
    if (validationError) {
      setErrorMsg(validationError)
      setReviewOpen(false)
      return
    }

    let savedPostId = null

    try {
      setPublishResult(null)
      const localUploadItems = localImageItems.length
        ? localImageItems.filter((item) => item.file)
        : (imageFile ? [{ id: 'primary-image', name: imageFile.name || 'Selected image', file: imageFile }] : [])
      let uploadedMedia = []
      if (localUploadItems.length) {
        setSubmitState('uploading')
        uploadedMedia = await Promise.all(localUploadItems.map(async (item) => ({
          name: item.name || item.file?.name || 'Selected image',
          source: item.type || 'computer',
          url: await uploadToR2(item.file),
        })))
      }

      setSubmitState('posting')

      const activeUploadedMedia = activeCreativeItem?.type !== 'dropbox' && activeCreativeItem?.type !== 'existing'
        ? uploadedMedia[activeCreativeIndex]
        : null
      const activeDropboxUrl = activeCreativeItem?.type === 'dropbox' ? activeCreativeItem.link : null
      const activeExistingUrl = activeCreativeItem?.type === 'existing' ? activeCreativeItem.link : null
      const dropboxMedia = dropboxAttachments
        .filter((file) => file.link)
        .map(({ name, link, size, thumbnail }) => ({
          name: name || 'Dropbox image',
          link,
          url: link,
          size: size || 0,
          thumbnail: thumbnail || null,
          source: 'dropbox',
        }))
      const uploadedMediaAssets = uploadedMedia.map((item) => ({
        name: item.name,
        link: item.url,
        url: item.url,
        size: 0,
        source: item.source || 'computer',
      }))
      const mediaAssets = [
        ...uploadedMediaAssets,
        ...dropboxMedia,
      ]
      const mediaUrls = mediaAssets.map((item) => item.url).filter(Boolean)
      const effectiveMediaUrl = activeUploadedMedia?.url
        || activeDropboxUrl
        || activeExistingUrl
        || uploadedMedia[0]?.url
        || dropboxMedia[0]?.url
        || existingMediaUrl
        || null
      const scheduledForIso = timingMode === 'now' ? null : localDateTimeToIso(scheduledFor)
      const targetStatus = timingMode === 'now' ? 'published' : 'scheduled'
      const targetPlatforms = connectedActivePlatforms
      let targetPlatformVariants = getResolvedPlatformVariants(targetPlatforms)
      if (Object.values(targetPlatformVariants).some((variant) => variant?.image?.preview_url?.startsWith('data:image/'))) {
        setSubmitState('uploading')
        targetPlatformVariants = await uploadPlatformImageVariants(targetPlatformVariants)
        setPlatformVariants((current) => ({ ...current, ...targetPlatformVariants }))
      }
      let post = null
      const editCandidateId = editingScheduledPostId || editTargetPostId || ''
      let existingEditingPost = editingScheduledPost || scheduledPostsDetailed.find((item) => item.id === editCandidateId) || null
      if (!existingEditingPost && editCandidateId) {
        existingEditingPost = await fetchPostById(editCandidateId)
      }
      const resolvedEditingPostId = existingEditingPost?.id || editCandidateId || ''
      const resolvedEditingRef = editingScheduledPostRef || existingEditingPost?.n8n_execution_id || ''

      if (resolvedEditingPostId) {
        const { data: updatedPost, error: updateError } = await supabase
          .from('posts')
          .update({
            content: content.trim(),
            platform_variants_json: targetPlatformVariants,
            media_url: effectiveMediaUrl,
            platforms: targetPlatforms,
            status: 'draft',
            scheduled_for: scheduledForIso,
          })
          .eq('id', resolvedEditingPostId)
          .select()
          .single()

        if (updateError) throw updateError
        post = updatedPost
        savedPostId = updatedPost.id
      } else {
        const { data: createdPost, error: insertError } = await supabase
          .from('posts')
          .insert({
            client_id: clientId,
            content: content.trim(),
            platform_variants_json: targetPlatformVariants,
            media_url: effectiveMediaUrl,
            platforms: targetPlatforms,
            status: 'draft',
            scheduled_for: scheduledForIso,
          })
          .select()
          .single()

        if (insertError) throw insertError
        post = createdPost
        savedPostId = createdPost.id
      }

      const n8nResponse = await fetch(`${N8N_BASE}/webhook/social-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          clientId,
          zernioPostId: resolvedEditingRef || null,
          content: content.trim(),
          platformVariants: targetPlatformVariants,
          mediaVariants: Object.fromEntries(
            targetPlatforms
              .map((platformId) => [platformId, targetPlatformVariants?.[platformId]?.image?.url])
              .filter(([, url]) => Boolean(url)),
          ),
          mediaUrl: effectiveMediaUrl,
          mediaUrls,
          mediaAssets,
          dropboxLinks: dropboxMedia.map(({ name, link, size, thumbnail }) => ({ name, link, size, thumbnail })),
          platforms: targetPlatforms,
          scheduledFor: scheduledForIso,
        }),
      })

      const n8nRawText = await n8nResponse.text()
      const n8nData = (() => {
        try {
          return n8nRawText ? JSON.parse(n8nRawText) : {}
        } catch {
          return {}
        }
      })()
      const publishedPlatforms = Array.isArray(n8nData?.publishedPlatforms) ? n8nData.publishedPlatforms : []
      const skippedPlatforms = [...new Set([
        ...(Array.isArray(n8nData?.skippedPlatforms) ? n8nData.skippedPlatforms : []),
        ...disconnectedActivePlatforms,
      ])]
      const effectivePublishedPlatforms = publishedPlatforms.length > 0
        ? publishedPlatforms
        : targetPlatforms.filter((platformId) => !skippedPlatforms.includes(platformId))
      const n8nSuccess = n8nResponse.ok && n8nData?.success !== false && effectivePublishedPlatforms.length > 0

      await supabase
        .from('posts')
        .update({
          status: n8nSuccess ? targetStatus : 'failed',
          n8n_execution_id: n8nSuccess
            ? (n8nData?.zernioPostId ?? resolvedEditingRef ?? post.n8n_execution_id ?? null)
            : (resolvedEditingRef || post.n8n_execution_id || null),
          published_at: n8nSuccess && targetStatus === 'published' ? new Date().toISOString() : null,
        })
        .eq('id', post.id)

      if (!n8nSuccess) {
        throw new Error(buildPublishErrorMessage(n8nData, n8nRawText, timingMode))
      }

      setPublishResult({
        requestedPlatforms: Array.isArray(n8nData?.requestedPlatforms) ? n8nData.requestedPlatforms : activePlatforms,
        publishedPlatforms: effectivePublishedPlatforms,
        skippedPlatforms,
      })

      if (activeDraftId) {
        const currentMeta = parseDraftMeta(activeDraft?.review_notes)
        await updateSocialDraft(activeDraftId, {
          review_state: 'published_manually',
          published_reference: post.id,
          review_notes: stringifyDraftMeta({
            ...currentMeta,
            platformVariants: targetPlatformVariants,
            publishCount: (currentMeta.publishCount || 0) + 1,
            lastPublishedAt: new Date().toISOString(),
          }),
        })

        await recordPlannerFeedbackSafely({
          draftId: activeDraftId,
          postType: activeSlot?.post_type || currentMeta.postType || 'community_story',
          eventType: 'draft_published',
          angleId: currentMeta.angleId || selectedAngleId || null,
          metadata: {
            postId: post.id,
            publishMode: timingMode === 'now' ? 'publish_now' : 'scheduled',
            scheduledFor: scheduledForIso,
            platforms: targetPlatforms,
          },
        }, { invalidateProfile: true })
      }

      await queryClient.invalidateQueries({ queryKey: ['calendar-posts', clientId] })
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      setSubmitState('success')
      setReviewOpen(false)
      setTimeout(() => {
        if (returnTo === 'studio' && timingMode !== 'now') {
          const returnParams = new URLSearchParams({
            view: returnView === 'month' ? 'month' : 'week',
            date: scheduledForIso ? scheduledForIso.slice(0, 10) : selectedDay || '',
            scheduled: post.id,
          })
          navigate(`/calendar?${returnParams.toString()}`)
          return
        }
        setContent('')
        setImageFile(null)
        setLocalImageItems([])
        setImagePreview(null)
        setMediaSlideIndex(0)
        setImageGenerateState('idle')
        setImageGenerateError('')
        setImageImproveState('idle')
        setImageImproveMode('')
        setImageImproveError('')
        setDropboxAttachments([])
        setExistingMediaUrl('')
        setScheduledFor('')
        setTimingMode('slot')
        setSubmitState('idle')
        setErrorMsg('')
        setPublishResult(null)
        setPlatformVariants({})
        setPlatformFormatStatus('')
        setEditingScheduledPostId('')
        setEditingScheduledPostRef('')
        setActiveDraftId('')
        setActiveSlotKey('')
        setSelectedAngleId('')
        setAngleChoices([])
        setMediaSuggestion('')
        setDraftStatus('')
        setDraftError('')
        setGeneratedCaption('')
        setDraftDirty(false)
        setSearchParams({})
        if (fileInputRef.current) fileInputRef.current.value = ''
      }, 2500)
    } catch (error) {
      console.error('[CreatePost]', error)
      if (savedPostId) {
        supabase.from('posts').update({ status: 'failed' }).eq('id', savedPostId).then(() => {})
      }
      setErrorMsg(error.message || 'Something went wrong. Please try again.')
      setPublishResult(null)
      setSubmitState('error')
      setReviewOpen(false)
      setTimeout(() => setSubmitState('idle'), 4000)
    }
  }

  if (profileLoading) {
    return (
      <div className="portal-page flex min-h-[60vh] items-center justify-center">
        <div className="portal-surface rounded-[28px] p-6">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--portal-primary)]" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="portal-page create-post-page w-full max-w-none space-y-6 md:p-5 xl:p-6">
        {(submitState === 'success' || errorMsg || draftError || draftStatus) && (
          <section className="space-y-3">
            {submitState === 'success' && (
              <div className="portal-status-success flex items-center gap-3 rounded-2xl px-5 py-4">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {editingScheduledPostId
                      ? 'Scheduled post updated successfully'
                      : timingMode === 'now'
                        ? 'Post published successfully'
                        : 'Post scheduled successfully'}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                    {timingMode === 'now'
                      ? 'Your post has been sent to the connected selected platforms.'
                      : scheduledFor
                        ? `Scheduled for ${formatDetailedLocalDateTime(scheduledFor)}.`
                        : 'The scheduled slot is now reserved and ready for publish time.'}
                  </p>
                  {publishResult?.skippedPlatforms?.length > 0 && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                      Skipped disconnected platform{publishResult.skippedPlatforms.length !== 1 ? 's' : ''}: {publishResult.skippedPlatforms.join(', ')}.
                    </p>
                  )}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="portal-status-danger flex items-start gap-3 rounded-2xl px-5 py-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">{errorMsg}</p>
              </div>
            )}

            {draftError && (
              <div className="portal-status-danger flex items-start gap-3 rounded-2xl px-5 py-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">{draftError}</p>
              </div>
            )}

            {draftStatus && !draftError && (
              <div className="flex items-start gap-3 rounded-2xl px-5 py-4" style={{ background: 'rgba(201,168,76,0.12)', color: 'var(--portal-text)' }}>
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--portal-primary)' }} />
                <p className="text-sm">{draftStatus}</p>
              </div>
            )}
          </section>
        )}

        <div className="space-y-5 create-post-ticket-layout">
          <article className="create-post-ticket-card" ref={composerRef}>
            <div className="create-post-phone-bar">
              <button type="button" onClick={() => navigate('/calendar')} className="create-post-phone-button">
                Cancel
              </button>
              <div className="create-post-phone-title">Create post</div>
              <button type="button" onClick={openReview} disabled={isSubmitting || charOver} className="create-post-phone-button">
                Next
              </button>
            </div>
            <div className="create-post-phone-body">
              <div className="create-post-identity-row">
                <div className="create-post-avatar">D</div>
                <div>
                  <strong>{profile?.clients?.business_name || 'Dancescapes Performing Arts'}</strong>
                  <span>{activePlatforms.length ? activePlatforms.map((platformId) => PLATFORMS.find((platform) => platform.id === platformId)?.label).filter(Boolean).join(', ') : 'Choose platforms below'}</span>
                </div>
              </div>
              <div className="create-post-compose-grid create-post-ticket-grid">
            <section className="create-post-caption-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {editingScheduledPostId ? 'Editing scheduled post' : activeDraftId ? 'Draft loaded' : 'Publisher'}
                  </h1>
                  <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                    {timingSummary}
                  </p>
                </div>
                <Link
                  to="/post/history"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.86)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </Link>
                <Link
                  to="/post/scheduled"
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.86)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Scheduled
                  <span
                    className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ background: 'rgba(201,168,76,0.16)', color: 'var(--portal-primary)' }}
                  >
                    {scheduledPostCount}
                  </span>
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={chooseNow}
                  className="rounded-2xl px-4 py-2.5 text-sm font-semibold"
                  style={timingMode === 'now'
                    ? { background: 'rgba(201,168,76,0.18)', color: 'var(--portal-primary)', border: '2px solid rgba(201,168,76,0.46)', fontWeight: 950 }
                    : { background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                >
                  Post now
                </button>
                <button
                  type="button"
                  onClick={() => chooseCustomTime(selectedDay)}
                  className="rounded-2xl px-4 py-2.5 text-sm font-semibold"
                  style={timingMode === 'custom'
                    ? { background: 'rgba(201,168,76,0.18)', color: 'var(--portal-primary)', border: '2px solid rgba(201,168,76,0.46)', fontWeight: 950 }
                    : { background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                >
                  Custom time
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimingMode('slot')
                    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="rounded-2xl px-4 py-2.5 text-sm font-semibold"
                  style={timingMode === 'slot'
                    ? { background: 'rgba(201,168,76,0.18)', color: 'var(--portal-primary)', border: '2px solid rgba(201,168,76,0.46)', fontWeight: 950 }
                    : { background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                >
                  Calendar slot
                </button>
                <div className="rounded-full px-3 py-2 text-[11px] font-semibold" style={{ background: 'rgba(245,240,235,0.9)', color: draftLoading ? 'var(--portal-primary)' : 'var(--portal-text-soft)' }}>
                  {draftLoading ? 'Generating draft…' : editingScheduledPostId ? 'Scheduled-post editor' : activeDraftId ? 'Draft-backed editor' : 'Pick a slot'}
                </div>
              </div>

              {timingMode === 'custom' && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium" style={{ color: 'var(--portal-text-muted)' }}>
                    Scheduling for {scheduledFor ? formatDetailedLocalDateTime(scheduledFor) : 'a custom date and time'}.
                  </p>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    min={minScheduleValue}
                    onChange={(event) => setScheduledFor(event.target.value)}
                    className="portal-input w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
              )}

              <div className="mt-5">
                {timingMode !== 'now' && scheduledFor && (
                  <div
                    className="mb-4 rounded-2xl px-4 py-3 text-sm"
                    style={{ background: 'rgba(201,168,76,0.10)', color: 'var(--portal-text)', border: '1px solid rgba(201,168,76,0.22)' }}
                  >
                    This post will be scheduled for <span className="font-semibold">{formatDetailedLocalDateTime(scheduledFor)}</span>.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {angleChoices.length > 0 ? angleChoices.map((choice) => {
                    const isActive = choice.id === selectedAngleId

                    return (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => {
                          if (!activeSlot || draftLoading || isActive) return
                          setSelectedAngleId(choice.id)
                          resolveDraftForSlot(activeSlot, { preferredAngleId: choice.id, source: 'angle_button' })
                        }}
                        disabled={draftLoading || !activeSlot}
                        className="rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-60"
                        style={isActive
                          ? { background: 'rgba(201,168,76,0.16)', color: 'var(--portal-primary)', border: '1px solid rgba(201,168,76,0.32)' }
                          : { background: 'rgba(255,255,255,0.86)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                      >
                        {choice.shortLabel || choice.label}
                      </button>
                    )
                  }) : null}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                    {content.length}/{charLimit}
                  </span>
                </div>

                <textarea
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value)
                    setPlatformVariants({})
                    setPlatformFormatStatus('Base caption changed. Run Partner Format to refresh platform captions.')
                    setErrorMsg('')
                    if (!hydratingDraftRef.current && activeDraftId) {
                      setDraftDirty(true)
                      setDraftStatus('Saving caption edits…')
                    }
                  }}
                  placeholder="Select a draft-backed slot to prefill the caption…"
                  rows={7}
                  disabled={isSubmitting}
                  className="w-full resize-none rounded-[24px] bg-[rgba(255,255,255,0.7)] px-4 py-4 text-sm leading-relaxed focus:outline-none"
                  style={{ color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                />

                <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ background: 'rgba(26,24,20,0.08)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${charPercent}%`,
                      background: charOver ? 'var(--portal-danger)' : 'var(--portal-primary)',
                    }}
                  />
                </div>

                <div className="partner-assist-box">
                  <div className="partner-assist-head">
                    <div>
                      <p>Partner Assist</p>
                      <h2>Improve this caption</h2>
                    </div>
                    <span>1 credit</span>
                  </div>
                  <div className="partner-assist-actions">
                    {ASSIST_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => handlePartnerAssist(action.id)}
                        disabled={!canUseAssist || assistState === 'loading'}
                        title={action.description}
                        data-active={assistAction === action.id && assistState === 'loading'}
                        className="portal-ai-mini-action"
                      >
                        {assistAction === action.id && assistState === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {action.label}
                      </button>
                    ))}
                  </div>
                  {!content.trim() ? (
                    <p className="partner-assist-note">Load or write a caption to unlock Partner Assist.</p>
                  ) : assistError ? (
                    <p className="partner-assist-error">{assistError}</p>
                  ) : assistState === 'loading' ? (
                    <p className="partner-assist-note">Partner is polishing the copy...</p>
                  ) : assistSuggestions.length > 0 ? (
                    <div className="partner-assist-suggestions">
                      {assistSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.id || suggestion.label || suggestion.caption}
                          type="button"
                          onClick={() => applyAssistSuggestion(suggestion)}
                        >
                          <span>
                            <strong>{suggestion.label || 'Suggested caption'}</strong>
                            <small>{suggestion.why || 'Click to use this version.'}</small>
                          </span>
                          <em>{suggestion.caption}</em>
                          <i><Check className="h-3.5 w-3.5" /> Use</i>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="partner-assist-note">Try a quick improvement, shorter version, stronger CTA, or platform-aware caption before approval.</p>
                  )}
                </div>

                <button
                  onClick={openReview}
                  disabled={isSubmitting || charOver}
                  className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {submitState === 'uploading' ? 'Uploading…' : timingMode === 'now' ? 'Publishing…' : 'Scheduling…'}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {timingMode === 'now' ? 'Preview & Publish' : 'Preview & Approve'}
                    </>
                  )}
                </button>
              </div>
            </section>

            <section className="create-post-creative-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Main creative
                  </p>
                  <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                    Choose your creative
                  </h2>
                </div>
                <div className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: 'rgba(245,240,235,0.92)', color: imageGenerateState === 'generating' ? '#4058c9' : 'var(--portal-text-soft)' }}>
                  {imageGenerateState === 'ready' ? 'Generated image attached' : imageGenerateState === 'generating' ? 'Working on it...' : 'Upload, generate, or choose'}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-2 text-[11px] font-semibold"
                  style={{ background: 'rgba(26,24,20,0.06)', color: 'var(--portal-text)' }}
                >
                  <UploadCloud className="h-3.5 w-3.5" style={{ color: 'var(--portal-primary)' }} />
                  From Computer
                </button>

                <button
                  type="button"
                  onClick={handleGenerateImage}
                  disabled={isSubmitting || imageGenerateState === 'generating' || !canGenerateImage}
                  className="portal-ai-action inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed"
                  data-generating={imageGenerateState === 'generating'}
                  style={{
                    background: 'linear-gradient(135deg, #6d4aff, #b454ff 48%, #f1c6ff)',
                    color: '#fff',
                    boxShadow: canGenerateImage
                      ? '0 14px 32px rgba(132, 72, 255, 0.30), 0 0 0 1px rgba(255,255,255,0.55) inset'
                      : '0 10px 24px rgba(132, 72, 255, 0.18), 0 0 0 1px rgba(255,255,255,0.42) inset',
                  }}
                >
                  {imageGenerateState === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {imageGenerateState === 'generating' ? 'Generating...' : 'Generate with AI'}
                  {imageGenerateState !== 'generating' && <Sparkles className="h-3.5 w-3.5" />}
                </button>

                {PHOTO_LIBRARY_LINKS.map(({ label, href, action, Icon, color }) => (
                  action === 'dropbox' || (action === 'google' && googlePickerReady) ? (
                    <button
                      key={label}
                      type="button"
                      onClick={action === 'google' ? handleChooseGoogle : handleChooseDropbox}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[11px] font-semibold disabled:opacity-55"
                      style={{ background: 'rgba(26,24,20,0.06)', color: 'var(--portal-text)' }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                      {label}
                    </button>
                  ) : (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[11px] font-semibold"
                      style={{ background: 'rgba(26,24,20,0.06)', color: 'var(--portal-text)' }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                      {label}
                      <ArrowUpRight className="h-2.5 w-2.5" style={{ color: 'var(--portal-text-soft)' }} />
                    </a>
                  )
                ))}
              </div>

              <div className="mt-3 overflow-hidden rounded-[24px]" style={{ border: '1px solid var(--portal-border)', background: 'rgba(255,255,255,0.78)' }}>
                {mediaPreviewSource ? (
                  <div className="create-post-media-stage">
                    <img src={mediaPreviewSource} alt={activeCreativeItem?.name || 'Upload preview'} className="w-full object-cover" />
                    {creativeItems.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={showPreviousCreative}
                          disabled={isSubmitting}
                          className="create-post-media-arrow"
                          data-side="left"
                          aria-label="Previous image"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={showNextCreative}
                          disabled={isSubmitting}
                          className="create-post-media-arrow"
                          data-side="right"
                          aria-label="Next image"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    {creativeItems.length > 1 && (
                      <div className="create-post-media-count">
                        {activeCreativeIndex + 1} / {creativeItems.length}
                      </div>
                    )}
                    {activeCreativeItem && (
                      <button
                        type="button"
                        onClick={() => removeCreativeItem()}
                        disabled={isSubmitting}
                        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white"
                        style={{ background: 'rgba(0,0,0,0.58)' }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                    className="flex min-h-[300px] w-full flex-col items-center justify-center gap-4 px-6 py-8 text-center"
                    style={{ background: 'linear-gradient(145deg, rgba(201, 168, 76, 0.06), rgba(232, 213, 160, 0.05))' }}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-[20px]" style={{ background: '#fff', border: '1px solid var(--portal-border)' }}>
                      <UploadCloud className="h-6 w-6" style={{ color: 'var(--portal-primary)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                        Add your main creative
                      </p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-soft)' }}>
                        Upload, generate with Partner, or grab one from a photo library.
                      </p>
                    </div>
                  </button>
                )}
              </div>

              {creativeItems.length > 1 && (
                <div className="create-post-media-strip" aria-label="Selected post images">
                  {creativeItems.map((item, index) => (
                    <button
                      key={item.id || `${item.name}-${index}`}
                      type="button"
                      onClick={() => selectCreativeItem(index)}
                      className="create-post-media-thumb"
                      data-active={index === activeCreativeIndex}
                      title={item.name}
                    >
                      <img src={item.thumbUrl || item.previewUrl} alt="" />
                      <span>{index + 1}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 rounded-[22px] p-3" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid var(--portal-border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                      Image tools
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                      Improve the image, then format crops for the selected platforms.
                    </p>
                  </div>
                  <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: 'rgba(93,120,255,0.10)', color: '#4058c9' }}>
                    2 credits for AI edits
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {IMAGE_ASSIST_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleImproveImage(action.id)}
                      disabled={!canImproveImage || imageImproveState === 'improving' || imageGenerateState === 'generating'}
                      title={action.description}
                      data-active={imageImproveMode === action.id && imageImproveState === 'improving'}
                      className="portal-ai-mini-action inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
                    >
                      {imageImproveMode === action.id && imageImproveState === 'improving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleFormatPlatformImages}
                    disabled={!canImproveImage || imageFormatState === 'formatting' || imageGenerateState === 'generating'}
                    title="Create platform-specific crops from the selected image."
                    className="portal-ai-mini-action inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
                  >
                    {imageFormatState === 'formatting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {imageFormatState === 'formatting' ? 'Formatting...' : 'Format crops'}
                  </button>
                  {Object.keys(platformImageVariants).length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearPlatformImageVariants('Platform image crops cleared.')}
                      disabled={imageFormatState === 'formatting'}
                      title="Clear platform-specific image crops."
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      style={{ background: 'rgba(26,24,20,0.06)', color: 'var(--portal-text-muted)' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear crops
                    </button>
                  )}
                </div>
                {imageImproveError ? (
                  <p className="partner-assist-error">{imageImproveError}</p>
                ) : imageFormatState === 'error' && imageFormatStatus ? (
                  <p className="partner-assist-error">{imageFormatStatus}</p>
                ) : imageImproveState === 'improving' ? (
                  <p className="partner-assist-note">Partner is improving the selected image...</p>
                ) : imageFormatStatus ? (
                  <p className="partner-assist-note">{imageFormatStatus}</p>
                ) : canImproveImage ? (
                  <p className="partner-assist-note">JPG, PNG, and WebP work best. iPhone HEIC photos should be saved as JPG first.</p>
                ) : (
                  <p className="partner-assist-note">Add or select an image to unlock image tools.</p>
                )}
                {Object.keys(platformImageVariants).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activePlatforms.map((platformId) => {
                      const platform = PLATFORMS.find((item) => item.id === platformId)
                      const image = platformImageVariants[platformId]
                      const target = PLATFORM_IMAGE_TARGETS[platformId]
                      if (!platform || !image) return null

                      return (
                        <button
                          key={platformId}
                          type="button"
                          onClick={() => setPreviewPlatform(platformId)}
                          className="inline-flex items-center gap-2 rounded-full border px-2 py-1.5 text-left"
                          style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'var(--portal-border)' }}
                        >
                          <img
                            src={image.preview_url || image.url}
                            alt={`${platform.label} crop`}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--portal-text)' }}>{platform.shortLabel || platform.label}</span>
                          <span className="text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>{target?.aspectRatio || image.aspect_ratio}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {imageGenerationPrompt && (
                <div className="mt-3 rounded-[20px] px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.62)', border: '1px solid var(--portal-border)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Partner image prompt
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    {imageGenerationPrompt}
                  </p>
                  {imageGenerateError && (
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--portal-danger)' }}>
                      {imageGenerateError}
                    </p>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </section>
              </div>
            </div>
          </article>

          <section className="create-post-schedule-strip">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                Schedule
              </p>
              <h2>Choose timing</h2>
              <p>{timingSummary}</p>
            </div>
            <div className="create-post-schedule-actions">
              <button type="button" onClick={chooseNow} data-active={timingMode === 'now'}>
                Post now
              </button>
              <button type="button" onClick={() => chooseCustomTime(selectedDay)} data-active={timingMode === 'custom'}>
                Custom time
              </button>
              <button
                type="button"
                onClick={() => setTimingMode('slot')}
                data-active={timingMode === 'slot'}
              >
                Calendar slot
              </button>
            </div>
            <input
              type="datetime-local"
              value={scheduledFor}
              min={minScheduleValue}
              onChange={(event) => {
                setScheduledFor(event.target.value)
                setTimingMode('custom')
              }}
              className="portal-input rounded-2xl px-4 py-3 text-sm focus:outline-none"
              style={{ colorScheme: 'light' }}
            />
          </section>

          <section className="create-post-preview-section">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                  Platform previews
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                  Review every selected channel
                </h2>
              </div>
              <div className="create-post-preview-actions">
                <div className="create-post-preview-hint">
                  Choose the channels you want to approve. Nothing is selected by default.
                </div>
                <button
                  type="button"
                  onClick={handleGeneratePlatformVariants}
                  disabled={!content.trim() || !activePlatforms.length || isSubmitting}
                  className="portal-ai-mini-action"
                  title="Create platform-aware captions for the selected preview cards."
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Platform-aware
                </button>
              </div>
            </div>
            {platformFormatStatus ? (
              <p className="mt-3 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                {platformFormatStatus}
              </p>
            ) : null}

            <div className="create-post-preview-grid mt-5">
              {PLATFORMS.map(({ id, label, Icon, accent, soft }) => {
                const active = selectedPlatforms[id]
                return (
                  <article key={id} className="create-post-preview-shell" data-active={active}>
                    <button
                      type="button"
                      onClick={() => {
                        const nextValue = !selectedPlatforms[id]
                        const next = { ...selectedPlatforms, [id]: nextValue }
                        setSelectedPlatforms(next)
                        if (nextValue) {
                          setPreviewPlatform(id)
                        } else if (previewPlatform === id) {
                          setPreviewPlatform(Object.entries(next).find(([, enabled]) => enabled)?.[0] || '')
                        }
                      }}
                      className="create-post-preview-selector"
                      style={active
                        ? { background: soft, borderColor: `${accent}88`, color: accent }
                        : { background: 'rgba(255,255,255,0.82)', borderColor: 'var(--portal-border)', color: 'var(--portal-text-muted)' }}
                    >
                      <span className="create-post-checkmark" data-active={active}>
                        {active ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <Icon className="h-4 w-4" style={{ color: accent }} />
                      {label}
                    </button>
                    <PlatformPreview
                      platformId={id}
                      profile={profile}
                      content={platformCaptions[id] || content}
                      imagePreview={mediaPreviewSource}
                      dropboxAttachments={dropboxAttachments}
                      scheduledFor={scheduledFor}
                      platformImage={platformImageVariants[id]}
                    />
                    <div className="create-post-preview-tools">
                      <button
                        type="button"
                        onClick={() => handleImproveImage('cleanup')}
                        disabled={!active || !canImproveImage || imageImproveState === 'improving' || imageGenerateState === 'generating'}
                        className="portal-ai-mini-action"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Improve image
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPlatform(id)
                          handleFormatPlatformImages()
                        }}
                        disabled={!active || !canImproveImage || imageFormatState === 'formatting' || imageGenerateState === 'generating'}
                        className="portal-ai-mini-action"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Crop setting
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-[34px] p-5 md:p-6" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>
                      Calendar planner
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {formatMonthLabel(viewedMonth)}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewedMonth((current) => addMonths(current, -1))}
                      className="rounded-full px-3 py-1 text-sm font-semibold"
                      style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewedMonth((current) => addMonths(current, 1))}
                      className="rounded-full px-3 py-1 text-sm font-semibold"
                      style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                    >
                      ›
                    </button>
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: 'rgba(245,240,235,0.9)', color: 'var(--portal-text-soft)' }}>
                      <Clock3 className="h-3.5 w-3.5" />
                      {timingSummary}
                    </div>
                  </div>
              </div>

              {calendar?.error ? (
                <div className="mt-4 rounded-[24px] px-4 py-4 text-sm" style={{ background: 'rgba(196, 85, 110, 0.12)', color: '#b44660' }}>
                  {calendar.error.message}
                </div>
              ) : postsLoading || draftsLoading ? (
                <div className="mt-6 flex items-center gap-3 rounded-[24px] px-4 py-4" style={{ background: 'rgba(245,240,235,0.8)', color: 'var(--portal-text-muted)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading calendar slots…
                </div>
              ) : (
                <div className="mt-5 grid gap-5">
                  <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day}>{day}</div>)}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {monthGrid.map((day) => {
                      const daySlots = slotsByDate.get(day.key) || []
                      const scheduledDayPosts = scheduledPostsByDate.get(day.key) || []
                      const counts = {
                        recommended: daySlots.filter((slot) => slot.state === 'recommended_fill').length,
                        planned: scheduledDayPosts.length,
                        draft: daySlots.filter((slot) => slot.state === 'occupied_draft').length,
                      }
                      const isSelectedDay = selectedDay === day.key

                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => {
                            setSelectedDay(day.key)
                            if (!day.inMonth) {
                              setViewedMonth(new Date(day.date.getFullYear(), day.date.getMonth(), 1))
                            }
                          }}
                          className="min-h-[88px] rounded-[22px] p-3 text-left transition-all"
                          style={isSelectedDay
                            ? { background: 'rgba(201,168,76,0.16)', border: '1px solid rgba(201,168,76,0.34)' }
                            : { background: day.inMonth ? 'rgba(255,255,255,0.86)' : 'rgba(245,240,235,0.55)', border: '1px solid var(--portal-border)' }}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="text-sm font-semibold"
                              style={{ color: day.inMonth ? 'var(--portal-text)' : 'var(--portal-text-soft)' }}
                            >
                              {day.label}
                            </span>
                            {day.isToday && (
                              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ background: 'rgba(201,168,76,0.16)', color: 'var(--portal-primary)' }}>
                                Today
                              </span>
                            )}
                          </div>
                          <div className="mt-4 flex gap-1.5">
                            {counts.recommended > 0 && <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#4058c9' }} />}
                            {counts.planned > 0 && <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2d876a' }} />}
                            {counts.draft > 0 && <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#8c6d1c' }} />}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="rounded-[28px] p-4" style={{ background: 'rgba(248,244,238,0.82)', border: '1px solid var(--portal-border)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} />
                          <h3 className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                            {selectedDay ? formatCalendarDate(selectedDay) : 'Pick a day'}
                          </h3>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                          Blue dots are recommended openings, green are already scheduled, and gold are saved drafts you can reopen.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={chooseNow}
                          className="rounded-2xl px-3 py-2 text-xs font-semibold"
                          style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                        >
                          Post now
                        </button>
                        <button
                          type="button"
                          onClick={() => chooseCustomTime(selectedDay)}
                          className="rounded-2xl px-3 py-2 text-xs font-semibold"
                          style={{ background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                        >
                          Custom time for this day
                        </button>
                      </div>
                    </div>

                    {selectableDaySlots.length > 0 ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {selectableDaySlots.map((slot) => {
                          const stateStyle = SLOT_STATE_STYLES[slot.state]
                          const inputValue = slotToInputValue(slot)
                          const isSelected = activeSlotKey === getSlotKey(slot) || (timingMode === 'slot' && scheduledFor === inputValue)

                          return (
                            <button
                              key={`${slot.slot_date_local}-${slot.slot_label}`}
                              type="button"
                              onClick={() => chooseSlot(slot)}
                              className="rounded-[22px] p-3 text-left transition-all"
                              style={isSelected
                                ? { background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.36)' }
                                : { background: 'rgba(255,255,255,0.86)', border: '1px solid var(--portal-border)' }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{slot.slot_start_local}</p>
                                  <p className="mt-1 text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--portal-text-soft)' }}>
                                    {slot.post_type ? slot.post_type.replace(/_/g, ' ') : 'Recommended'}
                                  </p>
                                </div>
                                <span
                                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                                  style={{ background: stateStyle.background, color: stateStyle.color, borderColor: stateStyle.border }}
                                >
                                  {stateStyle.label}
                                </span>
                              </div>
                              <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                                {slot.state === 'occupied_draft'
                                  ? 'Open the saved draft in the editor.'
                                  : 'Create and save a deterministic draft for this slot.'}
                              </p>
                              {slot.state === 'occupied_draft' && (
                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleDeleteDraft(slot)
                                    }}
                                    disabled={deleteBusyKey === `draft:${findDraftForSlot(drafts, slot)?.id || ''}`}
                                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] disabled:opacity-60"
                                    style={{ background: 'rgba(196, 85, 110, 0.10)', color: '#b44660', border: '1px solid rgba(196, 85, 110, 0.18)' }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[22px] p-4 text-sm" style={{ background: 'rgba(255,255,255,0.74)', color: 'var(--portal-text-muted)' }}>
                        No recommended or saved draft slot on this day. Use `Custom time for this day` if you still want to schedule it here.
                      </div>
                    )}

                    {scheduledPostsForSelectedDay.length > 0 && (
                      <div className="mt-4 rounded-[22px] p-4" style={{ background: 'rgba(255,255,255,0.74)', border: '1px solid var(--portal-border)' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                          Scheduled posts
                        </p>
                        <div className="mt-3 space-y-2">
                          {scheduledPostsForSelectedDay.map((post) => (
                            <button
                              key={post.id}
                              type="button"
                              onClick={() => loadScheduledPostForEditing(post)}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left"
                              style={editingScheduledPostId === post.id
                                ? { background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.36)' }
                                : { background: 'rgba(248,244,238,0.85)', border: '1px solid var(--portal-border)' }}
                            >
                              <div>
                                <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                                  {post.localTime}
                                </p>
                                <p className="mt-0.5 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                                  {(post.platforms || []).join(', ') || post.status}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                                  style={{ background: 'rgba(55, 181, 140, 0.12)', color: '#2d876a', borderColor: 'rgba(55, 181, 140, 0.2)' }}
                                >
                                {post.status}
                                </span>
                                {post.status === 'scheduled' && (
                                  <>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--portal-primary)' }}>
                                      Edit
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleDeleteScheduledPost(post)
                                      }}
                                      disabled={deleteBusyKey === `post:${post.id}`}
                                      className="text-[10px] font-semibold uppercase tracking-[0.14em] disabled:opacity-60"
                                      style={{ color: '#b44660' }}
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={handleSubmit}
        isSubmitting={isSubmitting}
        profile={profile}
        content={content}
        imagePreview={mediaPreviewSource}
        dropboxAttachments={dropboxAttachments}
        selectedPlatforms={selectedPlatforms}
        setSelectedPlatforms={setSelectedPlatforms}
        previewPlatform={previewPlatform}
        setPreviewPlatform={setPreviewPlatform}
        timingMode={timingMode}
        scheduledFor={scheduledFor}
        platformCaptions={platformCaptions}
        platformImageVariants={platformImageVariants}
      />
    </>
  )
}
