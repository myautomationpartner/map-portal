import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useOutletContext, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CUSTOMER_VISIBLE_PUBLISHING_PLATFORMS } from '../lib/platformCatalog.jsx'
import {
  deletePost,
  deleteSocialDraft,
  fetchPostById,
  fetchProfile,
  recordPlannerFeedbackEvent,
  reconcileScheduledPosts,
  fetchScheduledPosts,
  fetchSocialDrafts,
  getSecureVaultDocumentUrl,
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
import { getDraftDocumentMediaRefs } from '../lib/campaignDraftAssets'
import {
  AlertCircle, ArrowUpRight, Calendar, CalendarDays, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, History, Images, Loader2,
  Play, Send, Sparkles, UploadCloud, Video, Wand2, X,
  Trash2,
} from 'lucide-react'
import { FaMicrosoft } from 'react-icons/fa'
import { SiDropbox, SiGooglephotos, SiIcloud } from 'react-icons/si'
import MobileVoiceComposer from '../components/MobileVoiceComposer'
import MobilePartnerTopBar from '../components/MobilePartnerTopBar'
import { GeneratedPostcard } from '../components/MobilePartnerChat'
import { isMobilePartnerRolloutTenant } from '../lib/mobilePartnerRollout'
import { createVisionImageDataUrl, isBrandLogoRequest, isLogoOverlayOnlyRequest, resolveCreativeEditTargets, stampBrandLogo } from '../lib/imageAssist'
import { isPromotionalDesignRevision, renderPromotionalGraphic } from '../lib/promoGraphic'

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'

const PHOTO_LIBRARY_LINKS = [
  { label: 'Google', href: 'https://photos.google.com/', action: 'google', Icon: SiGooglephotos, color: '#4285F4' },
  { label: 'Apple Photos', href: 'https://www.icloud.com/photos/', Icon: SiIcloud, color: '#3693F3' },
  { label: 'Dropbox', action: 'dropbox', Icon: SiDropbox, color: '#0061FF' },
  { label: 'OneDrive', href: 'https://onedrive.live.com/', Icon: FaMicrosoft, color: '#00A4EF' },
]

const PLATFORMS = CUSTOMER_VISIBLE_PUBLISHING_PLATFORMS

function formatVisiblePlatformLabels(platformIds = []) {
  const labels = platformIds
    .map((platformId) => PLATFORMS.find((platform) => platform.id === platformId)?.label)
    .filter(Boolean)

  return labels.join(', ')
}

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
const SHARED_SOCIAL_IMAGE_TARGET = {
  label: 'Social-safe image',
  aspectRatio: '1.90:1',
  width: 1200,
  height: 632,
  guidance: 'One shared feed-safe image for multi-platform publishing.',
  source: 'shared_social_safe_fit',
}

const ASSIST_ACTIONS = [
  { id: 'improve', label: 'Improve', description: 'Clean up the caption and make it stronger.' },
  { id: 'shorten', label: 'Shorten', description: 'Keep the idea, cut the extra words.' },
  { id: 'engaging', label: 'Engage', description: 'Add energy without sounding generic.' },
  { id: 'cta', label: 'Add CTA', description: 'Give readers a clearer next step.' },
]

const IMAGE_ASSIST_ACTIONS = [
  { id: 'cleanup', label: 'Enhance', description: 'Improve lighting, sharpness, and contrast.' },
  { id: 'social', label: 'Social-ready', description: 'Turn this into a polished post creative.' },
  { id: 'branded', label: 'Brand polish', description: 'Add a subtle business-ready finish.' },
]

const IMAGE_GENERATION_MODES = [
  { id: 'social_photo', label: 'Social photo', description: 'Natural no-text image' },
  { id: 'branded_post', label: 'Branded post', description: 'Headline + CTA graphic' },
  { id: 'event_flyer', label: 'Event flyer', description: 'Readable event promo' },
  { id: 'promo_ad', label: 'Promo/ad', description: 'Offer-focused creative' },
  { id: 'infographic', label: 'Infographic', description: 'Tips or process visual' },
]

const IMAGE_GENERATION_MODE_BY_ID = Object.fromEntries(
  IMAGE_GENERATION_MODES.map((mode) => [mode.id, mode]),
)

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

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i
const VIDEO_EXTENSION_PATTERN = /\.(mp4|m4v|mov|webm)$/i
const LOCAL_MEDIA_ACCEPT = 'image/*,video/mp4,video/quicktime,video/webm,video/x-m4v'

function isImageAttachment(file) {
  return IMAGE_EXTENSION_PATTERN.test(file?.name || '')
}

function isVideoAttachment(file) {
  return VIDEO_EXTENSION_PATTERN.test(file?.name || '')
}

function isVideoMime(value) {
  return /^video\//i.test(String(value || ''))
}

function isImageMime(value) {
  return /^image\//i.test(String(value || ''))
}

function getExtensionFromUrl(value) {
  const raw = String(value || '')
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.pathname.split('.').pop()?.toLowerCase() || ''
  } catch {
    return raw.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || ''
  }
}

function inferMediaType(input = {}) {
  const explicit = String(input.mediaType || input.media_type || '').toLowerCase()
  if (explicit === 'video' || explicit === 'image') return explicit

  const typeField = String(input.type || '').toLowerCase()
  if (typeField === 'video' || typeField === 'image') return typeField

  const mimeType = String(
    input.mimeType
    || input.mime_type
    || input.contentType
    || input.content_type
    || input.file?.type
    || '',
  ).toLowerCase()
  if (isVideoMime(mimeType)) return 'video'
  if (isImageMime(mimeType)) return 'image'

  const filename = String(input.name || input.fileName || input.filename || input.file?.name || '')
  const url = String(input.url || input.link || input.previewUrl || input.preview_url || '')
  if (VIDEO_EXTENSION_PATTERN.test(filename) || VIDEO_EXTENSION_PATTERN.test(url)) return 'video'
  if (IMAGE_EXTENSION_PATTERN.test(filename) || IMAGE_EXTENSION_PATTERN.test(url)) return 'image'

  const extension = getExtensionFromUrl(url)
  if (['mp4', 'm4v', 'mov', 'webm'].includes(extension)) return 'video'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif', 'svg'].includes(extension)) return 'image'

  return 'image'
}

function isSupportedLocalMedia(file) {
  return isImageMime(file?.type) || isVideoMime(file?.type) || isImageAttachment(file) || isVideoAttachment(file)
}

function isSupportedExternalMedia(file) {
  return isImageAttachment(file) || isVideoAttachment(file)
}

function getMediaLabel(mediaType = 'image') {
  return mediaType === 'video' ? 'video' : 'image'
}

function getMediaMime(input = {}) {
  return input.mimeType || input.mime_type || input.contentType || input.content_type || input.file?.type || ''
}

function createLocalPreviewUrl(file) {
  if (isVideoMime(file?.type) || isVideoAttachment(file)) {
    return URL.createObjectURL(file)
  }
  return readFileAsDataUrl(file)
}

function getDropboxRenderableImageUrl(link) {
  if (!link) return null

  try {
    const url = new URL(link)
    if (!/(^|\.)dropboxusercontent\.com$|(^|\.)dropbox\.com$/i.test(url.hostname)) {
      return link
    }
    url.searchParams.delete('dl')
    url.searchParams.set('raw', '1')
    return url.toString()
  } catch {
    return link
  }
}

function getDropboxPreviewSource(attachments) {
  const mediaAttachment = (attachments || []).find((file) => isSupportedExternalMedia(file))
  if (!mediaAttachment) return null
  return getDropboxRenderableImageUrl(mediaAttachment.link) || mediaAttachment.thumbnail || null
}

function getDropboxThumbSource(file) {
  if (!file) return null
  return getDropboxRenderableImageUrl(file.thumbnail) || null
}

function buildDropboxMediaItem(file, index = 0) {
  if (!file) return null
  const previewUrl = getDropboxRenderableImageUrl(file.link) || getDropboxThumbSource(file)
  const mediaType = inferMediaType({
    ...file,
    url: file.link,
    previewUrl,
  })
  return {
    id: `dropbox:${file.link || file.name || index}`,
    type: 'dropbox',
    mediaType,
    contentType: file.mimeType || file.contentType || '',
    name: file.name || `Dropbox ${getMediaLabel(mediaType)} ${index + 1}`,
    previewUrl,
    thumbUrl: getDropboxThumbSource(file) || previewUrl,
    link: file.link,
    file,
  }
}

function getCampaignRecommendedAssetRefs(draft) {
  return getDraftDocumentMediaRefs(draft)
}

function buildExistingMediaItem(url) {
  if (!url) return null
  const mediaType = inferMediaType({ url })
  return {
    id: `existing:${url}`,
    type: 'existing',
    mediaType,
    name: `Current ${getMediaLabel(mediaType)}`,
    previewUrl: url,
    link: url,
  }
}

function getPreviewSourceFromMediaItem(item) {
  return item?.previewUrl || item?.preview_url || item?.url || item?.link || null
}

function buildPreviewMediaItems({ mediaItems = [], imagePreview = '', dropboxAttachments = [], platformImage = null, activeMediaIndex = 0 }) {
  const selectedItems = (mediaItems || [])
    .map((item, index) => ({
      id: item?.id || `media-${index}`,
      name: item?.name || `Creative ${index + 1}`,
      previewUrl: getPreviewSourceFromMediaItem(item),
      mediaType: inferMediaType(item),
      contentType: getMediaMime(item),
    }))
    .filter((item) => item.previewUrl)

  if (!selectedItems.length && imagePreview) {
    selectedItems.push({
      id: 'primary-preview',
      name: 'Selected media',
      previewUrl: imagePreview,
      mediaType: inferMediaType({ previewUrl: imagePreview }),
    })
  }

  if (!selectedItems.length) {
    dropboxAttachments.forEach((file, index) => {
      const previewUrl = getDropboxRenderableImageUrl(file?.link) || file?.thumbnail || null
      if (previewUrl) {
        selectedItems.push({
          id: `dropbox-preview-${file.link || index}`,
          name: file.name || `Dropbox ${getMediaLabel(inferMediaType(file))} ${index + 1}`,
          previewUrl,
          mediaType: inferMediaType({
            ...file,
            url: file.link,
            previewUrl,
          }),
        })
      }
    })
  }

  const platformImageUrl = platformImage?.url || platformImage?.preview_url || ''
  if (platformImageUrl && selectedItems.length) {
    const replacementIndex = selectedItems[activeMediaIndex] ? activeMediaIndex : 0
    selectedItems[replacementIndex] = {
      ...selectedItems[replacementIndex],
      id: `${selectedItems[replacementIndex].id}:platform-format`,
      name: `${selectedItems[replacementIndex].name} formatted`,
      previewUrl: platformImageUrl,
      mediaType: 'image',
    }
  } else if (platformImageUrl) {
    selectedItems.push({
      id: 'platform-format',
      name: 'Platform formatted image',
      previewUrl: platformImageUrl,
      mediaType: 'image',
    })
  }

  return selectedItems
}

function MediaPreviewAsset({ item, src, alt = '', className = '', controls = false }) {
  const previewSrc = src || getPreviewSourceFromMediaItem(item)
  if (!previewSrc) return null
  const mediaType = inferMediaType(item || { previewUrl: previewSrc })

  if (mediaType === 'video') {
    return (
      <video
        src={previewSrc}
        className={className}
        controls={controls}
        muted
        playsInline
        preload="metadata"
      />
    )
  }

  return <img src={previewSrc} alt={alt} className={className} />
}

function MediaLightbox({ media, onClose }) {
  if (!media?.src) return null
  const mediaType = inferMediaType(media.item || { previewUrl: media.src })
  const isVideo = mediaType === 'video'

  return (
    <div className="create-post-media-lightbox" role="dialog" aria-modal="true" aria-label="Post media preview" onClick={onClose}>
      <div className="create-post-media-lightbox-frame" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="create-post-media-lightbox-close" onClick={onClose} aria-label="Close media preview">
          <X className="h-5 w-5" />
        </button>
        <div className="create-post-media-lightbox-stage">
          {isVideo ? (
            <video src={media.src} controls playsInline />
          ) : (
            <img src={media.src} alt={media.alt || 'Post media preview'} />
          )}
        </div>
        {media.name ? <p>{media.name}</p> : null}
      </div>
    </div>
  )
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
    if (!isReadableFileBlob(file)) {
      reject(new Error('Could not read the selected image file.'))
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target?.result || '')
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function isReadableFileBlob(file) {
  return typeof Blob !== 'undefined' && file instanceof Blob
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

async function normalizeImageForAssist(source, options = {}) {
  const image = await loadImageElement(source, options)
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

async function normalizeRemoteImageForAssist(imageUrl) {
  const renderableUrl = getDropboxRenderableImageUrl(imageUrl) || imageUrl

  try {
    return {
      image_data_url: await normalizeImageForAssist(renderableUrl, { crossOrigin: /^https?:\/\//i.test(renderableUrl) }),
    }
  } catch {
    return { image_url: renderableUrl }
  }
}

async function formatImageForTarget(source, target) {
  const image = await loadImageElement(source, { crossOrigin: /^https?:\/\//i.test(source) })
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) throw new Error('Could not read the selected image size.')

  const scale = Math.min(target.width / sourceWidth, target.height / sourceHeight)
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale))
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale))
  const drawX = Math.round((target.width - drawWidth) / 2)
  const drawY = Math.round((target.height - drawHeight) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not format this image for platforms.')

  context.fillStyle = '#f4f1ec'
  context.fillRect(0, 0, target.width, target.height)
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
  return canvas.toDataURL('image/png')
}

function getDraftMetaImagePrompt(draft) {
  const meta = parseDraftMeta(draft?.review_notes)
  if (typeof meta?.radarAction?.imagePrompt === 'string' && meta.radarAction.imagePrompt.trim()) {
    return meta.radarAction.imagePrompt.trim()
  }
  return ''
}

function buildCaptionImagePrompt(caption, modeLabel) {
  const trimmedCaption = String(caption || '').trim().replace(/\s+/g, ' ').slice(0, 900)
  if (!trimmedCaption) return ''
  return `Create ${String(modeLabel || 'social post image').toLowerCase()} creative that supports this caption: ${trimmedCaption}`
}

async function fetchConnections(clientId) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('social_connections')
    .select('platform, zernio_account_id, zernio_profile_id, username, connected_at')
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

  const scheduled = localDateTimeToDate(value)
  if (Number.isNaN(scheduled.getTime())) {
    throw new Error('Please choose a valid schedule time from the calendar.')
  }

  return scheduled.toISOString()
}

function localDateTimeToDate(value) {
  const parsed = parseLocalDateTime(value)
  if (!parsed) return new Date(Number.NaN)
  return new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute)
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
  const threshold = new Date(Date.now() + 60_000)
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

function buildImageGenerationBrandContext({ profile, slot, draft, mediaSuggestion, mode }) {
  const client = profile?.clients || {}
  const modeLabel = IMAGE_GENERATION_MODE_BY_ID[mode]?.label || 'Social photo'
  const brandColors = client.brand_colors && typeof client.brand_colors === 'object'
    ? Object.entries(client.brand_colors)
      .map(([label, color]) => `${label}: ${color}`)
      .join(', ')
    : ''
  const source = String(draft?.source_workflow || '').trim()
  return [
    `Generation style selected in portal: ${modeLabel}`,
    client.website_url ? `Business website: ${client.website_url}` : '',
    client.logo_url ? `Official logo/reference URL: ${client.logo_url}` : '',
    brandColors ? `Brand colors: ${brandColors}` : '',
    client.business_category ? `Business category: ${client.business_category}` : '',
    client.business_subtype ? `Business specialty: ${client.business_subtype}` : '',
    source ? `Draft source: ${source.replace(/_/g, ' ')}` : '',
    slot?.post_type ? `Planner post type: ${String(slot.post_type).replace(/_/g, ' ')}` : '',
    slot?.slot_label ? `Planner slot: ${slot.slot_label}` : '',
    draft?.title ? `Draft title: ${draft.title}` : '',
    source === 'campaign_partner' ? 'Campaign Partner drafts should favor polished branded campaign creative over generic stock-style photos.' : '',
    mediaSuggestion ? `Partner media direction: ${mediaSuggestion}` : '',
  ].filter(Boolean).join('\n')
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

function PlatformPreview({
  platformId,
  profile,
  content,
  imagePreview,
  dropboxAttachments,
  scheduledFor,
  platformImage,
  mediaItems = [],
  activeMediaIndex = 0,
}) {
  const platform = PLATFORMS.find((item) => item.id === platformId)
  if (!platform) return null

  const businessName = profile?.clients?.business_name || 'Your Business'
  const previewTime = scheduledFor ? formatDetailedLocalDateTime(scheduledFor) : 'Ready to publish'
  const mediaPreviews = buildPreviewMediaItems({
    mediaItems,
    imagePreview,
    dropboxAttachments,
    platformImage,
    activeMediaIndex,
  })
  const attachmentCount = mediaPreviews.length
  const visualItem = mediaPreviews[0] || null
  const visualPreview = visualItem?.previewUrl || ''
  const hasVideo = mediaPreviews.some((item) => item.mediaType === 'video')
  const galleryItems = mediaPreviews.slice(0, 4)
  const extraMediaCount = Math.max(0, attachmentCount - galleryItems.length)
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
        {attachmentCount > 1 ? (
          <div className="platform-preview-gallery" data-count={Math.min(galleryItems.length, 4)}>
            {galleryItems.map((item, index) => (
              <figure key={item.id || `${item.previewUrl}-${index}`}>
                <MediaPreviewAsset item={item} alt={`${platform.label} media ${index + 1}`} />
                {item.mediaType === 'video' && (
                  <span className="platform-preview-video-badge">
                    <Play className="h-3 w-3" />
                  </span>
                )}
                {index === galleryItems.length - 1 && extraMediaCount > 0 && (
                  <figcaption>+{extraMediaCount}</figcaption>
                )}
              </figure>
            ))}
          </div>
        ) : visualPreview ? (
          <MediaPreviewAsset item={visualItem} src={visualPreview} alt={`${platform.label} preview`} />
        ) : (
          <div>
            <Icon className="h-5 w-5" />
            <p>{rules.media || 'Add an image to preview the final creative.'}</p>
          </div>
        )}
        <span>{platformMeta.badge}</span>
        {attachmentCount > 1 && (
          <div className="platform-preview-media-count">
            {hasVideo ? <Video className="h-3 w-3" /> : <Images className="h-3 w-3" />}
            {attachmentCount} media
          </div>
        )}
      </div>

      <div className="platform-preview-copy">
        <p className="whitespace-pre-wrap">
          {platformId === 'instagram' && content ? <strong>{businessName} </strong> : null}
          {caption}
        </p>
      </div>

      <footer className="platform-preview-footer">
        <span>{previewTime}</span>
        <span>{attachmentCount > 1 ? `${attachmentCount} media assets` : hasVideo ? 'Video post' : rules.label || platform.label}</span>
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
  mediaItems,
  activeMediaIndex,
  platforms = PLATFORMS,
  mobilePartnerRollout = false,
}) {
  if (!open) return null

  const activePlatforms = Object.entries(selectedPlatforms)
    .filter(([platformId, enabled]) => enabled && platforms.some((platform) => platform.id === platformId))
    .map(([platformId]) => platformId)

  return (
    <div className={`create-post-review-modal ${mobilePartnerRollout ? 'create-post-review-modal-partner' : ''} fixed inset-0 z-50 flex items-end justify-center bg-[rgba(9,7,4,0.58)] p-3 md:items-center md:p-6`}>
      <div
        className="create-post-review-sheet max-h-[92vh] w-full max-w-[980px] overflow-y-auto rounded-[34px] p-5 md:p-7"
        style={{ background: 'rgba(248,244,238,0.98)', border: '1px solid var(--portal-border)', boxShadow: '0 30px 80px rgba(16, 12, 7, 0.28)' }}
      >
        <div className="create-post-review-head flex items-start justify-between gap-4">
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

        <div className="create-post-review-layout mt-6 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="create-post-review-platforms rounded-[28px] p-4" style={{ background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                Platforms
              </p>
              <div className="mt-3 space-y-2">
                {platforms.map(({ id, label, Icon, accent, soft }) => {
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

            <div className="create-post-review-timing rounded-[28px] p-4" style={{ background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)' }}>
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
                    const platform = platforms.find((item) => item.id === platformId)
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
                  mediaItems={mediaItems}
                  activeMediaIndex={activeMediaIndex}
                />
              </>
            ) : (
              <div className="rounded-[28px] p-6 text-sm" style={{ background: 'rgba(255,255,255,0.84)', border: '1px solid var(--portal-border)', color: 'var(--portal-text-muted)' }}>
                Select at least one platform to preview and approve.
              </div>
            )}
          </div>
        </div>

        <div className="create-post-review-actions mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
            style={{ background: 'linear-gradient(135deg, var(--portal-primary), var(--portal-cyan))', color: 'var(--portal-dark)' }}
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

function MobilePublisherConversation({
  businessName,
  content,
  imagePreview,
  activePlatforms,
  selectedPlatforms,
  setSelectedPlatforms,
  platforms,
  timingMode,
  scheduledFor,
  minScheduleValue,
  onCaptionChange,
  onChooseNow,
  onChooseCustom,
  onScheduledForChange,
  onReview,
  onBack,
  reviewComposer,
  reviewMessages,
  reviewPending,
  reviewRevisionCount,
  reviewLastChange,
  promoDesign,
  onReviewComposerChange,
  onReviewRequest,
  onReviewPhotos,
  isSubmitting,
  isViewingPublishedPost,
  charOver,
}) {
  const reviewCardRef = useRef(null)
  const [revisionHighlight, setRevisionHighlight] = useState(false)
  const draft = {
    previewUrl: imagePreview,
    caption: content,
    platforms: activePlatforms,
    promoDesign,
  }

  useEffect(() => {
    if (!reviewRevisionCount) return undefined
    let timer
    const frame = window.requestAnimationFrame(() => {
      setRevisionHighlight(true)
      reviewCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      timer = window.setTimeout(() => setRevisionHighlight(false), 2400)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (timer) window.clearTimeout(timer)
    }
  }, [reviewRevisionCount])

  function handleDraftChange(nextDraft) {
    if (nextDraft.caption !== content) onCaptionChange(nextDraft.caption)

    const nextSelected = { ...selectedPlatforms }
    platforms.forEach(({ id }) => {
      nextSelected[id] = nextDraft.platforms.includes(id)
    })
    setSelectedPlatforms(nextSelected)
  }

  return (
    <section className="mobile-publisher-conversation" aria-label="Final social post review">
      <div className="mobile-partner-message assistant">
        <span className="mobile-partner-message-avatar">
          <img src="/assets/map-option-b-mark.png" alt="" />
          <i aria-hidden="true" />
        </span>
        <div className="mobile-partner-message-bubble">
          <strong>One last check, {businessName}.</strong>
          <p>Confirm the photo, caption, platforms, and timing below. Nothing posts until you approve it.</p>
        </div>
      </div>

      <div className="mobile-publisher-updated-card" data-updated={revisionHighlight ? 'true' : undefined}>
      <GeneratedPostcard
        cardRef={reviewCardRef}
        draft={draft}
        onChange={handleDraftChange}
        onReview={onReview}
        onReset={onBack}
        reviewLabel={timingMode === 'now' ? 'Final approval' : 'Review schedule'}
        resetLabel="Back to Post"
        statusLabel={reviewRevisionCount ? 'Updated' : 'Final review'}
      />
      {reviewRevisionCount ? (
        <p>
          {reviewLastChange === 'image'
            ? 'Image updated from your chat request.'
            : reviewLastChange === 'caption_and_image'
              ? 'Image and caption updated from your chat request.'
              : 'Caption updated from your chat request.'}
        </p>
      ) : null}
      </div>

      <div className="mobile-publisher-timing">
        <div>
          <strong>When should this go out?</strong>
          <span>{timingMode === 'now' ? 'Ready to publish now' : scheduledFor ? formatDetailedLocalDateTime(scheduledFor) : 'Choose a date and time'}</span>
        </div>
        <div className="mobile-publisher-timing-actions">
          <button type="button" onClick={onBack}>Cancel</button>
          <button type="button" onClick={onChooseNow} data-active={timingMode === 'now'}>Post now</button>
          <button type="button" onClick={onChooseCustom} data-active={timingMode !== 'now'}>Schedule</button>
        </div>
        {timingMode !== 'now' ? (
          <input
            type="datetime-local"
            value={scheduledFor}
            min={minScheduleValue}
            onChange={(event) => onScheduledForChange(event.target.value)}
            aria-label="Schedule date and time"
          />
        ) : null}
      </div>

      <p className="mobile-publisher-safety-note">
        {isViewingPublishedPost
          ? 'This post has already been published.'
          : charOver
            ? 'Shorten the caption before final approval.'
            : isSubmitting
              ? 'Preparing your final approval…'
              : 'Final approval opens one last confirmation. It does not publish by itself.'}
      </p>

      {reviewMessages.map((message) => (
        <div key={message.id} className={`mobile-partner-inline-message ${message.role}`}>
          {message.role === 'assistant' ? (
            <span className="mobile-partner-message-avatar">
              <img src="/assets/map-option-b-mark.png" alt="" />
              <i aria-hidden="true" />
            </span>
          ) : null}
          <div className="mobile-partner-inline-bubble"><p>{message.content}</p></div>
        </div>
      ))}

      {reviewPending ? (
        <div className="mobile-partner-inline-message assistant" aria-live="polite">
          <span className="mobile-partner-message-avatar">
            <img src="/assets/map-option-b-mark.png" alt="" />
            <i aria-hidden="true" />
          </span>
          <div className="mobile-partner-inline-bubble mobile-partner-thinking">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p>Working on your request…</p>
          </div>
        </div>
      ) : null}

      <div className="mobile-publisher-chat-composer">
        <MobileVoiceComposer
          value={reviewComposer}
          onChange={onReviewComposerChange}
          onSubmit={onReviewRequest}
          onPhotos={onReviewPhotos}
          placeholder="Ask for changes before approval…"
          disabled={reviewPending || isSubmitting || isViewingPublishedPost}
          submitOnEnter={false}
          stableTyping
        />
        <p>Type or speak an edit. My Partner will revise this draft, not publish it.</p>
      </div>
    </section>
  )
}

export default function CreatePost() {
  const outlet = useOutletContext() || {}
  const { requireWriteAccess } = outlet
  const mobilePartnerRollout = isMobilePartnerRolloutTenant(outlet.tenant)

  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') || ''
  const returnView = searchParams.get('returnView') || ''
  const fileInputRef = useRef(null)
  const composerRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const hydratingDraftRef = useRef(false)
  const recentPhotosHandledRef = useRef(false)

  const [content, setContent] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [localImageItems, setLocalImageItems] = useState([])
  const [mediaSlideIndex, setMediaSlideIndex] = useState(0)
  const [imageGenerateState, setImageGenerateState] = useState('idle')
  const [imageGenerateError, setImageGenerateError] = useState('')
  const [imageGenerationMode, setImageGenerationMode] = useState('social_photo')
  const [imageImproveState, setImageImproveState] = useState('idle')
  const [imageImproveMode, setImageImproveMode] = useState('')
  const [imageImproveError, setImageImproveError] = useState('')
  const [dropboxAttachments, setDropboxAttachments] = useState([])
  const [timingMode, setTimingMode] = useState(mobilePartnerRollout ? 'now' : 'slot')
  const [selectedPlatforms, setSelectedPlatforms] = useState({
    facebook: mobilePartnerRollout,
    instagram: mobilePartnerRollout,
    tiktok: false,
    twitter: mobilePartnerRollout,
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
  const [viewingPublishedPostId, setViewingPublishedPostId] = useState('')
  const [viewingPublishedPost, setViewingPublishedPost] = useState(null)
  const [existingMediaUrl, setExistingMediaUrl] = useState('')
  const [deleteBusyKey, setDeleteBusyKey] = useState('')
  const [assistState, setAssistState] = useState('idle')
  const [assistAction, setAssistAction] = useState('')
  const [assistError, setAssistError] = useState('')
  const [assistSuggestions, setAssistSuggestions] = useState([])
  const [reviewComposer, setReviewComposer] = useState('')
  const [reviewMessages, setReviewMessages] = useState([])
  const [reviewPending, setReviewPending] = useState(false)
  const [reviewRevisionCount, setReviewRevisionCount] = useState(0)
  const [reviewLastChange, setReviewLastChange] = useState('')
  const [promoDesign, setPromoDesign] = useState(null)
  const [promoRenderAssets, setPromoRenderAssets] = useState(null)
  const [platformVariants, setPlatformVariants] = useState({})
  const [platformFormatStatus, setPlatformFormatStatus] = useState('')
  const [imageFormatState, setImageFormatState] = useState('idle')
  const [imageFormatStatus, setImageFormatStatus] = useState('')
  const [mediaLightbox, setMediaLightbox] = useState(null)

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id
  const visiblePlatforms = mobilePartnerRollout
    ? PLATFORMS
      .filter((platform) => ['facebook', 'instagram', 'twitter'].includes(platform.id))
      .map((platform) => platform.id === 'twitter' ? { ...platform, label: 'X' } : platform)
    : PLATFORMS
  const draftTargetDate = searchParams.get('date') || ''
  const draftTargetSlot = searchParams.get('slot') || ''
  const draftTargetId = searchParams.get('draftId') || ''
  const editTargetPostId = searchParams.get('editPost') || ''
  const viewTargetPostId = searchParams.get('viewPost') || ''
  const targetPostId = viewTargetPostId || editTargetPostId

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

  const charLimit = 2200
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
        mediaType: inferMediaType({ file: imageFile, previewUrl: imagePreview }),
        contentType: imageFile?.type || '',
        mimeType: imageFile?.type || '',
        name: imageFile?.name || 'Selected media',
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
  const activeCreativeMediaType = inferMediaType(activeCreativeItem || { file: imageFile, previewUrl: mediaPreviewSource })
  const activeCreativeIsVideo = activeCreativeMediaType === 'video'
  const canImproveImage = Boolean(clientId && mediaPreviewSource && !isSubmitting && !activeCreativeIsVideo)
  const selectedDaySlots = selectedDay ? (slotsByDate.get(selectedDay) || []) : []
  const selectableDaySlots = selectedDaySlots.filter((slot) => ['recommended_fill', 'occupied_draft'].includes(slot.state))
  const activeSlot = useMemo(() => {
    if (!activeSlotKey || !calendar?.slots) return null
    return calendar.slots.find((slot) => getSlotKey(slot) === activeSlotKey) || null
  }, [activeSlotKey, calendar])
  const activeDraft = useMemo(() => drafts.find((draft) => draft.id === activeDraftId) || findDraftForSlot(drafts, activeSlot), [activeDraftId, drafts, activeSlot])
  const selectedImageGenerationMode = IMAGE_GENERATION_MODE_BY_ID[imageGenerationMode] || IMAGE_GENERATION_MODES[0]
  const partnerImagePrompt = useMemo(
    () => getDraftMetaImagePrompt(activeDraft) || mediaSuggestion,
    [activeDraft, mediaSuggestion],
  )
  const imageGenerationPrompt = useMemo(
    () => partnerImagePrompt || buildCaptionImagePrompt(content, selectedImageGenerationMode.label),
    [content, partnerImagePrompt, selectedImageGenerationMode.label],
  )
  const canGenerateImage = Boolean(clientId && imageGenerationPrompt)
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

  const isViewingPublishedPost = Boolean(viewingPublishedPostId)
  const viewedPublishedAt = viewingPublishedPost?.published_at || viewingPublishedPost?.scheduled_for || viewingPublishedPost?.created_at || ''
  const timingSummary = isViewingPublishedPost
    ? `Posted ${formatDetailedLocalDateTime(isoToLocalInputValue(viewedPublishedAt, calendar?.policy?.timezone || profile?.clients?.timezone || 'America/New_York'))}`
    : timingMode === 'now'
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
    if (!mediaLightbox) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') setMediaLightbox(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mediaLightbox])

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
    const sourceMediaAssets = Array.isArray(meta.mediaAssets)
      ? meta.mediaAssets
        .map((asset, index) => ({
          name: asset?.name || `Content Partner media ${index + 1}`,
          link: asset?.url || asset?.link || '',
          thumbnail: asset?.thumbnail || asset?.previewUrl || asset?.url || '',
          size: Number(asset?.size || 0),
          mediaType: inferMediaType(asset),
          contentType: asset?.contentType || asset?.content_type || asset?.mimeType || asset?.mime_type || '',
          source: asset?.source || 'content_partner',
        }))
        .filter((asset) => asset.link)
      : []
    hydratingDraftRef.current = true
    setViewingPublishedPostId('')
    setViewingPublishedPost(null)
    setActiveDraftId(draft.id || '')
    setActiveSlotKey(getSlotKey(slot))
    setSelectedAngleId(getDraftAngleId(draft))
    setAngleChoices(extractAngleChoices(draft))
    setMediaSuggestion(extractMediaSuggestion(draft))
    setGeneratedCaption(draft.draft_caption || '')
    setContent(draft.draft_caption || '')
    setImageGenerationMode(draft.source_workflow === 'campaign_partner' ? 'branded_post' : 'social_photo')
    setPlatformVariants(meta.platformVariants || {})
    setPlatformFormatStatus(meta.platformVariants ? 'Saved platform captions loaded.' : '')
    setImageFile(null)
    setImagePreview(null)
    setExistingMediaUrl('')
    setLocalImageItems([])
    setDropboxAttachments(sourceMediaAssets)
    setMediaSlideIndex(0)
    setDraftDirty(false)
    setDraftStatus(draft.draft_caption ? 'Draft loaded.' : 'Draft ready.')
    setDraftError('')
    setTimingMode('slot')
    setScheduledFor(slotToInputValue(slot))
    setSelectedDay(slot.slot_date_local)
    const parsed = parseDateOnly(slot.slot_date_local)
    if (parsed) setViewedMonth(new Date(parsed.year, parsed.month - 1, 1))

    const campaignAssetRefs = getCampaignRecommendedAssetRefs(draft)
    if (campaignAssetRefs.length) {
      setDraftStatus(`Loading ${campaignAssetRefs.length} campaign asset${campaignAssetRefs.length === 1 ? '' : 's'}...`)
      Promise.all(campaignAssetRefs.map(async (asset, index) => {
        const payload = await getSecureVaultDocumentUrl(asset.documentId, 'view')
        return {
          name: payload.file_name || asset.name || `Campaign asset ${index + 1}`,
          link: payload.signed_url,
          thumbnail: payload.signed_url,
          size: Number(payload.size_bytes || 0),
          mediaType: inferMediaType({
            name: payload.file_name || asset.name,
            mimeType: payload.mime_type,
            url: payload.signed_url,
          }),
          contentType: payload.mime_type || '',
          mimeType: payload.mime_type || '',
          source: 'campaign_partner',
          assetUse: asset.use || '',
        }
      }))
        .then((campaignAssets) => {
          const mediaAssets = campaignAssets.filter((asset) => (
            asset.link
            && (
              isImageMime(asset.contentType)
              || isVideoMime(asset.contentType)
              || isImageAttachment(asset)
              || isVideoAttachment(asset)
            )
          ))
          if (!mediaAssets.length) return
          setDropboxAttachments((current) => {
            const links = new Set(current.map((asset) => asset.link).filter(Boolean))
            return [...current, ...mediaAssets.filter((asset) => !links.has(asset.link))]
          })
          setDraftStatus(`${mediaAssets.length} Campaign Partner asset${mediaAssets.length === 1 ? '' : 's'} attached.`)
        })
        .catch((error) => {
          console.error('[CampaignAssetLoad]', error)
          setDraftStatus('Draft loaded. Recommended campaign asset could not be attached automatically.')
        })
    }

    window.setTimeout(() => {
      hydratingDraftRef.current = false
    }, 0)
  }, [])

  const applyGeneratedDraftToComposer = useCallback((generated, slot, draftId = '') => {
    hydratingDraftRef.current = true
    setViewingPublishedPostId('')
    setViewingPublishedPost(null)
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
    setImageGenerationMode('branded_post')
    setPlatformVariants({})
    setPlatformFormatStatus('')
    setImageFile(null)
    setImagePreview(null)
    setExistingMediaUrl('')
    setLocalImageItems([])
    setDropboxAttachments([])
    setMediaSlideIndex(0)
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

  const getDraftLoadedMessage = useCallback((draft) => {
    const source = String(draft?.source_workflow || '').trim()
    if (source === 'chatwoot_content_partner') return 'Content Partner draft loaded.'
    if (source === 'campaign_partner') return 'Campaign Partner draft loaded.'
    if (source === 'opportunity_radar') return 'Opportunity Radar draft loaded.'
    return 'Draft loaded.'
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
    setViewingPublishedPostId('')
    setViewingPublishedPost(null)
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
      tiktok: Boolean(post.platforms?.includes('tiktok')),
      twitter: Boolean(post.platforms?.includes('twitter')),
    })
    setPreviewPlatform(post.platforms?.find((platformId) => PLATFORMS.some((platform) => platform.id === platformId)) || 'facebook')
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

  const loadPublishedPostForViewing = useCallback((post) => {
    if (!post) return

    const timezone = calendar?.policy?.timezone || profile?.clients?.timezone || 'America/New_York'
    const publishedAt = post.published_at || post.scheduled_for || post.created_at || ''
    const localPublishedAt = isoToLocalInputValue(publishedAt, timezone)
    const localDate = localPublishedAt ? localPublishedAt.slice(0, 10) : selectedDay

    hydratingDraftRef.current = true
    setViewingPublishedPostId(post.id)
    setViewingPublishedPost(post)
    setEditingScheduledPostId('')
    setEditingScheduledPostRef('')
    setActiveDraftId('')
    setActiveSlotKey('')
    setSelectedAngleId('')
    setAngleChoices([])
    setMediaSuggestion('')
    setGeneratedCaption('')
    setContent(post.content || '')
    setPlatformVariants(post.platform_variants_json || {})
    setPlatformFormatStatus(post.platform_variants_json ? 'Saved platform captions loaded.' : '')
    setSelectedPlatforms({
      facebook: Boolean(post.platforms?.includes('facebook')),
      instagram: Boolean(post.platforms?.includes('instagram')),
      tiktok: Boolean(post.platforms?.includes('tiktok')),
      twitter: Boolean(post.platforms?.includes('twitter')),
    })
    setPreviewPlatform(post.platforms?.find((platformId) => PLATFORMS.some((platform) => platform.id === platformId)) || 'facebook')
    setTimingMode('now')
    setScheduledFor('')
    setSelectedDay(localDate || selectedDay)
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
    setDropboxAttachments([])
    setDraftStatus('Posted item loaded for viewing.')
    setDraftError('')
    setDraftDirty(false)
    setErrorMsg('')
    setReviewOpen(false)
    setSearchParams({ viewPost: post.id })
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    window.setTimeout(() => {
      hydratingDraftRef.current = false
    }, 0)
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
    setDraftStatus(getDraftLoadedMessage(draft))
  }, [draftTargetId, drafts, draftLoading, activeDraftId, applyDraftToComposer, getDraftLoadedMessage])

  useEffect(() => {
    if (!targetPostId) return undefined
    if (editingScheduledPostId === targetPostId || viewingPublishedPostId === targetPostId) return undefined

    const scheduledTarget = scheduledPostsDetailed.find((post) => post.id === targetPostId)
    if (scheduledTarget) {
      loadScheduledPostForEditing(scheduledTarget)
      return undefined
    }

    let cancelled = false
    setDraftStatus('Loading posted item...')

    fetchPostById(targetPostId)
      .then((post) => {
        if (cancelled || !post) return
        if (String(post.status || '').toLowerCase() === 'scheduled') {
          const timezone = calendar?.policy?.timezone || profile?.clients?.timezone || 'America/New_York'
          const parts = post.scheduled_for ? getDatePartsForZone(new Date(post.scheduled_for), timezone) : null
          loadScheduledPostForEditing(parts ? { ...post, localDate: parts.date, localTime: parts.time } : post)
          return
        }
        loadPublishedPostForViewing(post)
      })
      .catch((error) => {
        if (cancelled) return
        setDraftStatus('')
        setErrorMsg(error.message || 'Could not load this post.')
      })

    return () => {
      cancelled = true
    }
  }, [
    targetPostId,
    scheduledPostsDetailed,
    editingScheduledPostId,
    viewingPublishedPostId,
    loadScheduledPostForEditing,
    loadPublishedPostForViewing,
    calendar?.policy?.timezone,
    profile?.clients?.timezone,
  ])

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
    await addLocalMediaFiles(files)
    event.target.value = ''
  }

  function handleCaptionChange(nextContent) {
    setContent(nextContent)
    setPlatformVariants({})
    setPlatformFormatStatus('Base caption changed. Run Partner Format to refresh platform captions.')
    setErrorMsg('')
    if (imageGenerateError) setImageGenerateError('')
    if (!hydratingDraftRef.current && activeDraftId) {
      setDraftDirty(true)
      setDraftStatus('Saving caption edits…')
    }
  }

  async function addLocalMediaFiles(files, source = 'local') {
    const mediaFiles = files.filter((file) => isSupportedLocalMedia(file))
    if (!mediaFiles.length) {
      setErrorMsg('Choose an image or video file for post creative.')
      return
    }

    if (mediaFiles.length !== files.length) {
      setErrorMsg('Some files were skipped because they were not supported image or video files.')
    } else {
      setErrorMsg('')
    }

    const items = await Promise.all(mediaFiles.map(async (file, index) => {
      const mediaType = inferMediaType({ file })
      return {
        id: `${source}:${file.name}:${file.lastModified}:${index}:${Date.now()}`,
        type: source === 'google' ? 'google' : 'local',
        mediaType,
        contentType: file.type || '',
        mimeType: file.type || '',
        name: file.name || `${mediaType === 'video' ? 'Video' : 'Image'} ${index + 1}`,
        file,
        previewUrl: await createLocalPreviewUrl(file),
      }
    }))

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

  useEffect(() => {
    const recentPhotos = Array.isArray(location.state?.recentPhotos) ? location.state.recentPhotos : []
    const preselectedPlatforms = Array.isArray(location.state?.preselectedPlatforms)
      ? location.state.preselectedPlatforms
      : []
    const initialCaption = String(location.state?.initialCaption || '').trim()
    const partnerPrompt = String(location.state?.partnerPrompt || '').trim()
    const imageCountAnalyzed = Number(location.state?.imageCountAnalyzed || 0)
    const partnerConversation = Array.isArray(location.state?.partnerConversation)
      ? location.state.partnerConversation
        .filter((message) => ['user', 'assistant'].includes(message?.role) && String(message?.content || '').trim())
        .slice(-8)
        .map((message, index) => ({
          id: `handoff-${index}-${Date.now()}`,
          role: message.role,
          content: String(message.content).trim().slice(0, 900),
        }))
      : []
    const handedOffPromoDesign = location.state?.promoDesign && typeof location.state.promoDesign === 'object'
      ? location.state.promoDesign
      : null
    const handedOffPromoAssets = handedOffPromoDesign
      ? {
          sourceFile: location.state?.promoSourceFile || null,
          sourceImageBase64: String(location.state?.promoSourceImageBase64 || ''),
          sourceImageMimeType: String(location.state?.promoSourceImageMimeType || 'image/jpeg'),
          logoBase64: String(location.state?.promoLogoBase64 || ''),
          logoMimeType: String(location.state?.promoLogoMimeType || 'image/png'),
        }
      : null
    if (recentPhotosHandledRef.current || (!recentPhotos.length && !preselectedPlatforms.length && !initialCaption)) return

    recentPhotosHandledRef.current = true
    if (initialCaption) {
      setContent(initialCaption)
      setGeneratedCaption(initialCaption)
      setPlatformVariants({})
      setDraftStatus(imageCountAnalyzed
        ? `My Partner used your ${imageCountAnalyzed === 1 ? 'photo' : `${imageCountAnalyzed} photos`} and instructions to create this draft. Review it before publishing.`
        : 'My Partner used your instructions to create this draft. Review it before publishing.')
      if (partnerPrompt) setMediaSuggestion(`Customer request: ${partnerPrompt}`)
      if (partnerConversation.length) setReviewMessages(partnerConversation)
      if (handedOffPromoDesign) {
        setPromoDesign(handedOffPromoDesign)
        setPromoRenderAssets(handedOffPromoAssets)
      }
    }
    if (preselectedPlatforms.length) {
      const selected = new Set(preselectedPlatforms)
      setSelectedPlatforms((current) => ({
        ...current,
        facebook: selected.has('facebook'),
        instagram: selected.has('instagram'),
        twitter: selected.has('twitter'),
      }))
    }
    if (recentPhotos.length) void addLocalMediaFiles(recentPhotos, 'recent')
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    // This one-time handoff intentionally consumes router state from the mobile photo picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.state, navigate])

  async function handleChooseGoogle() {
    if (!requireWriteAccess('choose Google media')) return
    if (isSubmitting) return

    setImageGenerateError('')
    setImageImproveError('')
    setErrorMsg('')

    try {
      const files = await openGoogleImagePicker()
      if (!files.length) return
      await addLocalMediaFiles(files, 'google')
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
      const mediaFiles = selectedFiles.filter((file) => isSupportedExternalMedia(file))
      if (!mediaFiles.length) {
        if (selectedFiles.length) setErrorMsg('Choose image or video files from Dropbox for post creative.')
        return
      }

      setDropboxAttachments((previous) => {
        const existingLinks = new Set(previous.map((file) => file.link))
        return [
          ...previous,
          ...mediaFiles.filter((file) => file.link && !existingLinks.has(file.link)),
        ]
      })
      setMediaSlideIndex(creativeItems.length)
      clearPlatformImageVariants('')
      setDraftStatus(`${mediaFiles.length} Dropbox media item${mediaFiles.length === 1 ? '' : 's'} added.`)
    } catch (error) {
      console.error('[DropboxChooser]', error)
      setErrorMsg(error.message || 'Could not open Dropbox chooser.')
    }
  }

  async function handleGenerateImage() {
    if (!requireWriteAccess('generate images for posts')) return
    if (!clientId) {
      setImageGenerateError('Client profile is still loading. Try again in a moment.')
      return
    }
    if (!imageGenerationPrompt) {
      setImageGenerateError('Write a caption or load a Radar draft before generating an image.')
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
        image_mode: imageGenerationMode,
        platforms: activePlatforms,
        brand_context: buildImageGenerationBrandContext({
          profile,
          slot: activeSlot,
          draft: activeDraft,
          mediaSuggestion: imageGenerationPrompt,
          mode: imageGenerationMode,
        }),
        size: '1024x1024',
        quality: imageGenerationMode === 'social_photo' ? 'low' : 'medium',
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
      setDraftStatus(`${selectedImageGenerationMode.label} generated and attached. Review it before approving the post.`)
    } catch (error) {
      console.error('[GeneratePublisherImage]', error)
      setImageGenerateError(error.message || 'Could not generate an image right now.')
      setImageGenerateState('error')
    }
  }

  async function getImageImproveInput(sourceItem = activeCreativeItem) {
    if (sourceItem?.type === 'dropbox' || sourceItem?.type === 'existing') {
      const imageUrl = sourceItem.previewUrl || sourceItem.link || ''
      if (imageUrl && /^https?:\/\//i.test(imageUrl)) return normalizeRemoteImageForAssist(imageUrl)
    }

    const sourceFile = sourceItem?.file
    const activeFile = isReadableFileBlob(sourceFile)
      ? sourceFile
      : (!sourceItem && isReadableFileBlob(imageFile) ? imageFile : null)
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

    const activePreview = sourceItem?.previewUrl || imagePreview
    if (typeof activePreview === 'string' && activePreview.startsWith('data:image/')) {
      return { image_data_url: await normalizeImageForAssist(activePreview) }
    }

    const imageUrl = sourceItem?.previewUrl || sourceItem?.link || existingMediaUrl || dropboxPreviewSource || ''
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      return normalizeRemoteImageForAssist(imageUrl)
    }

    throw new Error('Add or select an image before using Image Assist.')
  }

  function attachImprovedImage({ file, previewUrl, mode, sourceItem = activeCreativeItem }) {
    const improvedItem = {
      id: `improved:${mode}:${Date.now()}`,
      type: 'local',
      name: `Partner improved ${mode || 'image'}`,
      file,
      previewUrl,
    }

    if (sourceItem?.type === 'local' || sourceItem?.type === 'generated' || sourceItem?.type === 'google') {
      const sourceIndex = localImageItems.findIndex((item) => item.id === sourceItem.id)
      if (sourceIndex >= 0) {
        const nextItems = [...localImageItems]
        nextItems[sourceIndex] = improvedItem
        setLocalImageItems(nextItems)
        setMediaSlideIndex(sourceIndex)
      } else {
        setLocalImageItems([improvedItem])
        setMediaSlideIndex(0)
      }
    } else if (sourceItem?.type === 'dropbox') {
      setDropboxAttachments((previous) => previous.filter((item) => item.link !== sourceItem.link))
      setLocalImageItems((previous) => [improvedItem, ...previous])
      setMediaSlideIndex(0)
    } else {
      setLocalImageItems([improvedItem])
      setMediaSlideIndex(0)
    }

    setImageFile(file)
    setImagePreview(previewUrl)
    setExistingMediaUrl('')
  }

  async function handleImproveImage(mode, sourceItem = activeCreativeItem, options = {}) {
    if (!requireWriteAccess('improve images with Partner')) return
    if (!clientId) {
      setImageImproveError('Client profile is still loading. Try again in a moment.')
      return
    }

    setImageImproveState('improving')
    setImageImproveMode(mode)
    setImageImproveError('')
    setImageGenerateError('')
    setErrorMsg('')

    try {
      const imageInput = await getImageImproveInput(sourceItem)
      const payload = await improvePublisherImage({
        client_id: clientId,
        business_name: profile?.clients?.business_name || '',
        caption: options.captionOverride || content,
        platforms: activePlatforms,
        mode,
        instruction: options.instruction || '',
        use_brand_logo: options.useBrandLogo === true,
        logo_overlay_only: options.logoOverlayOnly === true,
        quality: options.quality || 'low',
        ...imageInput,
      })
      let finalImageBase64 = payload.image_base64
      let finalMimeType = payload.mime_type || 'image/png'
      if (options.useBrandLogo === true) {
        const stamped = await stampBrandLogo({
          imageBase64: finalImageBase64,
          imageMimeType: finalMimeType,
          logoBase64: payload.brand_logo_base64,
          logoMimeType: payload.brand_logo_mime_type || 'image/png',
        })
        finalImageBase64 = stamped.imageBase64
        finalMimeType = stamped.mimeType
      }
      const file = base64ToImageFile(finalImageBase64, finalMimeType, `partner-improved-${mode || 'image'}.png`)
      const previewUrl = `data:${finalMimeType};base64,${finalImageBase64}`
      if (!options.deferAttach) {
        attachImprovedImage({ file, previewUrl, mode, sourceItem })
        clearPlatformImageVariants('')
      }
      setImageImproveState('ready')
      setDraftStatus(options.deferAttach ? 'Image generated. Verifying the requested change…' : 'Improved image attached. Review it before approving the post.')
      return { payload, previewUrl, file, finalImageBase64, finalMimeType }
    } catch (error) {
      console.error('[ImprovePublisherImage]', error)
      setImageImproveError(error.message || 'Could not improve this image right now.')
      setImageImproveState('error')
      if (options.throwOnError) throw error
      return null
    }
  }

  async function handlePartnerAssist(actionId) {
    if (!requireWriteAccess('use Partner Assist')) return
    if (!clientId) {
      setAssistError('Client profile is still loading. Try again in a moment.')
      return
    }
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

  async function handleReviewRequest(text) {
    const request = String(text || '').trim()
    if (!request || reviewPending) return
    if (!requireWriteAccess('revise this post with My Partner')) return
    if (!clientId || !content.trim()) {
      setReviewMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: 'The draft is still loading. Try that request again in a moment.',
      }])
      return
    }

    setReviewComposer('')
    setReviewPending(true)
    setReviewMessages((current) => [...current, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: request,
    }])

    try {
      if (promoDesign && promoRenderAssets && isPromotionalDesignRevision(request)) {
        const payload = await generatePublisherAssist({
          client_id: clientId,
          action: 'promo_brief',
          caption: request,
          platforms: activePlatforms,
          max_chars: charLimit,
          context: [
            `Current promo design: ${JSON.stringify(promoDesign)}`,
            `Latest customer request: ${request}`,
            'Revise only what the customer requested. Preserve every unchanged exact fact.',
          ].join('\n'),
        })
        const nextPromoDesign = payload?.promo_design
        if (!nextPromoDesign?.headline || !nextPromoDesign?.caption) {
          throw new Error('My Partner could not rebuild that promotional graphic safely.')
        }
        const rendered = await renderPromotionalGraphic({
          ...promoRenderAssets,
          brief: nextPromoDesign,
        })
        attachImprovedImage({
          file: rendered.file,
          previewUrl: rendered.previewUrl,
          mode: 'promo',
          sourceItem: activeCreativeItem,
        })
        clearPlatformImageVariants('')
        setPromoDesign(nextPromoDesign)
        setContent(nextPromoDesign.caption)
        setGeneratedCaption(nextPromoDesign.caption)
        setPlatformVariants({})
        setDraftStatus('Promotional graphic rebuilt with the requested details. Review it before approving the post.')
        setReviewLastChange('caption_and_image')
        setReviewRevisionCount((current) => current + 1)
        setReviewMessages((current) => [...current, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'Done — I rebuilt the promotional graphic with the exact requested details.',
        }])
        return
      }

      const recentConversation = reviewMessages
        .slice(-6)
        .map((message) => `${message.role === 'user' ? 'Customer' : 'Partner'}: ${message.content}`)
        .join('\n')
      const payload = await generatePublisherAssist({
        client_id: clientId,
        action: 'creative_chat',
        caption: content,
        platforms: activePlatforms,
        max_chars: charLimit,
        context: [
          `Latest customer request: ${request}`,
          `A postcard image is currently ${imagePreview ? 'attached' : 'not attached'}.`,
          recentConversation ? `Recent review conversation:\n${recentConversation}` : '',
        ].filter(Boolean).join('\n'),
      })
      let decision = payload?.creative_decision
      if (!decision?.intent) throw new Error('My Partner could not understand that request.')

      const brandLogoRequested = isBrandLogoRequest(request)
      let { changesCaption, changesImage } = resolveCreativeEditTargets({
        request,
        intent: decision.intent,
        hasImage: Boolean(imagePreview),
      })

      if (changesCaption && decision.caption?.trim() === content.trim()) {
        const retryPayload = await generatePublisherAssist({
          client_id: clientId,
          action: 'creative_chat',
          caption: content,
          platforms: activePlatforms,
          max_chars: charLimit,
          context: [
            `Latest customer request: ${request}`,
            'The first proposed caption was identical to the original. Return a materially different complete caption that clearly performs the request.',
          ].join('\n'),
        })
        const retryDecision = retryPayload?.creative_decision
        if (retryDecision?.intent) {
          decision = retryDecision
          ;({ changesCaption, changesImage } = resolveCreativeEditTargets({
            request,
            intent: decision.intent,
            hasImage: Boolean(imagePreview),
          }))
        }
      }

      if (changesCaption) {
        if (!decision.caption?.trim()) throw new Error('My Partner did not return an updated caption.')
        if (decision.caption.trim() === content.trim()) {
          throw new Error('That request did not produce a different caption. Try describing the tone or wording you want.')
        }
        if (/\b(shorter|shorten|concise|trim)\b/i.test(request) && decision.caption.trim().length >= content.trim().length) {
          throw new Error('The proposed caption was not actually shorter, so I kept your original.')
        }
        const verificationPayload = await generatePublisherAssist({
          client_id: clientId,
          action: 'verify_caption_edit',
          caption: decision.caption.trim(),
          platforms: activePlatforms,
          max_chars: charLimit,
          context: [
            `Customer request: ${request}`,
            `Original caption: ${content.trim()}`,
          ].join('\n'),
        })
        if (verificationPayload?.verification?.passed !== true) {
          throw new Error(`I made a revision, but could not verify it matched your request. Your original is still safe. ${verificationPayload?.verification?.summary || ''}`.trim())
        }
      }
      if (changesImage && !imagePreview) {
        throw new Error('Add a photo first, then ask me to change the image.')
      }

      if (changesImage) {
        let improved = await handleImproveImage('custom', activeCreativeItem, {
          instruction: decision.imageInstruction || request,
          useBrandLogo: brandLogoRequested || decision.useBrandLogo === true,
          logoOverlayOnly: isLogoOverlayOnlyRequest(request, brandLogoRequested || decision.useBrandLogo === true),
          captionOverride: changesCaption ? decision.caption : content,
          throwOnError: true,
          deferAttach: true,
        })
        if (!improved?.file) throw new Error('The updated image could not be prepared for verification.')
        let verificationImage = await createVisionImageDataUrl(improved.file, { maxDimension: 960, quality: 0.82 })
        let verificationPayload = await generatePublisherAssist({
          client_id: clientId,
          action: 'verify_image_edit',
          caption: decision.imageInstruction || request,
          platforms: activePlatforms,
          max_chars: 700,
          context: [
            `Customer request: ${request}`,
          ].filter(Boolean).join('\n'),
          image_data_urls: verificationImage ? [verificationImage] : [],
        })
        if (verificationPayload?.verification?.passed !== true) {
          const retryInstruction = [
            decision.imageInstruction || request,
            `The first edit was rejected because: ${verificationPayload?.verification?.summary || 'the requested visual change was not obvious enough'}.`,
            'Try again from the original image. Make the requested change clearly visible while preserving unrelated details.',
          ].join('\n')
          improved = await handleImproveImage('custom', activeCreativeItem, {
            instruction: retryInstruction,
            useBrandLogo: brandLogoRequested || decision.useBrandLogo === true,
            logoOverlayOnly: isLogoOverlayOnlyRequest(request, brandLogoRequested || decision.useBrandLogo === true),
            captionOverride: changesCaption ? decision.caption : content,
            throwOnError: true,
            deferAttach: true,
            quality: 'medium',
          })
          if (!improved?.file) throw new Error('The second image edit could not be prepared for verification.')
          verificationImage = await createVisionImageDataUrl(improved.file, { maxDimension: 960, quality: 0.82 })
          verificationPayload = await generatePublisherAssist({
            client_id: clientId,
            action: 'verify_image_edit',
            caption: decision.imageInstruction || request,
            platforms: activePlatforms,
            max_chars: 700,
            context: [
              `Customer request: ${request}`,
              'This is the automatic second attempt after the first image edit was too subtle.',
            ].join('\n'),
            image_data_urls: verificationImage ? [verificationImage] : [],
          })
        }
        if (verificationPayload?.verification?.passed !== true) {
          throw new Error(`I generated an image, but could not verify it matched your request. Your original is still safe. ${verificationPayload?.verification?.summary || ''}`.trim())
        }
        attachImprovedImage({ file: improved.file, previewUrl: improved.previewUrl, mode: 'custom', sourceItem: activeCreativeItem })
        clearPlatformImageVariants('')
        setDraftStatus('Verified image attached. Review it before approving the post.')
      }

      if (changesCaption) {
        applyAssistSuggestion({ caption: decision.caption })
      }

      if (changesCaption || changesImage) {
        const changeType = changesCaption && changesImage
          ? 'caption_and_image'
          : changesImage
            ? 'image'
            : 'caption'
        setReviewLastChange(changeType)
        setReviewRevisionCount((current) => current + 1)
      }

      const logoWasRequested = changesImage && (brandLogoRequested || decision.useBrandLogo === true)
      const defaultResponse = changesCaption && changesImage
        ? logoWasRequested
          ? 'Done — I verified the caption and placed the MAP logo clearly on the image.'
          : 'Done — I verified and updated the caption and image.'
        : changesImage
          ? logoWasRequested
            ? 'Done — I placed the MAP logo clearly on the image.'
            : 'Done — I verified and updated the image.'
          : changesCaption
            ? 'Done — I verified and updated the caption.'
            : 'Tell me what you would like to change next.'
      setReviewMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: (changesCaption || changesImage) ? defaultResponse : decision.assistantMessage || defaultResponse,
      }])
    } catch (error) {
      setReviewComposer(request)
      setReviewMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: error.message || 'I could not revise that draft right now. Your original is still safe.',
      }])
    } finally {
      setReviewPending(false)
    }
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
    const itemFile = activeCreativeItem?.file
    const activeFile = isReadableFileBlob(itemFile)
      ? itemFile
      : (!activeCreativeItem && isReadableFileBlob(imageFile) ? imageFile : null)
    if (activeFile) {
      const fileType = String(activeFile.type || '').toLowerCase()
      const fileName = String(activeFile.name || '').toLowerCase()
      if (fileType.includes('heic') || fileType.includes('heif') || /\.(heic|heif)$/.test(fileName)) {
        throw new Error('iPhone HEIC photos need to be saved or exported as JPG before image formatting.')
      }
      const isSupportedImageType = /^image\/(png|jpe?g|webp)$/i.test(fileType) || /\.(png|jpe?g|webp)$/i.test(fileName)
      if (!isSupportedImageType) {
        throw new Error('Image formatting supports JPG, PNG, and WebP images.')
      }
      return readFileAsDataUrl(activeFile)
    }

    const activePreview = activeCreativeItem?.previewUrl || imagePreview
    if (typeof activePreview === 'string' && activePreview.startsWith('data:image/')) {
      return activePreview
    }

    const imageUrl = activeCreativeItem?.previewUrl || activeCreativeItem?.link || existingMediaUrl || dropboxPreviewSource || ''
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) return imageUrl

    throw new Error('Add or select an image before formatting it for platforms.')
  }

  async function buildPlatformImageVariants(platformIds) {
    const platformsToFormat = [...new Set((platformIds || []).filter((platformId) => PLATFORM_IMAGE_TARGETS[platformId]))]
    if (!platformsToFormat.length) return {}

    const source = await getMasterImageSourceForFormatting()
    const sharedTarget = platformsToFormat.length > 1 ? SHARED_SOCIAL_IMAGE_TARGET : null
    const sharedPreviewUrl = sharedTarget ? await formatImageForTarget(source, sharedTarget) : ''
    const entries = await Promise.all(platformsToFormat.map(async (platformId) => {
      const target = sharedTarget || PLATFORM_IMAGE_TARGETS[platformId]
      const previewUrl = sharedPreviewUrl || await formatImageForTarget(source, target)
      return [platformId, {
        preview_url: previewUrl,
        aspect_ratio: target.aspectRatio,
        width: target.width,
        height: target.height,
        label: target.label,
        guidance: target.guidance,
        source: target.source || 'smart_fit',
        generated_at: new Date().toISOString(),
      }]
    }))

    return Object.fromEntries(entries)
  }

  async function handleFormatPlatformImages(targetPlatformIds = activePlatforms) {
    if (!requireWriteAccess('format images for platforms')) return
    const requestedPlatforms = Array.isArray(targetPlatformIds)
      ? targetPlatformIds.filter((platformId) => activePlatforms.includes(platformId))
      : activePlatforms
    const platformsToFormat = [...new Set(requestedPlatforms)]

    if (!platformsToFormat.length) {
      setImageFormatStatus('Select at least one platform before formatting images.')
      return
    }

    const platformLabel = platformsToFormat
      .map((platformId) => PLATFORMS.find((platform) => platform.id === platformId)?.label || platformId)
      .join(', ')

    setImageFormatState('formatting')
    setImageFormatStatus(`Formatting ${platformLabel} crop${platformsToFormat.length === 1 ? '' : 's'}...`)
    setErrorMsg('')

    try {
      const imageVariants = await buildPlatformImageVariants(platformsToFormat)

      setPlatformVariants((current) => {
        const withCaptions = buildPlatformVariants(activePlatforms, content, profile, current)
        Object.entries(imageVariants).forEach(([platformId, image]) => {
          withCaptions[platformId] = {
            ...(withCaptions[platformId] || {}),
            image,
          }
        })
        return withCaptions
      })
      setImageFormatState('ready')
      setImageFormatStatus(`${platformLabel} crop${platformsToFormat.length === 1 ? '' : 's'} formatted. Review each preview before approval.`)
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
    setViewingPublishedPostId('')
    setViewingPublishedPost(null)
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

    if (!response.ok) throw new Error('Media upload failed.')
    const { publicUrl } = await response.json()
    return publicUrl
  }

  async function uploadPlatformImageVariants(variants) {
    const nextVariants = { ...variants }
    const entries = Object.entries(nextVariants).filter(([, variant]) => variant?.image?.preview_url?.startsWith('data:image/'))
    const uploadedByPreviewUrl = new Map()

    for (const [platformId, variant] of entries) {
      const target = PLATFORM_IMAGE_TARGETS[platformId]
      const previewUrl = variant.image.preview_url
      let upload = uploadedByPreviewUrl.get(previewUrl)
      if (!upload) {
        const file = dataUrlToFile(
          previewUrl,
          `${platformId}-${variant.image.aspect_ratio || target?.aspectRatio || 'social'}.png`.replace(/[^a-z0-9.-]+/gi, '-'),
        )
        upload = {
          url: await uploadToR2(file),
          uploaded_at: new Date().toISOString(),
        }
        uploadedByPreviewUrl.set(previewUrl, upload)
      }
      nextVariants[platformId] = {
        ...variant,
        image: {
          ...variant.image,
          url: upload.url,
          preview_url: undefined,
          uploaded_at: upload.uploaded_at,
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
      if (localDateTimeToDate(scheduledFor).getTime() <= Date.now()) {
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
    if (isViewingPublishedPost) {
      setErrorMsg('This post has already been published. Use the Publisher calendar menu for history, boost, or delete actions.')
      return
    }
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
          name: item.name || item.file?.name || 'Selected media',
          source: item.type || 'computer',
          mediaType: item.mediaType || inferMediaType(item),
          contentType: item.contentType || item.mimeType || item.file?.type || '',
          mimeType: item.mimeType || item.contentType || item.file?.type || '',
          size: Number(item.file?.size || 0),
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
        .map((file) => ({
          name: file.name || 'Dropbox media',
          link: file.link,
          url: file.link,
          size: file.size || 0,
          thumbnail: file.thumbnail || null,
          source: 'dropbox',
          mediaType: inferMediaType({
            ...file,
            url: file.link,
            previewUrl: file.thumbnail,
          }),
          contentType: file.mimeType || file.contentType || '',
          mimeType: file.mimeType || file.contentType || '',
        }))
      const uploadedMediaAssets = uploadedMedia.map((item) => ({
        name: item.name,
        link: item.url,
        url: item.url,
        size: item.size || 0,
        source: item.source || 'computer',
        mediaType: item.mediaType || inferMediaType(item),
        contentType: item.contentType || item.mimeType || '',
        mimeType: item.mimeType || item.contentType || '',
      }))
      const existingMediaAssets = (activeExistingUrl || (!uploadedMediaAssets.length && !dropboxMedia.length && existingMediaUrl))
        ? [{
          name: `Current ${getMediaLabel(inferMediaType({ url: activeExistingUrl || existingMediaUrl }))}`,
          link: activeExistingUrl || existingMediaUrl,
          url: activeExistingUrl || existingMediaUrl,
          source: 'existing',
          mediaType: inferMediaType({ url: activeExistingUrl || existingMediaUrl }),
          contentType: '',
          mimeType: '',
        }]
        : []
      const mediaAssets = [
        ...uploadedMediaAssets,
        ...dropboxMedia,
        ...existingMediaAssets,
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
      const shouldAutoCropPlatforms = Boolean(mediaAssets.length && !activeCreativeIsVideo)
      const missingImageVariantPlatforms = shouldAutoCropPlatforms
        ? targetPlatforms.filter((platformId) => PLATFORM_IMAGE_TARGETS[platformId] && !targetPlatformVariants?.[platformId]?.image)
        : []
      if (missingImageVariantPlatforms.length) {
        setSubmitState('uploading')
        const imageVariants = await buildPlatformImageVariants(missingImageVariantPlatforms)
        targetPlatformVariants = {
          ...targetPlatformVariants,
          ...Object.fromEntries(
            Object.entries(imageVariants).map(([platformId, image]) => [
              platformId,
              {
                ...(targetPlatformVariants[platformId] || {}),
                image,
              },
            ]),
          ),
        }
      }
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
      const existingEditingStatus = String(existingEditingPost?.status || '').trim().toLowerCase()
      const shouldReuseExistingPost = Boolean(
        resolvedEditingPostId && ['draft', 'scheduled'].includes(existingEditingStatus),
      )
      const resolvedEditingRef = shouldReuseExistingPost
        ? (editingScheduledPostRef || existingEditingPost?.n8n_execution_id || '')
        : ''

      if (shouldReuseExistingPost) {
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
          zernioRequestId: post.id,
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
          dropboxLinks: dropboxMedia.map(({ name, link, size, thumbnail, mediaType, contentType, mimeType }) => ({
            name,
            link,
            size,
            thumbnail,
            mediaType,
            contentType,
            mimeType,
          })),
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
            : ((shouldReuseExistingPost ? resolvedEditingRef : '') || post.n8n_execution_id || null),
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
      <div className={`portal-page create-post-page ${mobilePartnerRollout ? 'create-post-mobile-partner-rollout' : ''} w-full max-w-none space-y-6 md:p-5 xl:p-6`}>
        {mobilePartnerRollout ? <MobilePartnerTopBar activeMode="post" /> : null}
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

        {mobilePartnerRollout ? (
          <MobilePublisherConversation
            businessName={profile?.clients?.business_name || 'My Automation Partner'}
            content={content}
            imagePreview={mediaPreviewSource}
            activePlatforms={activePlatforms}
            selectedPlatforms={selectedPlatforms}
            setSelectedPlatforms={setSelectedPlatforms}
            platforms={visiblePlatforms}
            timingMode={timingMode}
            scheduledFor={scheduledFor}
            minScheduleValue={minScheduleValue}
            onCaptionChange={handleCaptionChange}
            onChooseNow={chooseNow}
            onChooseCustom={() => chooseCustomTime(selectedDay)}
            onScheduledForChange={(value) => {
              setScheduledFor(value)
              setTimingMode('custom')
            }}
            onReview={openReview}
            onBack={() => navigate('/partner?mode=post')}
            reviewComposer={reviewComposer}
            reviewMessages={reviewMessages}
            reviewPending={reviewPending}
            reviewRevisionCount={reviewRevisionCount}
            reviewLastChange={reviewLastChange}
            promoDesign={promoDesign}
            onReviewComposerChange={setReviewComposer}
            onReviewRequest={handleReviewRequest}
            onReviewPhotos={(files) => addLocalMediaFiles(files, 'recent')}
            isSubmitting={isSubmitting}
            isViewingPublishedPost={isViewingPublishedPost}
            charOver={charOver}
          />
        ) : null}

        <div className="space-y-5 create-post-ticket-layout">
          <article className="create-post-ticket-card" ref={composerRef}>
            <div className="create-post-phone-bar">
              <button type="button" onClick={() => navigate('/calendar')} className="create-post-phone-button">
                Cancel
              </button>
              <div className="create-post-phone-title">Create post</div>
              <button type="button" onClick={openReview} disabled={isSubmitting || charOver || isViewingPublishedPost} className="create-post-phone-button">
                {isViewingPublishedPost ? 'Posted' : 'Next'}
              </button>
            </div>
            <div className="create-post-phone-body">
              <div className="create-post-identity-row">
                <div className="create-post-avatar">
                  {(profile?.clients?.business_name || outlet.tenant?.displayName || 'M').trim().charAt(0).toUpperCase()}
                </div>
                <div>
                  <strong>{profile?.clients?.business_name || 'Dancescapes Performing Arts'}</strong>
                  <span>
                    {activePlatforms.length
                      ? activePlatforms
                        .map((platformId) => visiblePlatforms.find((platform) => platform.id === platformId)?.label)
                        .filter(Boolean)
                        .join(', ')
                      : 'Choose platforms below'}
                  </span>
                </div>
              </div>
              <div className="create-post-compose-grid create-post-ticket-grid">
            <section className="create-post-caption-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {isViewingPublishedPost ? 'Viewing posted item' : editingScheduledPostId ? 'Editing scheduled post' : activeDraftId ? 'Draft loaded' : 'Publisher'}
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
                  {draftLoading ? 'Generating draft…' : isViewingPublishedPost ? 'Posted item' : editingScheduledPostId ? 'Scheduled-post editor' : activeDraftId ? 'Draft-backed editor' : 'Pick a slot'}
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

                {mobilePartnerRollout ? (
                  <div className="create-post-mobile-voice">
                    <MobileVoiceComposer
                      value={content}
                      onChange={handleCaptionChange}
                      onPhotos={(files) => addLocalMediaFiles(files, 'recent')}
                      placeholder="Speak or write your post…"
                      disabled={isSubmitting || isViewingPublishedPost}
                      showSend={false}
                      submitOnEnter={false}
                    />
                  </div>
                ) : null}
                <textarea
                  value={content}
                  onChange={(event) => handleCaptionChange(event.target.value)}
                  placeholder="Select a draft-backed slot to prefill the caption…"
                  rows={7}
                  disabled={isSubmitting || isViewingPublishedPost}
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
                  </div>
                  <div className="partner-assist-actions">
                    {ASSIST_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => handlePartnerAssist(action.id)}
                        disabled={isSubmitting || assistState === 'loading'}
                        data-locked={!canUseAssist ? 'true' : undefined}
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
                    <p className="partner-assist-note">Use Partner Assist only when the caption needs a quick polish before approval.</p>
                  )}
                </div>

                <button
                  onClick={openReview}
                  disabled={isSubmitting || charOver || isViewingPublishedPost}
                  className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, var(--portal-primary), var(--portal-cyan))', color: 'var(--portal-dark)' }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {submitState === 'uploading' ? 'Uploading…' : timingMode === 'now' ? 'Publishing…' : 'Scheduling…'}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {isViewingPublishedPost ? 'Already posted' : timingMode === 'now' ? 'Preview & Publish' : 'Preview & Approve'}
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
                  {imageGenerateState === 'ready' ? 'Generated image attached' : imageGenerateState === 'generating' ? 'Working on it...' : activeCreativeIsVideo ? 'Video attached' : 'Upload, generate, or choose'}
                </div>
              </div>

              <div className="create-post-source-actions mt-3 flex flex-wrap items-center gap-1.5">
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
                  disabled={isSubmitting || imageGenerateState === 'generating'}
                  data-locked={!canGenerateImage ? 'true' : undefined}
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

              <div className="create-post-ai-mode-panel">
                <div className="create-post-ai-mode-head">
                  <span>
                    <Sparkles className="h-3.5 w-3.5" />
                    AI image style
                  </span>
                  <strong>{selectedImageGenerationMode.label}</strong>
                </div>
                <select
                  value={imageGenerationMode}
                  onChange={(event) => {
                    setImageGenerationMode(event.target.value)
                    setImageGenerateError('')
                  }}
                  disabled={isSubmitting || imageGenerateState === 'generating'}
                  className="portal-input mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none"
                  aria-label="AI image style"
                >
                  {IMAGE_GENERATION_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id}>{mode.label}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                  {selectedImageGenerationMode.description}
                </p>
              </div>

              <div className="mt-3 overflow-hidden rounded-[24px]" style={{ border: '1px solid var(--portal-border)', background: 'rgba(255,255,255,0.78)' }}>
                {mediaPreviewSource ? (
                  <div className="create-post-media-stage">
                    {activeCreativeIsVideo ? (
                      <MediaPreviewAsset
                        item={activeCreativeItem || { previewUrl: mediaPreviewSource }}
                        src={mediaPreviewSource}
                        alt={activeCreativeItem?.name || 'Upload preview'}
                        className="w-full object-contain"
                        controls
                      />
                    ) : (
                      <button
                        type="button"
                        className="create-post-media-open-button"
                        onClick={() => setMediaLightbox({
                          src: mediaPreviewSource,
                          item: activeCreativeItem || { previewUrl: mediaPreviewSource },
                          alt: activeCreativeItem?.name || 'Post creative',
                          name: activeCreativeItem?.name || 'Post creative',
                        })}
                        aria-label="Open larger image preview"
                      >
                        <MediaPreviewAsset
                          item={activeCreativeItem || { previewUrl: mediaPreviewSource }}
                          src={mediaPreviewSource}
                          alt={activeCreativeItem?.name || 'Upload preview'}
                          className="w-full object-contain"
                        />
                      </button>
                    )}
                    {creativeItems.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={showPreviousCreative}
                          disabled={isSubmitting}
                          className="create-post-media-arrow"
                          data-side="left"
                          aria-label="Previous media"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={showNextCreative}
                          disabled={isSubmitting}
                          className="create-post-media-arrow"
                          data-side="right"
                          aria-label="Next media"
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
                        Upload a photo or video, generate with Partner, or grab media from a library.
                      </p>
                    </div>
                  </button>
                )}
              </div>

              {creativeItems.length > 1 && (
                <div className="create-post-media-strip" aria-label="Selected post media">
                  {creativeItems.map((item, index) => (
                    <button
                      key={item.id || `${item.name}-${index}`}
                      type="button"
                      onClick={() => selectCreativeItem(index)}
                      className="create-post-media-thumb"
                      data-active={index === activeCreativeIndex}
                      title={item.name}
                    >
                      <MediaPreviewAsset item={item} src={item.thumbUrl || item.previewUrl} alt="" />
                      {item.mediaType === 'video' && (
                        <i className="create-post-media-thumb-video">
                          <Play className="h-3 w-3" />
                        </i>
                      )}
                      <span>{index + 1}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="image-assist-box">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                      Media tools
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                      {activeCreativeIsVideo
                        ? 'Videos publish as video media. Image cleanup and crop tools are available for photos.'
                        : 'Polish the image for social, then format it for the selected platforms.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {IMAGE_ASSIST_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleImproveImage(action.id)}
                      disabled={isSubmitting || activeCreativeIsVideo || imageImproveState === 'improving' || imageGenerateState === 'generating'}
                      data-locked={!canImproveImage ? 'true' : undefined}
                      title={action.description}
                      data-active={imageImproveMode === action.id && imageImproveState === 'improving'}
                      className="portal-ai-mini-action inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
                    >
                      {imageImproveMode === action.id && imageImproveState === 'improving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {imageImproveMode === action.id && imageImproveState === 'improving' ? 'Working...' : action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleFormatPlatformImages}
                    disabled={isSubmitting || activeCreativeIsVideo || imageFormatState === 'formatting' || imageGenerateState === 'generating'}
                    data-locked={!canImproveImage ? 'true' : undefined}
                    title="Create social-safe image formatting from the selected image."
                    className="portal-ai-mini-action inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
                    data-active={imageFormatState === 'formatting'}
                  >
                    {imageFormatState === 'formatting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {imageFormatState === 'formatting' ? 'Formatting...' : 'Crops'}
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
	                ) : activeCreativeIsVideo ? (
	                  <p className="partner-assist-note">Video is ready for publishing. Use MP4, MOV, or WebM for the most reliable social upload.</p>
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
                          <span className="text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>{image.aspect_ratio}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {partnerImagePrompt && (
                <div className="mt-3 rounded-[20px] px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.62)', border: '1px solid var(--portal-border)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                      Partner image prompt
                    </p>
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: 'rgba(132, 72, 255, 0.12)', color: '#6d4aff' }}>
                      {selectedImageGenerationMode.label}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    {partnerImagePrompt}
                  </p>
                </div>
              )}

              {imageGenerateError && (
                <p className="mt-3 rounded-[18px] px-3 py-2 text-xs leading-relaxed" style={{ background: 'rgba(223, 95, 143, 0.10)', border: '1px solid rgba(223, 95, 143, 0.22)', color: 'var(--portal-danger)' }}>
                  {imageGenerateError}
                </p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={LOCAL_MEDIA_ACCEPT}
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </section>
              </div>
            </div>
          </article>

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
                  {mobilePartnerRollout
                    ? 'Facebook, Instagram, and X are ready. Tap any channel to remove it.'
                    : 'Choose the channels you want to approve. Nothing is selected by default.'}
                </div>
              </div>
            </div>
            {platformFormatStatus ? (
              <p className="mt-3 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                {platformFormatStatus}
              </p>
            ) : null}

            <div className="create-post-mobile-platform-list mt-5" aria-label="Mobile platform selection">
              {visiblePlatforms.map(({ id, label, Icon, accent, soft }) => {
                const active = selectedPlatforms[id]
                const hasCrop = Boolean(platformImageVariants[id])
                return (
                  <article key={id} className="create-post-mobile-platform-row" data-active={active}>
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
                      style={active
                        ? { '--platform-accent': accent, '--platform-soft': soft }
                        : { '--platform-accent': accent, '--platform-soft': 'transparent' }}
                    >
                      <span className="create-post-checkmark" data-active={active}>
                        {active ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <Icon className="h-4 w-4" />
                      <span>
                        <b>{label}</b>
                        <small>{active ? hasCrop ? 'Selected · custom crop ready' : 'Selected · uses main creative' : 'Not selected'}</small>
                      </span>
                    </button>
                    {active && (
                      <div className="create-post-mobile-platform-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewPlatform(id)
                            handleImproveImage('cleanup', activeCreativeItem)
                          }}
                          disabled={!active || isSubmitting || activeCreativeIsVideo || imageImproveState === 'improving' || imageGenerateState === 'generating'}
                        >
                          {imageImproveState === 'improving' && imageImproveMode === 'cleanup'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : null}
                          Improve image
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewPlatform(id)
                            handleFormatPlatformImages([id])
                          }}
                          disabled={!active || isSubmitting || activeCreativeIsVideo || imageFormatState === 'formatting' || imageGenerateState === 'generating'}
                        >
                          {imageFormatState === 'formatting' && previewPlatform === id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : null}
                          Crop
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            <div className="create-post-preview-grid mt-5">
              {visiblePlatforms.map(({ id, label, Icon, accent, soft }) => {
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
                      mediaItems={creativeItems}
                      activeMediaIndex={activeCreativeIndex}
                    />
                    <div className="create-post-preview-tools">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPlatform(id)
                          handleImproveImage('cleanup', activeCreativeItem)
                        }}
                        disabled={!active || isSubmitting || activeCreativeIsVideo || imageImproveState === 'improving' || imageGenerateState === 'generating'}
                        data-locked={!canImproveImage ? 'true' : undefined}
                        className="portal-ai-mini-action"
                      >
                        {imageImproveState === 'improving' && imageImproveMode === 'cleanup'
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Sparkles className="h-3.5 w-3.5" />}
                        {imageImproveState === 'improving' && imageImproveMode === 'cleanup' ? 'Improving...' : 'Improve image'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPlatform(id)
                          handleFormatPlatformImages([id])
                        }}
                        disabled={!active || isSubmitting || activeCreativeIsVideo || imageFormatState === 'formatting' || imageGenerateState === 'generating'}
                        data-locked={!canImproveImage ? 'true' : undefined}
                        className="portal-ai-mini-action"
                      >
                        {imageFormatState === 'formatting' && previewPlatform === id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Sparkles className="h-3.5 w-3.5" />}
                        {imageFormatState === 'formatting' && previewPlatform === id ? 'Cropping...' : 'Crop setting'}
                      </button>
                    </div>
                    {active && (
                      <p className="create-post-preview-tool-note">
                        {imageImproveState === 'improving' && imageImproveMode === 'cleanup' && previewPlatform === id
                          ? 'Partner is improving the selected image.'
                          : imageFormatState === 'formatting' && previewPlatform === id
                            ? `Creating a ${label} crop.`
	                            : platformImageVariants[id]
	                              ? `${label} crop applied.`
	                              : activeCreativeIsVideo
	                                ? 'Video will publish as the selected main creative.'
	                                : 'Actions use the selected main creative.'}
                      </p>
                    )}
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
                          Blue dots are recommended openings, cyan are already scheduled, and magenta are saved drafts you can reopen.
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
                                  {formatVisiblePlatformLabels(post.platforms) || post.status}
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
            <button
              type="button"
              onClick={openReview}
              disabled={isSubmitting || charOver || isViewingPublishedPost}
              className="create-post-bottom-next"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {submitState === 'uploading' ? 'Uploading...' : timingMode === 'now' ? 'Publishing...' : 'Scheduling...'}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {isViewingPublishedPost ? 'Posted' : timingMode === 'now' ? 'Next: Preview & Publish' : 'Next: Preview & Approve'}
                </>
              )}
            </button>
          </section>
        </div>
      </div>

      <MediaLightbox media={mediaLightbox} onClose={() => setMediaLightbox(null)} />

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
        mediaItems={creativeItems}
        activeMediaIndex={activeCreativeIndex}
        platforms={visiblePlatforms}
        mobilePartnerRollout={mobilePartnerRollout}
      />
    </>
  )
}
