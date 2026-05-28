import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { SiFacebook, SiGoogle, SiInstagram, SiTiktok } from 'react-icons/si'
import {
  Archive,
  CalendarDays,
  Copy,
  Edit3,
  FolderOpen,
  Link as LinkIcon,
  Loader2,
  Megaphone,
  MoreHorizontal,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  archiveCampaignProject,
  createSecureVaultFolder,
  createCampaignProject,
  deleteCampaignProjectWithDrafts,
  deleteSocialDraft,
  fetchCampaignProjects,
  fetchSecureVaultDocuments,
  fetchSecureVaultFolders,
  generateCampaignPlan,
  getSecureVaultDocumentUrl,
  getSecureVaultUploadUrl,
  updateSocialDraft,
  upsertSocialDraft,
  updateCampaignProject,
  uploadSecureVaultFileToSignedUrl,
} from '../lib/portalApi'
import { formatVaultBytes, validateSecureVaultFile } from '../lib/secureVault'
import { buildCampaignDraftMediaAssets } from '../lib/campaignDraftAssets'

const CAMPAIGN_TYPES = [
  { value: 'event', label: 'Event', description: 'Webinars, open houses, trade shows, community visits, or scheduled happenings.' },
  { value: 'product_launch', label: 'Product / service launch', description: 'New service, package, location, offer, feature, or program.' },
  { value: 'promotion', label: 'Promotion', description: 'Limited-time offer, consultation push, trial, discount, or booking campaign.' },
  { value: 'local_awareness', label: 'Local awareness', description: 'Warm up a city or service area before an in-person visit.' },
  { value: 'seasonal_push', label: 'Seasonal push', description: 'Holiday, fiscal period, busy season, local timing, or market moment.' },
  { value: 'announcement', label: 'Announcement', description: 'New hours, team update, milestone, partnership, certification, or news.' },
  { value: 'new_location', label: 'New location', description: 'A move, expansion, or new service area announcement.' },
  { value: 'custom', label: 'Custom', description: 'A flexible campaign MAP can shape around your goal.' },
]

const CAMPAIGN_MODES = [
  {
    value: 'standard',
    label: 'Standard',
    credits: 1,
    heading: 'Create my campaign',
    description: 'Partner uses your details to create the strategy, schedule, captions, platforms, and ad suggestion.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    credits: 3,
    heading: 'Research and build it',
    description: 'Partner researches timing, local opportunities, competitors, and growth actions beyond social posts.',
  },
]

const TYPE_LABELS = Object.fromEntries(CAMPAIGN_TYPES.map((type) => [type.value, type.label]))
const MODE_LABELS = Object.fromEntries(CAMPAIGN_MODES.map((mode) => [mode.value, mode.label]))
const STATUS_LABELS = {
  active: 'Active',
  draft: 'Draft',
  completed: 'Completed',
  archived: 'Archived',
}
const POST_STATUS_MARKERS = {
  planned: { label: 'Draft', color: '#ff7ab8' },
  draft: { label: 'Draft', color: '#ff7ab8' },
  added_to_calendar: { label: 'Draft', color: '#ff7ab8' },
  scheduled: { label: 'Scheduled', color: '#70e4ff' },
  published: { label: 'Posted', color: '#70e4ff' },
}
const PLATFORM_MARKERS = {
  facebook: { label: 'Facebook', Icon: SiFacebook, color: '#1877f2' },
  instagram: { label: 'Instagram', Icon: SiInstagram, color: '#e4405f' },
  google: { label: 'Google Business', Icon: SiGoogle, color: '#34a853' },
  tiktok: { label: 'TikTok', Icon: SiTiktok, color: '#111111' },
}

const VISUAL_STYLE_OPTIONS = [
  { value: 'real_photos', label: 'Use real photos' },
  { value: 'screenshots', label: 'Use screenshots' },
  { value: 'promo_videos', label: 'Use promo videos' },
  { value: 'flyers_graphics', label: 'Use flyers/graphics' },
  { value: 'brand_colors', label: 'Use brand colors' },
  { value: 'logo_when_appropriate', label: 'Use logo when appropriate' },
  { value: 'ai_images_if_needed', label: 'Create AI images if needed' },
]

const TONE_OPTIONS = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'excited', label: 'Excited' },
  { value: 'educational', label: 'Educational' },
  { value: 'direct', label: 'Direct' },
  { value: 'community', label: 'Community-focused' },
  { value: 'premium', label: 'Premium/polished' },
  { value: 'urgent_not_pushy', label: 'Urgent, not pushy' },
]

const AVOID_OPTIONS = [
  { value: 'pushy_sales', label: 'Pushy sales language' },
  { value: 'overpromising', label: 'Overpromising' },
  { value: 'too_many_emojis', label: 'Too many emojis' },
  { value: 'discounts_unless_specified', label: 'Discounts unless specified' },
  { value: 'long_captions', label: 'Long captions' },
  { value: 'generic_ai_wording', label: 'Generic AI wording' },
  { value: 'competitor_mentions', label: 'Competitor mentions' },
]

const CAMPAIGN_ASSET_ACCEPT = 'image/*,video/mp4,video/quicktime,video/webm,video/x-m4v,application/pdf,.pdf,.doc,.docx,.ppt,.pptx,.txt,.md'

const DEFAULT_FORM = {
  campaignMode: 'advanced',
  campaignType: 'event',
  title: '',
  goal: '',
  audience: '',
  offer: '',
  startDate: '',
  endDate: '',
  durationDays: '30',
  budgetRange: 'Start organic, then boost winning posts with a small test budget.',
  targetLocation: '',
  targetBusinessTypes: '',
  visitPlan: '',
  familiarityGoal: 'Help local business owners recognize us before we visit.',
  inPersonAngle: '',
  campaignLinks: '',
  assetNotes: '',
  visualStyles: ['real_photos', 'promo_videos', 'brand_colors'],
  toneOptions: ['friendly', 'professional', 'direct'],
  avoidOptions: ['pushy_sales', 'overpromising', 'generic_ai_wording'],
  tone: '',
  avoidTopics: '',
  selectedAssetFolderId: '',
  keyDetails: '',
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toIsoAt(dateString, time = '10:00') {
  const [hour = '10', minute = '00'] = time.split(':')
  return new Date(`${dateString}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`).toISOString()
}

function parseCampaignDateTime(dateString, time = '10:00') {
  if (!dateString) return null
  const [hour = '10', minute = '00'] = String(time || '10:00').split(':')
  const date = new Date(`${dateString}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function roundUpToNextHalfHour(date) {
  const next = new Date(date)
  next.setSeconds(0, 0)
  const minutes = next.getMinutes()
  const roundedMinutes = minutes <= 30 ? 30 : 60
  if (roundedMinutes === 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0)
  } else {
    next.setMinutes(30, 0, 0)
  }
  return next
}

function normalizeCampaignDateTime({ date, time, fallbackDate, index, previousDateTime }) {
  const baseDate = date || fallbackDate || toDateString(new Date())
  const baseTime = time || '10:00'
  const parsed = parseCampaignDateTime(baseDate, baseTime) || new Date()
  const earliest = roundUpToNextHalfHour(addDays(new Date(), 0))
  earliest.setMinutes(earliest.getMinutes() + 30)

  let adjusted = parsed
  if (adjusted.getTime() <= earliest.getTime()) {
    adjusted = new Date(earliest)
  }
  if (previousDateTime && adjusted.getTime() <= previousDateTime.getTime()) {
    adjusted = new Date(previousDateTime)
    adjusted.setMinutes(adjusted.getMinutes() + 90)
  }

  if (index > 0 && toDateString(adjusted) === toDateString(new Date()) && adjusted.getHours() >= 21) {
    adjusted = addDays(new Date(), 1)
    adjusted.setHours(9 + Math.min(index, 4), 0, 0, 0)
  }

  return {
    date: toDateString(adjusted),
    time: `${String(adjusted.getHours()).padStart(2, '0')}:${String(adjusted.getMinutes()).padStart(2, '0')}`,
    dateTime: adjusted,
  }
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(String(value).includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function normalizeList(value) {
  return Array.isArray(value) ? value : []
}

function splitLines(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function optionLabels(options, selectedValues = []) {
  const byValue = new Map(options.map((option) => [option.value, option.label]))
  return normalizeList(selectedValues).map((value) => byValue.get(value)).filter(Boolean)
}

function assetKindFromMime(mimeType = '') {
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'flyer/pdf'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation'
  return 'file'
}

function isCampaignPreviewableImage(asset = {}) {
  const kind = String(asset.kind || '').toLowerCase()
  const type = String(asset.type || asset.mime_type || '').toLowerCase()
  const name = String(asset.name || asset.file_name || asset.relativePath || asset.relative_path || '').toLowerCase()
  return kind === 'image' || type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(name)
}

function summarizeCampaignAsset(asset) {
  return {
    id: asset.id || asset.document_id || '',
    name: asset.name || asset.file_name || '',
    relativePath: asset.relativePath || asset.relative_path || asset.name || asset.file_name || '',
    type: asset.type || asset.mime_type || '',
    size: Number(asset.size || asset.size_bytes || 0),
    kind: asset.kind || assetKindFromMime(asset.type || asset.mime_type || ''),
    folderId: asset.folderId || asset.folder_id || '',
    folderPath: asset.folderPath || asset.folder_path || '',
    description: asset.description || '',
  }
}

function buildCampaignAssetSummary({ uploadedAssets = [], folderAssets = [] }) {
  const seen = new Set()
  return [...uploadedAssets, ...folderAssets]
    .map(summarizeCampaignAsset)
    .sort((a, b) => {
      const priority = (asset) => {
        if (asset.kind === 'video') return 0
        if (asset.kind === 'image') return 1
        return 2
      }
      return priority(a) - priority(b)
    })
    .filter((asset) => {
      const key = asset.id || `${asset.name}:${asset.size}`
      if (!asset.name || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 80)
}

function cleanPathPart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function normalizeAssetRelativePath(file) {
  const rawPath = String(file?.webkitRelativePath || file?.name || '').replace(/\\/g, '/')
  const parts = rawPath.split('/').map(cleanPathPart).filter(Boolean)
  if (!parts.length) return file?.name || 'campaign-asset'
  return parts.join('/')
}

function isIgnoredCampaignAssetFile(file) {
  const rawPath = String(file?.webkitRelativePath || file?.name || '').replace(/\\/g, '/')
  const parts = rawPath.split('/').filter(Boolean)
  const fileName = parts.at(-1) || file?.name || ''
  const lowerName = fileName.toLowerCase()

  return (
    !fileName
    || lowerName === '.ds_store'
    || lowerName === 'thumbs.db'
    || lowerName === 'desktop.ini'
    || lowerName === '.localized'
    || parts.some((part) => part === '__MACOSX' || part.startsWith('.'))
  )
}

function getFolderUploadFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => !isIgnoredCampaignAssetFile(file))
  const normalizedPaths = files.map(normalizeAssetRelativePath).filter(Boolean)
  const topLevelNames = new Set(normalizedPaths.map((path) => path.split('/')[0]).filter(Boolean))
  const stripCommonRoot = topLevelNames.size === 1 && normalizedPaths.some((path) => path.includes('/'))

  return files.map((file) => {
    const normalizedPath = normalizeAssetRelativePath(file)
    const pathParts = normalizedPath.split('/').filter(Boolean)
    const relativeParts = stripCommonRoot && pathParts.length > 1 ? pathParts.slice(1) : pathParts
    const relativePath = relativeParts.join('/') || file.name
    const folderPath = relativeParts.slice(0, -1).join('/')

    return {
      id: `${relativePath}:${file.lastModified}:${file.size}`,
      name: file.name,
      relativePath,
      folderPath,
      type: file.type,
      size: file.size,
      kind: assetKindFromMime(file.type),
      file,
    }
  })
}

function mergeAssetFiles(currentFiles, nextFiles) {
  const merged = new Map()
  ;[...currentFiles, ...nextFiles].forEach((asset) => {
    const key = asset.id || `${asset.relativePath || asset.name}:${asset.size}`
    merged.set(key, asset)
  })
  return [...merged.values()]
}

function findFolderByName(folders, name, parentFolderId = null) {
  const normalizedName = String(name || '').trim().toLowerCase()
  if (!normalizedName) return null
  return folders.find((folder) => (
    String(folder.name || '').trim().toLowerCase() === normalizedName
    && (folder.parent_folder_id || null) === (parentFolderId || null)
  )) || null
}

async function ensureCampaignSubfolder({ clientId, folderCache, name, parentFolderId }) {
  const cleanName = cleanPathPart(name)
  if (!cleanName) return null

  const cacheKey = `${parentFolderId || 'root'}:${cleanName.toLowerCase()}`
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey)

  const folder = await createSecureVaultFolder({
    clientId,
    name: cleanName,
    parentFolderId,
  })
  folderCache.set(cacheKey, folder)
  return folder
}

async function resolveCampaignAssetFolder({ clientId, campaignFolder, folderCache, folderPath }) {
  const parts = String(folderPath || '').split('/').map(cleanPathPart).filter(Boolean)
  let currentFolder = campaignFolder

  for (const part of parts) {
    currentFolder = await ensureCampaignSubfolder({
      clientId,
      folderCache,
      name: part,
      parentFolderId: currentFolder.id,
    })
  }

  return currentFolder
}

function getDescendantFolderIds(folders, rootFolderId) {
  if (!rootFolderId) return new Set()
  const ids = new Set([rootFolderId])
  let changed = true

  while (changed) {
    changed = false
    folders.forEach((folder) => {
      if (!ids.has(folder.id) && ids.has(folder.parent_folder_id)) {
        ids.add(folder.id)
        changed = true
      }
    })
  }

  return ids
}

function buildFolderPath(folders, folderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const parts = []
  let current = byId.get(folderId)
  const seen = new Set()

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    parts.unshift(current.name)
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : null
  }

  return parts.join('/')
}

function MultiSelectField({ label, options, value = [], onChange, placeholder }) {
  const selected = new Set(normalizeList(value))
  const selectedLabels = optionLabels(options, value)

  return (
    <div className="campaign-multi-field">
      <span>{label}</span>
      <div className="campaign-choice-grid">
        {options.map((option) => {
          const active = selected.has(option.value)
          return (
            <button
              key={option.value}
              type="button"
              data-active={active}
              onClick={() => {
                const next = active
                  ? normalizeList(value).filter((item) => item !== option.value)
                  : [...normalizeList(value), option.value]
                onChange(next)
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <small>{selectedLabels.length ? selectedLabels.join(', ') : placeholder}</small>
    </div>
  )
}

function getCredits(mode) {
  return CAMPAIGN_MODES.find((item) => item.value === mode)?.credits || 1
}

function isLocalAwarenessCampaign(type) {
  return type === 'local_awareness'
}

function applyCampaignTypeDefaults(current, campaignType) {
  if (!isLocalAwarenessCampaign(campaignType)) return { ...current, campaignType }

  return {
    ...current,
    campaignType,
    title: current.title || 'Local awareness visit',
    goal: current.goal || 'Build local familiarity before an in-person sales visit.',
    audience: current.audience || 'Local business owners and managers in the target area.',
    offer: current.offer || 'Book a quick, no-pressure review while we are nearby.',
    durationDays: current.durationDays || '14',
  }
}

function normalizeGeneratedPlan(plan, form, clientName) {
  const start = form.startDate ? new Date(`${form.startDate}T12:00:00`) : new Date()
  start.setHours(12, 0, 0, 0)
  const rawPosts = normalizeList(plan?.posts)
  const localTarget = form.targetLocation || 'your area'
  const fallbackPosts = rawPosts.length ? rawPosts : (isLocalAwarenessCampaign(form.campaignType) ? [
    {
      title: `Announce visit to ${localTarget}`,
      caption: `${localTarget} business owners: ${clientName || 'we'} will be in the area soon helping local teams review better ways to handle payments, service, and growth.`,
      imageIdea: `Use a clean branded graphic with ${localTarget} called out clearly.`,
      platforms: ['facebook', 'linkedin'],
      offset: 0,
      time: '09:00',
    },
    {
      title: 'Problem-aware post',
      caption: `If you run a local business in ${localTarget}, small friction points can cost real money. We are booking quick, practical conversations while we are nearby.`,
      imageIdea: 'Use a simple business-owner-at-counter image or branded checklist visual.',
      platforms: ['facebook', 'linkedin'],
      offset: 2,
      time: '11:30',
    },
    {
      title: 'Visit week reminder',
      caption: `We will be meeting with businesses around ${localTarget} this week. If you want a quick review, send a message and we will try to fit you in.`,
      imageIdea: 'Use a route, calendar, or local-business storefront visual.',
      platforms: ['facebook', 'instagram', 'linkedin'],
      offset: 5,
      time: '08:30',
    },
    {
      title: 'Same-day availability',
      caption: `${localTarget}: we have a few local conversation windows open today. Message us if you want a quick, no-pressure review while we are in town.`,
      imageIdea: 'Use a direct branded story-style graphic with today-only availability.',
      platforms: ['facebook', 'instagram'],
      offset: 7,
      time: '07:45',
    },
    {
      title: 'Follow-up after trip',
      caption: `Thanks to the ${localTarget} businesses who took time to talk with us. If we missed you, send a message and we can still help you review your options.`,
      imageIdea: 'Use a warm thank-you graphic or photo from the trip if available.',
      platforms: ['facebook', 'linkedin'],
      offset: 9,
      time: '10:00',
    },
  ] : [
    {
      title: `Announce ${form.title || 'the campaign'}`,
      caption: `${form.title || 'Our campaign'} is coming up. ${clientName || 'We'} will share a clear next step soon, with details customers can act on.`,
      imageIdea: 'Use the clearest campaign visual or a clean behind-the-scenes photo.',
      platforms: ['facebook', 'instagram'],
      offset: 0,
      time: '10:00',
    },
    {
      title: 'Show the problem',
      caption: 'This campaign gives people a simple reason to act now. We will connect the offer to the customer outcome and keep the next step easy.',
      imageIdea: 'Use a simple visual showing the before-and-after benefit.',
      platforms: ['facebook', 'instagram'],
      offset: 3,
      time: '18:30',
    },
    {
      title: 'Offer reminder',
      caption: 'A quick reminder: this campaign is still active. Reach out and we will help you choose the best next step.',
      imageIdea: 'Use a friendly reminder image with the product, service, or person behind it.',
      platforms: ['facebook'],
      offset: 7,
      time: '11:00',
    },
  ])

  return {
    summary: plan?.summary || `${fallbackPosts.length}-post ${TYPE_LABELS[form.campaignType]?.toLowerCase() || 'campaign'} plan`,
    coreMessage: plan?.coreMessage || form.goal,
    audience: plan?.audience || form.audience,
    strategy: normalizeList(plan?.strategy).length ? plan.strategy : (isLocalAwarenessCampaign(form.campaignType) ? [
      `Use posts to build name recognition in ${localTarget} before the in-person visit.`,
      'Lead with a practical business-owner problem, not a hard sales pitch.',
      'Post before arrival, during the visit window, and once after leaving the area.',
      'Use Facebook and LinkedIn first; add Instagram when the creative is visual.',
    ] : [
      `Lead with the customer outcome: ${form.goal || 'make the next step clear'}`,
      'Use a clear call to action on every post.',
      'Start organic and promote the strongest proof post if early engagement is good.',
    ]),
    researchSummary: normalizeList(plan?.researchSummary),
    adGuidance: plan?.adGuidance || 'Start organic, then boost the strongest post once the message is proven.',
    growthActions: normalizeList(plan?.growthActions).length ? plan.growthActions : (isLocalAwarenessCampaign(form.campaignType) ? [
      'Pin or feature the local visit post during the trip window.',
      'Send warm follow-up messages to anyone who engages before the visit.',
      'Use the strongest post as a small boosted awareness test for the target ZIP or city.',
      'Bring the same message into in-person scripts so the campaign and visit feel connected.',
    ] : [
      'Add the campaign message to the website or booking page.',
      'Send a short email or message to warm contacts.',
      'Ask current customers to share or refer someone who fits the offer.',
    ]),
    generatedAt: new Date().toISOString(),
    mode: form.campaignMode,
    credits: getCredits(form.campaignMode),
    posts: (() => {
      let previousDateTime = null
      return fallbackPosts.map((post, index) => {
      const fallbackDate = toDateString(addDays(start, Number(post.offset ?? index * 3)))
      const normalizedSlot = normalizeCampaignDateTime({
        date: post.date,
        time: post.time,
        fallbackDate,
        index,
        previousDateTime,
      })
      previousDateTime = normalizedSlot.dateTime
      return {
        id: post.id || `post-${index + 1}`,
        title: post.title || `Campaign post ${index + 1}`,
        caption: post.caption || '',
        whyNow: post.whyNow || post.why_now || '',
        imageIdea: post.imageIdea || post.image_idea || 'Use an approved campaign image.',
        assetId: post.assetId || post.asset_id || '',
        assetName: post.assetName || post.asset_name || '',
        assetUse: post.assetUse || post.asset_use || '',
        platforms: normalizeList(post.platforms).length ? post.platforms : ['facebook', 'instagram'],
        date: normalizedSlot.date,
        time: normalizedSlot.time,
        status: post.status || 'planned',
        adIdea: Boolean(post.adIdea || post.ad_idea),
      }
      })
    })(),
  }
}

function buildDraftRow({ project, post, profile }) {
  const client = profile?.clients || {}
  const time = post.time || '10:00'
  const [hour = '10', minute = '00'] = time.split(':')
  const endHour = String(Math.min(Number(hour) + 1, 23)).padStart(2, '0')
  const mediaAssets = buildCampaignDraftMediaAssets({
    post,
    campaignAssets: project.prompt_json?.campaignAssets,
  })
  const recommendedAsset = mediaAssets[0] || (post.assetName ? {
    id: post.assetId || '',
    name: post.assetName,
    use: post.assetUse || '',
  } : null)

  return {
    client_id: profile.client_id,
    planner_client_slug: client.slug || 'campaign-partner',
    planner_policy_version: 'campaign-partner-v2',
    source_workflow: 'campaign_partner',
    slot_date_local: post.date,
    slot_label: `campaign_${project.id.slice(0, 8)}_${post.id}`,
    slot_start_local: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
    slot_end_local: `${endHour}:${minute.padStart(2, '0')}`,
    timezone: client.timezone || 'America/New_York',
    scheduled_for: toIsoAt(post.date, time),
    post_type: project.campaign_type,
    draft_title: post.title,
    draft_body: [
      `Campaign: ${project.title}`,
      `Goal: ${project.goal || 'Campaign promotion'}`,
      post.whyNow ? `Why now: ${post.whyNow}` : '',
      `Image idea: ${post.imageIdea || ''}`,
      post.assetName ? `Recommended asset: ${post.assetName}` : '',
    ].filter(Boolean).join('\n\n'),
    draft_caption: post.caption,
    review_state: 'draft_created',
    review_notes: JSON.stringify({
      source: 'campaign_partner',
      campaignProjectId: project.id,
      campaignPostId: post.id,
      campaignMode: project.prompt_json?.campaignMode || 'standard',
      platforms: post.platforms || [],
      imageIdea: post.imageIdea || '',
      recommendedAsset,
      mediaAssets,
      generatedAt: new Date().toISOString(),
    }),
    asset_requirements_json: [
      { type: 'media_concept', suggestion: post.imageIdea || 'Use an approved campaign image.' },
      post.assetName ? { type: 'campaign_asset', document_id: post.assetId || null, name: post.assetName, suggestion: post.assetUse || post.imageIdea || '' } : null,
      ...mediaAssets,
      { type: 'media_action', options: ['generate_image', 'upload_photo'] },
    ].filter(Boolean),
    seasonal_modifier_context_json: [
      { source: 'campaign_partner', campaignTitle: project.title, campaignType: project.campaign_type },
    ],
  }
}

function getProjectCounts(projects) {
  return {
    active: projects.filter((project) => project.status === 'active').length,
    drafts: projects.reduce((count, project) => count + normalizeList(project.plan_json?.posts).filter((post) => post.status !== 'added_to_calendar').length, 0),
    scheduled: projects.reduce((count, project) => count + normalizeList(project.plan_json?.posts).filter((post) => post.status === 'added_to_calendar').length, 0),
    reusable: projects.filter((project) => project.is_reusable).length,
  }
}

function PostStatusPill({ status }) {
  const marker = POST_STATUS_MARKERS[status] || POST_STATUS_MARKERS.planned
  return (
    <span
      className="campaign-post-status-pill"
      style={{ color: marker.color, borderColor: `${marker.color}40`, background: `${marker.color}14` }}
    >
      {marker.label}
    </span>
  )
}

function CampaignPlatformMarkers({ platforms = [] }) {
  const uniquePlatforms = [...new Set(platforms)].filter((platform) => PLATFORM_MARKERS[platform])
  if (!uniquePlatforms.length) return null

  return (
    <div className="campaign-post-platforms">
      {uniquePlatforms.map((platform) => {
        const marker = PLATFORM_MARKERS[platform]
        const Icon = marker.Icon
        return (
          <span
            key={platform}
            className="campaign-post-platform"
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

function CampaignPostMenu({ post, actions }) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    const updateMenuPosition = () => {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      if (!buttonRect) return
      const menuWidth = menuRef.current?.getBoundingClientRect().width || 190
      const menuHeight = menuRef.current?.getBoundingClientRect().height || 150
      const padding = 12
      const gap = 8
      const spaceBelow = window.innerHeight - buttonRect.bottom
      const top = spaceBelow < menuHeight + 20
        ? Math.max(padding, buttonRect.top - menuHeight - gap)
        : Math.min(window.innerHeight - menuHeight - padding, buttonRect.bottom + gap)
      const left = Math.min(Math.max(padding, buttonRect.right - menuWidth), window.innerWidth - menuWidth - padding)
      setMenuPosition({ top, left })
    }

    const handlePointerDown = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
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

  return (
    <div className="campaign-post-menu-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="campaign-kebab"
        aria-label={`Open actions for ${post.title}`}
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((value) => !value)
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen ? createPortal(
        <div
          ref={menuRef}
          className="campaign-row-menu campaign-post-menu-popover"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {actions.map(({ label, Icon, onSelect, destructive }) => (
            <span
              key={label}
              data-danger={destructive || undefined}
              onClick={(event) => {
                event.stopPropagation()
                setIsOpen(false)
                onSelect()
              }}
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              {label}
            </span>
          ))}
        </div>,
        window.document.body,
      ) : null}
    </div>
  )
}

export default function CampaignPartner() {
  const { profile, requireWriteAccess } = useOutletContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const clientId = profile?.client_id
  const [mode, setMode] = useState('library')
  const [selectedId, setSelectedId] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [openMenuId, setOpenMenuId] = useState('')
  const [assetFiles, setAssetFiles] = useState([])
  const [assetLightbox, setAssetLightbox] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['campaign-projects', clientId],
    queryFn: () => fetchCampaignProjects(clientId),
    enabled: !!clientId,
  })

  const { data: secureFolders = [] } = useQuery({
    queryKey: ['secure-vault-folders'],
    queryFn: fetchSecureVaultFolders,
    enabled: !!clientId,
  })

  const { data: secureDocuments = [] } = useQuery({
    queryKey: ['secure-vault-documents'],
    queryFn: fetchSecureVaultDocuments,
    enabled: !!clientId,
  })

  const selectedProject = useMemo(() => (
    projects.find((project) => project.id === selectedId) || projects[0] || null
  ), [projects, selectedId])

  const counts = useMemo(() => getProjectCounts(projects), [projects])
  const filteredProjects = useMemo(() => projects
    .filter((project) => {
      if (filter === 'all') return true
      if (filter === 'reusable') return project.is_reusable
      return project.status === filter
    })
    .filter((project) => `${project.title} ${project.goal} ${project.campaign_type} ${project.prompt_json?.campaignMode || ''}`.toLowerCase().includes(query.toLowerCase()))
  , [filter, projects, query])

  const previewPlan = useMemo(() => normalizeGeneratedPlan(null, form, profile?.clients?.business_name), [form, profile])
  const selectedFolderAssets = useMemo(() => {
    if (!form.selectedAssetFolderId) return []
    const folderIds = getDescendantFolderIds(secureFolders, form.selectedAssetFolderId)
    return secureDocuments
      .filter((document) => folderIds.has(document.folder_id) && !document.is_archived)
      .map((document) => ({
        ...document,
        folder_path: buildFolderPath(secureFolders, document.folder_id),
        relative_path: [buildFolderPath(secureFolders, document.folder_id), document.file_name].filter(Boolean).join('/'),
      }))
  }, [form.selectedAssetFolderId, secureDocuments, secureFolders])
  const selectedFolder = useMemo(() => secureFolders.find((folder) => folder.id === form.selectedAssetFolderId) || null, [form.selectedAssetFolderId, secureFolders])

  useEffect(() => {
    if (!assetLightbox) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') setAssetLightbox(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [assetLightbox])

  useEffect(() => () => {
    if (assetLightbox?.objectUrl) URL.revokeObjectURL(assetLightbox.objectUrl)
  }, [assetLightbox])

  const saveProject = useMutation({
    mutationFn: async ({ reusableFrom } = {}) => {
      if (!requireWriteAccess('create Campaign Partner projects')) return null
      if (!form.title.trim()) throw new Error('Add a campaign name before generating.')

      const existingFolder = findFolderByName(secureFolders, form.title)
      const campaignFolder = existingFolder || await createSecureVaultFolder({
        clientId,
        name: form.title.trim(),
      })
      const folderCache = new Map(
        [...secureFolders, campaignFolder].map((folder) => [
          `${folder.parent_folder_id || 'root'}:${String(folder.name || '').trim().toLowerCase()}`,
          folder,
        ]),
      )
      const uploadedAssets = []
      for (const file of assetFiles.filter((asset) => asset?.file instanceof File)) {
        const validation = validateSecureVaultFile(file.file)
        if (!validation.valid) {
          throw new Error(`${file.name || file.file.name} is not supported by Documents.`)
        }
        const targetFolder = await resolveCampaignAssetFolder({
          clientId,
          campaignFolder,
          folderCache,
          folderPath: file.folderPath,
        })
        const description = [
          `Campaign asset for ${form.title.trim()}`,
          file.relativePath ? `Folder upload path: ${file.relativePath}` : '',
          form.assetNotes || '',
        ].filter(Boolean).join(' - ')
        const upload = await getSecureVaultUploadUrl({
          filename: file.file.name,
          mime_type: validation.mimeType,
          size_bytes: file.file.size,
          folder_id: targetFolder.id,
          category: targetFolder.name,
          description,
        })
        await uploadSecureVaultFileToSignedUrl(upload.upload_url, file.file, validation.mimeType)
        uploadedAssets.push({
          id: upload.document_id,
          name: file.file.name,
          relativePath: file.relativePath || file.file.name,
          folderPath: file.folderPath || '',
          type: validation.mimeType,
          size: file.file.size,
          folderId: targetFolder.id,
          description,
        })
      }
      const campaignAssets = buildCampaignAssetSummary({
        uploadedAssets,
        folderAssets: selectedFolderAssets,
      })
      const brief = {
        ...form,
        visualStyle: optionLabels(VISUAL_STYLE_OPTIONS, form.visualStyles),
        toneSelections: optionLabels(TONE_OPTIONS, form.toneOptions),
        avoidSelections: optionLabels(AVOID_OPTIONS, form.avoidOptions),
        campaignLinks: splitLines(form.campaignLinks),
        campaignFolder: {
          id: campaignFolder.id,
          name: campaignFolder.name,
        },
        selectedAssetFolder: selectedFolder ? {
          id: selectedFolder.id,
          name: selectedFolder.name,
        } : null,
        campaignAssets,
        assetFiles: campaignAssets,
      clientName: profile?.clients?.business_name || '',
      localAwareness: isLocalAwarenessCampaign(form.campaignType) ? {
        targetLocation: form.targetLocation,
        targetBusinessTypes: form.targetBusinessTypes,
        visitPlan: form.visitPlan,
        familiarityGoal: form.familiarityGoal,
        inPersonAngle: form.inPersonAngle,
      } : null,
    }
      const generated = await generateCampaignPlan({
        client_id: clientId,
        campaign_mode: form.campaignMode,
        campaign_type: form.campaignType,
        brief,
      })
      const plan = normalizeGeneratedPlan(generated?.plan, form, profile?.clients?.business_name)
      return createCampaignProject({
        client_id: clientId,
        title: form.title,
        campaign_type: form.campaignType,
        goal: form.goal,
        date_window: form.startDate || form.endDate ? `${form.startDate || 'Start soon'} to ${form.endDate || `${form.durationDays} days`}` : `${form.durationDays} days`,
        status: 'draft',
        is_reusable: Boolean(reusableFrom),
        source_project_id: reusableFrom || null,
        prompt_json: {
          ...brief,
          campaignMode: form.campaignMode,
          creditCost: getCredits(form.campaignMode),
          createdFrom: reusableFrom ? 'reuse' : 'guided_campaign',
          campaignFolderId: campaignFolder.id,
          campaignFolderName: campaignFolder.name,
          campaignAssets,
          generatedBy: generated?.model ? 'ai' : 'local',
          model: generated?.model || null,
          usage: generated?.usage || null,
          evidence: generated?.evidence || [],
        },
        plan_json: plan,
      })
    },
    onSuccess: async (project) => {
      if (!project) return
      await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['secure-vault-documents'] }),
        queryClient.invalidateQueries({ queryKey: ['secure-vault-folders'] }),
      ])
      setSelectedId(project.id)
      setMode('library')
      setAssetFiles([])
      setNotice(`${MODE_LABELS[form.campaignMode]} campaign created and saved.`)
      setError('')
    },
    onError: (err) => {
      setNotice('')
      setError(err.message || 'Could not create this campaign.')
    },
  })

  async function handleUpdateProject(project, changes, successMessage) {
    if (!requireWriteAccess('update Campaign Partner projects')) return
    try {
      setError('')
      setNotice('')
      await updateCampaignProject(project.id, changes)
      await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
      setNotice(successMessage)
    } catch (err) {
      setError(err.message || 'Could not update this campaign.')
    }
  }

  async function handleArchive(project) {
    if (!requireWriteAccess('archive Campaign Partner projects')) return
    try {
      await archiveCampaignProject(project.id)
      await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
      setNotice('Campaign archived.')
    } catch (err) {
      setError(err.message || 'Could not archive this campaign.')
    }
  }

  async function handleDelete(project) {
    if (!requireWriteAccess('delete Campaign Partner projects')) return
    if (!window.confirm(`Delete ${project.title}? This removes the saved campaign project plus future Publisher drafts and scheduled posts it created. Already-posted social posts will stay in Publisher history.`)) return
    try {
      const cleanup = await deleteCampaignProjectWithDrafts(project)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] }),
        queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] }),
        queryClient.invalidateQueries({ queryKey: ['calendar-posts', clientId] }),
      ])
      const cleanupParts = [
        cleanup.deletedDraftCount
          ? `${cleanup.deletedDraftCount} Publisher draft${cleanup.deletedDraftCount === 1 ? '' : 's'} removed`
          : '',
        cleanup.deletedPostCount
          ? `${cleanup.deletedPostCount} future scheduled post${cleanup.deletedPostCount === 1 ? '' : 's'} removed`
          : '',
        cleanup.preservedPublishedPostCount
          ? `${cleanup.preservedPublishedPostCount} posted item${cleanup.preservedPublishedPostCount === 1 ? '' : 's'} kept in history`
          : '',
      ].filter(Boolean)
      setNotice(cleanupParts.length ? `Campaign deleted. ${cleanupParts.join('; ')}.` : 'Campaign deleted.')
    } catch (err) {
      setError(err.message || 'Could not delete this campaign.')
    }
  }

  async function handleAddDrafts(project) {
    if (!requireWriteAccess('add Campaign Partner drafts to Publisher')) return
    const posts = normalizeList(project?.plan_json?.posts)
    if (!posts.length) return

    try {
      setError('')
      setNotice('')
      const nextPosts = []
      for (const post of posts) {
        const draft = await upsertSocialDraft(buildDraftRow({ project, post, profile }))
        nextPosts.push({
          ...post,
          status: 'added_to_calendar',
          campaignDraftId: draft.id,
        })
      }
      await updateCampaignProject(project.id, {
        status: 'active',
        plan_json: { ...project.plan_json, posts: nextPosts, lastAddedToCalendarAt: new Date().toISOString() },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] }),
        queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] }),
      ])
      setNotice(`${nextPosts.length} campaign drafts added to Publisher.`)
    } catch (err) {
      setError(err.message || 'Could not add campaign drafts.')
    }
  }

  async function saveProjectPosts(project, posts, successMessage) {
    await updateCampaignProject(project.id, {
      plan_json: { ...project.plan_json, posts, updatedFromCampaignPartnerAt: new Date().toISOString() },
    })
    await queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] })
    if (successMessage) setNotice(successMessage)
  }

  async function ensureCampaignPostDraft(project, post) {
    const draft = await upsertSocialDraft(buildDraftRow({ project, post, profile }))
    const posts = normalizeList(project.plan_json?.posts)
    const nextPosts = posts.map((item) => item.id === post.id
      ? { ...item, status: 'added_to_calendar', campaignDraftId: draft.id }
      : item)
    await updateCampaignProject(project.id, {
      status: project.status === 'draft' ? 'active' : project.status,
      plan_json: { ...project.plan_json, posts: nextPosts, lastDraftOpenedAt: new Date().toISOString() },
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['campaign-projects', clientId] }),
      queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] }),
    ])
    return draft
  }

  async function handleEditCampaignPost(project, post) {
    if (!requireWriteAccess('edit Campaign Partner drafts')) return
    try {
      setError('')
      setNotice('')
      const draft = await ensureCampaignPostDraft(project, post)
      navigate(`/post?draftId=${draft.id}`)
    } catch (err) {
      setError(err.message || 'Could not open this campaign post in Publisher.')
    }
  }

  async function handleRescheduleCampaignPost(project, post) {
    if (!requireWriteAccess('reschedule Campaign Partner drafts')) return
    const current = `${post.date || ''} ${post.time || '10:00'}`.trim()
    const nextValue = window.prompt('Enter a new date and time like 2026-05-02 10:00', current)
    if (!nextValue) return

    const match = nextValue.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?$/)
    if (!match) {
      setError('Use the format YYYY-MM-DD HH:MM.')
      return
    }

    const [, nextDate, nextTime = post.time || '10:00'] = match
    const posts = normalizeList(project.plan_json?.posts)
    const nextPosts = posts.map((item) => item.id === post.id ? { ...item, date: nextDate, time: nextTime } : item)

    try {
      setError('')
      setNotice('')
      await saveProjectPosts(project, nextPosts, 'Campaign post rescheduled.')
      if (post.campaignDraftId) {
        await updateSocialDraft(post.campaignDraftId, {
          slot_date_local: nextDate,
          slot_start_local: nextTime,
          scheduled_for: toIsoAt(nextDate, nextTime),
        })
        await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      }
    } catch (err) {
      setError(err.message || 'Could not reschedule this campaign post.')
    }
  }

  async function handleDeleteCampaignPost(project, post) {
    if (!requireWriteAccess('delete Campaign Partner drafts')) return
    if (!window.confirm(`Delete "${post.title}" from this campaign?`)) return
    const posts = normalizeList(project.plan_json?.posts).filter((item) => item.id !== post.id)

    try {
      setError('')
      setNotice('')
      if (post.campaignDraftId) {
        await deleteSocialDraft(post.campaignDraftId).catch(() => null)
        await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      }
      await saveProjectPosts(project, posts, 'Campaign post deleted.')
    } catch (err) {
      setError(err.message || 'Could not delete this campaign post.')
    }
  }

  function handleReuse(project) {
    const prompt = project.prompt_json || {}
    setForm({
      ...DEFAULT_FORM,
      campaignMode: prompt.campaignMode || 'standard',
      campaignType: project.campaign_type || 'event',
      title: `${project.title} refresh`,
      goal: project.goal || '',
      audience: prompt.audience || DEFAULT_FORM.audience,
      offer: prompt.offer || '',
      startDate: '',
      endDate: '',
      durationDays: prompt.durationDays || '14',
      budgetRange: prompt.budgetRange || DEFAULT_FORM.budgetRange,
      campaignLinks: normalizeList(prompt.campaignLinks).join('\n'),
      assetNotes: prompt.assetNotes || '',
      visualStyles: normalizeList(prompt.visualStyles).length ? prompt.visualStyles : DEFAULT_FORM.visualStyles,
      toneOptions: normalizeList(prompt.toneOptions).length ? prompt.toneOptions : DEFAULT_FORM.toneOptions,
      avoidOptions: normalizeList(prompt.avoidOptions).length ? prompt.avoidOptions : DEFAULT_FORM.avoidOptions,
      tone: prompt.tone || DEFAULT_FORM.tone,
      avoidTopics: prompt.avoidTopics || '',
      selectedAssetFolderId: prompt.campaignFolderId || prompt.campaignFolder?.id || '',
      keyDetails: prompt.keyDetails || '',
      targetLocation: prompt.targetLocation || prompt.localAwareness?.targetLocation || '',
      targetBusinessTypes: prompt.targetBusinessTypes || prompt.localAwareness?.targetBusinessTypes || '',
      visitPlan: prompt.visitPlan || prompt.localAwareness?.visitPlan || '',
      familiarityGoal: prompt.familiarityGoal || prompt.localAwareness?.familiarityGoal || DEFAULT_FORM.familiarityGoal,
      inPersonAngle: prompt.inPersonAngle || prompt.localAwareness?.inPersonAngle || '',
    })
    setAssetFiles([])
    setMode('create')
    setNotice('Loaded campaign as a reusable starting point.')
  }

  async function handleOpenCampaignAsset(asset) {
    if (!isCampaignPreviewableImage(asset)) return

    try {
      if (asset.file instanceof File) {
        const objectUrl = URL.createObjectURL(asset.file)
        setAssetLightbox((current) => {
          if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl)
          return {
            src: objectUrl,
            objectUrl,
            name: asset.name || asset.file.name || 'Campaign asset',
          }
        })
        return
      }

      const documentId = asset.id || asset.document_id
      if (!documentId) return
      const payload = await getSecureVaultDocumentUrl(documentId, 'view')
      setAssetLightbox((current) => {
        if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl)
        return {
          src: payload.signed_url || '',
          name: payload.file_name || asset.name || asset.file_name || 'Campaign asset',
        }
      })
    } catch (err) {
      setError(err.message || 'Could not open this campaign asset.')
    }
  }

  function renderCreateView() {
    const selectedMode = CAMPAIGN_MODES.find((item) => item.value === form.campaignMode) || CAMPAIGN_MODES[0]
    const isLocalAwareness = isLocalAwarenessCampaign(form.campaignType)
    const completedCoreFields = [form.title, form.goal, form.audience, form.offer].filter((value) => String(value || '').trim()).length
    const previewPosts = previewPlan.posts.slice(0, 2)

    return (
      <section className="campaign-partner-shell campaign-create-shell">
        <div className="campaign-create-layout campaign-create-flow campaign-create-topdown">
          <section className="campaign-flow-section campaign-type-section">
            <div className="campaign-flow-section-head">
              <span>1</span>
              <div>
                <h2>Campaign type</h2>
                <p>Pick the closest fit.</p>
              </div>
            </div>

            <div className="campaign-type-list">
              {CAMPAIGN_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  data-active={form.campaignType === type.value}
                  onClick={() => {
                    setForm((current) => applyCampaignTypeDefaults(current, type.value))
                  }}
                >
                  <strong>{type.label}</strong>
                  <small>{type.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="campaign-flow-section campaign-guide-section">
            <div className="campaign-flow-section-head">
              <span>2</span>
              <div>
                <h2>Guide level</h2>
                <p>{TYPE_LABELS[form.campaignType] || 'Campaign'} selected.</p>
              </div>
            </div>

            <div className="campaign-mode-grid campaign-mode-grid-compact">
              {CAMPAIGN_MODES.map((campaignMode) => (
                <button
                  key={campaignMode.value}
                  type="button"
                  className="campaign-mode-card"
                  data-active={form.campaignMode === campaignMode.value}
                  onClick={() => setForm((current) => ({ ...current, campaignMode: campaignMode.value }))}
                >
                  <span>{campaignMode.label}</span>
                  <strong>{campaignMode.heading}</strong>
                  <small>{campaignMode.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="campaign-flow-section campaign-brief-pane campaign-create-workspace">
            <div className="campaign-flow-section-head">
              <span>3</span>
              <div>
                <h2>Brief</h2>
                <p>{completedCoreFields}/4 essentials added.</p>
              </div>
            </div>

            <div className="campaign-brief-grid campaign-brief-grid-focused">
              <label>Campaign name<input value={form.title} placeholder={isLocalAwareness ? 'Name this local visit' : 'Name this campaign'} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Primary goal<input value={form.goal} placeholder={isLocalAwareness ? 'What should people know before you arrive?' : 'What should this campaign accomplish?'} onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))} /></label>
              <label>Audience<textarea value={form.audience} placeholder={isLocalAwareness ? 'Who should recognize you in this area?' : 'Who should this reach?'} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))} /></label>
              <label>Offer or CTA<textarea value={form.offer} placeholder={isLocalAwareness ? 'What should people do when you are nearby?' : 'What should people do next?'} onChange={(event) => setForm((current) => ({ ...current, offer: event.target.value }))} /></label>
            </div>
          </section>

          <section className="campaign-flow-section campaign-context-stack">
            <div className="campaign-flow-section-head">
              <span>4</span>
              <div>
                <h2>Context</h2>
                <p>Timing, links, assets, and guardrails.</p>
              </div>
            </div>

            {isLocalAwareness ? (
              <div className="campaign-local-brief">
                <div className="campaign-local-brief-head">
                  <Target className="h-4 w-4" />
                  <div>
                    <strong>Local targeting</strong>
                    <span>Use only when this campaign supports a visit or service area.</span>
                  </div>
                </div>
                <div className="campaign-brief-grid campaign-local-grid">
                  <label>Target area<input value={form.targetLocation} placeholder="City, ZIP, county, or service area" onChange={(event) => setForm((current) => ({ ...current, targetLocation: event.target.value }))} /></label>
                  <label>Business types<input value={form.targetBusinessTypes} placeholder="Restaurants, salons, retailers, contractors" onChange={(event) => setForm((current) => ({ ...current, targetBusinessTypes: event.target.value }))} /></label>
                  <label>Visit plan<textarea value={form.visitPlan} placeholder="Tue-Thu, walk-ins in the afternoon" onChange={(event) => setForm((current) => ({ ...current, visitPlan: event.target.value }))} /></label>
                  <label>Conversation angle<textarea value={form.inPersonAngle} placeholder="Lower fees, clearer statements, faster deposits" onChange={(event) => setForm((current) => ({ ...current, inPersonAngle: event.target.value }))} /></label>
                  <label className="campaign-brief-wide">Recognition goal<textarea value={form.familiarityGoal} placeholder="What should people know before you visit?" onChange={(event) => setForm((current) => ({ ...current, familiarityGoal: event.target.value }))} /></label>
                </div>
              </div>
            ) : null}

            <div className="campaign-brief-grid campaign-context-grid">
              <label>{isLocalAwareness ? 'First day in area' : 'Start date'}<input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label>
              <label>{isLocalAwareness ? 'Last day in area' : 'End date'}<input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></label>
              <label>Duration<input value={form.durationDays} onChange={(event) => setForm((current) => ({ ...current, durationDays: event.target.value }))} /></label>
              <label>Budget comfort<input value={form.budgetRange} onChange={(event) => setForm((current) => ({ ...current, budgetRange: event.target.value }))} /></label>
              <label className="campaign-brief-wide">Links<textarea value={form.campaignLinks} placeholder="Landing page, booking page, offer page, calendar link, or competitor example" onChange={(event) => setForm((current) => ({ ...current, campaignLinks: event.target.value }))} /></label>
              <div className="campaign-brief-wide campaign-assets-panel">
                <div className="campaign-assets-head">
                  <div>
                    <span>Campaign assets</span>
                    <strong>Photos, videos, flyers, screenshots</strong>
                  </div>
                  <FolderOpen className="h-5 w-5" />
                </div>
                <p>Files uploaded here are saved in Documents inside a folder named after this campaign.</p>
                <div className="campaign-assets-grid">
                  <label className="campaign-upload-box">
                    <Upload className="h-5 w-5" />
                    <span>Add individual files</span>
                    <small>{assetFiles.length ? `${assetFiles.length} selected asset${assetFiles.length === 1 ? '' : 's'}` : 'Images, videos, flyers, screenshots, docs'}</small>
                    <input
                      type="file"
                      multiple
                      accept={CAMPAIGN_ASSET_ACCEPT}
                      onChange={(event) => {
                        const files = getFolderUploadFiles(event.target.files)
                        setAssetFiles((current) => mergeAssetFiles(current, files))
                        event.target.value = ''
                      }}
                    />
                  </label>
                  <label className="campaign-upload-box campaign-upload-folder">
                    <FolderOpen className="h-5 w-5" />
                    <span>Upload folder</span>
                    <small>Choose one folder and include nested subfolders.</small>
                    <input
                      type="file"
                      multiple
                      accept={CAMPAIGN_ASSET_ACCEPT}
                      webkitdirectory=""
                      directory=""
                      onChange={(event) => {
                        const files = getFolderUploadFiles(event.target.files)
                        setAssetFiles((current) => mergeAssetFiles(current, files))
                        event.target.value = ''
                      }}
                    />
                  </label>
                  <label className="campaign-folder-picker">Use existing Documents folder
                    <select
                      value={form.selectedAssetFolderId}
                      onChange={(event) => setForm((current) => ({ ...current, selectedAssetFolderId: event.target.value }))}
                    >
                      <option value="">No existing folder</option>
                      {secureFolders.map((folder) => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                    <small>{selectedFolderAssets.length ? `${selectedFolderAssets.length} existing asset${selectedFolderAssets.length === 1 ? '' : 's'} will be considered` : 'Optional if files are already in Documents'}</small>
                  </label>
                </div>
                {assetFiles.length || selectedFolderAssets.length ? (
                  <div className="campaign-asset-list">
                    {[...assetFiles, ...selectedFolderAssets.map(summarizeCampaignAsset)].slice(0, 8).map((asset) => {
                      const previewable = isCampaignPreviewableImage(asset)
                      const Tag = previewable ? 'button' : 'span'
                      return (
                        <Tag
                          key={asset.id || asset.name}
                          type={previewable ? 'button' : undefined}
                          className={previewable ? 'campaign-asset-preview-item' : undefined}
                          onClick={previewable ? () => handleOpenCampaignAsset(asset) : undefined}
                          title={previewable ? 'Open larger image preview' : undefined}
                        >
                          <strong>{asset.name || asset.file_name}</strong>
                          <small>{asset.relativePath || asset.relative_path || asset.folderPath || asset.folder_path || 'Campaign asset'}</small>
                          <small>{asset.kind || assetKindFromMime(asset.type || asset.mime_type || '')} {asset.size || asset.size_bytes ? `· ${formatVaultBytes(asset.size || asset.size_bytes)}` : ''}</small>
                        </Tag>
                      )
                    })}
                    {assetFiles.length + selectedFolderAssets.length > 8 ? (
                      <span>
                        <strong>{assetFiles.length + selectedFolderAssets.length - 8} more assets</strong>
                        <small>They will still be uploaded and included in the planner context.</small>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <MultiSelectField
                label="Visual style"
                options={VISUAL_STYLE_OPTIONS}
                value={form.visualStyles}
                placeholder="Choose how Partner should use visuals."
                onChange={(visualStyles) => setForm((current) => ({ ...current, visualStyles }))}
              />
              <MultiSelectField
                label="Tone"
                options={TONE_OPTIONS}
                value={form.toneOptions}
                placeholder="Choose the campaign voice."
                onChange={(toneOptions) => setForm((current) => ({ ...current, toneOptions }))}
              />
              <MultiSelectField
                label="Avoid"
                options={AVOID_OPTIONS}
                value={form.avoidOptions}
                placeholder="Choose guardrails."
                onChange={(avoidOptions) => setForm((current) => ({ ...current, avoidOptions }))}
              />
              <label className="campaign-brief-wide">Extra visual notes<textarea value={form.assetNotes} placeholder="Specific instructions for photos, videos, screenshots, logos, or flyers" onChange={(event) => setForm((current) => ({ ...current, assetNotes: event.target.value }))} /></label>
              <label>Custom tone note<input value={form.tone} placeholder="Optional override or brand phrase" onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))} /></label>
              <label>Avoid note<input value={form.avoidTopics} placeholder="Anything else Partner should avoid" onChange={(event) => setForm((current) => ({ ...current, avoidTopics: event.target.value }))} /></label>
              <label className="campaign-brief-wide">Other details<textarea value={form.keyDetails} placeholder="Deadlines, objections, local context, or ideas" onChange={(event) => setForm((current) => ({ ...current, keyDetails: event.target.value }))} /></label>
            </div>
          </section>

          <section className="campaign-flow-section campaign-result campaign-plan-preview campaign-create-preview">
            <div className="campaign-flow-section-head">
              <span>5</span>
              <div>
                <h2>Review</h2>
                <p>{selectedMode.heading}</p>
              </div>
              <button
                type="button"
                className="portal-ai-action portal-ai-action-compact inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold"
                data-generating={saveProject.isPending}
                onClick={() => saveProject.mutate({})}
                disabled={saveProject.isPending}
              >
                {saveProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate campaign
              </button>
            </div>

            <div className="campaign-preview-sections">
              <div>
                <Target className="h-4 w-4" />
                <strong>Strategy</strong>
                <p>{TYPE_LABELS[form.campaignType] || 'Campaign'} · {selectedMode.label}</p>
              </div>
              <div>
                <LinkIcon className="h-4 w-4" />
                <strong>Context</strong>
                <p>{assetFiles.length || selectedFolderAssets.length ? `${assetFiles.length + selectedFolderAssets.length} asset${assetFiles.length + selectedFolderAssets.length === 1 ? '' : 's'} ready` : 'Profile, links, and notes'}</p>
              </div>
              <div>
                <CalendarDays className="h-4 w-4" />
                <strong>Drafts</strong>
                <p>{previewPlan.posts.length} starter posts</p>
              </div>
            </div>

            <div className="campaign-board campaign-board-compact">
              {previewPosts.map((post) => (
                <div key={post.id} className="campaign-post-card">
                  <strong>{post.title}</strong>
                  <p>{post.caption}</p>
                  <div>{formatDate(post.date)} · {post.platforms.join(' + ')}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    )
  }

  function renderCampaignPostDrafts(project) {
    const posts = normalizeList(project?.plan_json?.posts)
    if (!project || !posts.length) return null

    return (
      <section className="campaign-post-drafts-section">
        <div className="campaign-post-drafts-head">
          <div>
            <p className="campaign-eyebrow">Publisher drafts</p>
            <h2>Suggested schedule</h2>
          </div>
          <button type="button" className="portal-button-primary" onClick={() => handleAddDrafts(project)}>
            <CalendarDays className="h-4 w-4" />
            Add all to Publisher
          </button>
        </div>

        <div className="campaign-post-draft-list">
          {posts.map((post) => (
            <div
              key={post.id}
              role="button"
              tabIndex={0}
              className="campaign-post-draft-row"
              onClick={() => handleEditCampaignPost(project, post)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleEditCampaignPost(project, post)
                }
              }}
            >
              <div className="campaign-post-date">
                <b>{formatDate(post.date)}</b>
                <span>{post.time || '10:00'}</span>
              </div>
              <div className="campaign-post-copy">
                <strong>{post.title}</strong>
                <p>{post.caption || 'Open in Publisher to finish this campaign draft.'}</p>
                {post.whyNow ? <small>{post.whyNow}</small> : null}
              </div>
              <div className="campaign-post-status-stack">
                <PostStatusPill status={post.status} />
                <CampaignPlatformMarkers platforms={post.platforms} />
              </div>
              <CampaignPostMenu
                post={post}
                actions={[
                  { label: 'Edit in Publisher', Icon: Edit3, onSelect: () => handleEditCampaignPost(project, post) },
                  { label: 'Reschedule', Icon: CalendarDays, onSelect: () => handleRescheduleCampaignPost(project, post) },
                  { label: 'Delete', Icon: Trash2, destructive: true, onSelect: () => handleDeleteCampaignPost(project, post) },
                ]}
              />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="portal-page campaign-partner-page w-full max-w-none space-y-3 px-2 py-3 md:px-3 xl:px-4">
      {assetLightbox?.src ? createPortal(
        <div className="create-post-media-lightbox" role="dialog" aria-modal="true" aria-label="Campaign asset preview" onClick={() => setAssetLightbox(null)}>
          <div className="create-post-media-lightbox-frame" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="create-post-media-lightbox-close" onClick={() => setAssetLightbox(null)} aria-label="Close campaign asset preview">
              <X className="h-5 w-5" />
            </button>
            <div className="create-post-media-lightbox-stage">
              <img src={assetLightbox.src} alt={assetLightbox.name || 'Campaign asset preview'} />
            </div>
            {assetLightbox.name ? <p>{assetLightbox.name}</p> : null}
          </div>
        </div>,
        window.document.body,
      ) : null}
      {mode === 'create' ? (
        <section className="campaign-partner-create-strip">
          <button type="button" onClick={() => setMode('library')}>Campaign library</button>
          <span>New campaign</span>
        </section>
      ) : (
        <section className="campaign-partner-tabs">
          <button type="button" data-active={mode === 'library'} onClick={() => setMode('library')}>Campaign library</button>
          <button type="button" data-active={mode === 'create'} onClick={() => setMode('create')}>Create campaign</button>
        </section>
      )}

      {(notice || error) ? (
        <div className="campaign-partner-notice" data-tone={error ? 'error' : 'success'}>{error || notice}</div>
      ) : null}

      {mode === 'create' ? renderCreateView() : (
        <section className="campaign-partner-shell">
          <header className="campaign-partner-topbar">
            <div>
              <p>Campaign Partner</p>
              <h1>Campaigns</h1>
            </div>
            <div className="campaign-partner-actions">
              <button type="button" className="portal-button-secondary" onClick={() => navigate('/opportunities')}>Import idea</button>
              <button
                type="button"
                className="portal-ai-action portal-ai-action-compact inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-semibold"
                onClick={() => setMode('create')}
              >
                <Sparkles className="h-4 w-4" />
                Plan campaign
              </button>
            </div>
          </header>

          <div className="campaign-stat-grid">
            <div><strong>{counts.active}</strong><span>Active campaigns</span></div>
            <div><strong>{counts.drafts}</strong><span>Draft posts waiting</span></div>
            <div><strong>{counts.scheduled}</strong><span>Added to calendar</span></div>
            <div><strong>{counts.reusable}</strong><span>Reusable campaigns</span></div>
          </div>

          <div className="campaign-library-layout">
            <aside className="campaign-folder-pane">
              {[
                ['all', 'All campaigns', projects.length],
                ['active', 'Active', counts.active],
                ['draft', 'Draft', projects.filter((project) => project.status === 'draft').length],
                ['completed', 'Completed', projects.filter((project) => project.status === 'completed').length],
                ['reusable', 'Reusable', counts.reusable],
              ].map(([value, label, count]) => (
                <button key={value} type="button" data-active={filter === value} onClick={() => setFilter(value)}>
                  <span>{label}</span>
                  <small>{count}</small>
                </button>
              ))}
            </aside>

            <section className="campaign-list-pane">
              <div className="campaign-list-head">
                <div>
                  <p className="campaign-eyebrow">Library</p>
                  <h2>Campaign projects</h2>
                </div>
                <label className="campaign-search">
                  <Search className="h-4 w-4" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns" />
                </label>
              </div>
              {isLoading ? (
                <div className="campaign-empty"><Loader2 className="h-5 w-5 animate-spin" /> Loading campaigns...</div>
              ) : filteredProjects.length ? (
                <div className="campaign-row-list">
                  {filteredProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className="campaign-row"
                      data-active={selectedProject?.id === project.id}
                      onClick={() => setSelectedId(project.id)}
                    >
                      <span className="campaign-row-icon">{project.title.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span>
                      <span className="campaign-row-copy">
                        <strong>{project.title}</strong>
                        <small>{MODE_LABELS[project.prompt_json?.campaignMode] || 'Standard'} · {TYPE_LABELS[project.campaign_type] || 'Campaign'} · {normalizeList(project.plan_json?.posts).length} posts</small>
                      </span>
                      <span className="campaign-status" data-status={project.status}>{STATUS_LABELS[project.status] || project.status}</span>
                      <span className="campaign-menu-wrap">
                        <span type="button" className="campaign-kebab" onClick={(event) => { event.stopPropagation(); setOpenMenuId(openMenuId === project.id ? '' : project.id) }}>
                          <MoreHorizontal className="h-4 w-4" />
                        </span>
                        {openMenuId === project.id ? (
                          <span className="campaign-row-menu">
                            <span onClick={(event) => { event.stopPropagation(); handleReuse(project); setOpenMenuId('') }}><RotateCcw className="h-4 w-4" /> Reuse with changes</span>
                            <span onClick={(event) => { event.stopPropagation(); handleUpdateProject(project, { is_reusable: !project.is_reusable }, project.is_reusable ? 'Reusable flag removed.' : 'Marked reusable.'); setOpenMenuId('') }}><Copy className="h-4 w-4" /> {project.is_reusable ? 'Remove reusable' : 'Mark reusable'}</span>
                            <span onClick={(event) => { event.stopPropagation(); handleArchive(project); setOpenMenuId('') }}><Archive className="h-4 w-4" /> Archive</span>
                            <span data-danger onClick={(event) => { event.stopPropagation(); handleDelete(project); setOpenMenuId('') }}><Trash2 className="h-4 w-4" /> Delete</span>
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="campaign-empty">
                  <Megaphone className="h-6 w-6" />
                  No campaigns match this view.
                </div>
              )}
            </section>

            <section className="campaign-middle-schedule">
              {renderCampaignPostDrafts(selectedProject)}
            </section>

            <section className="campaign-detail-pane">
              {selectedProject ? (
                <>
                  <span className="campaign-badge">{MODE_LABELS[selectedProject.prompt_json?.campaignMode] || 'Standard'} · {TYPE_LABELS[selectedProject.campaign_type] || 'Campaign'}</span>
                  <h2>{selectedProject.title}</h2>
                  <p>{selectedProject.plan_json?.coreMessage || selectedProject.goal || 'A saved campaign project MAP can edit, reuse, and send into Publisher as draft posts.'}</p>
                  <div className="campaign-detail-actions">
                    <button type="button" className="portal-button-primary" onClick={() => handleAddDrafts(selectedProject)}>
                      <CalendarDays className="h-4 w-4" />
                      Add drafts to calendar
                    </button>
                    <button type="button" className="portal-button-secondary" onClick={() => handleReuse(selectedProject)}>
                      <Edit3 className="h-4 w-4" />
                      Edit campaign
                    </button>
                    <button type="button" className="portal-button-secondary" onClick={() => handleReuse(selectedProject)}>
                      <RotateCcw className="h-4 w-4" />
                      Reuse with changes
                    </button>
                  </div>

                  <div className="campaign-detail-section">
                    <p className="campaign-eyebrow">Strategy</p>
                    <ul>
                      {normalizeList(selectedProject.plan_json?.strategy).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>

                  {normalizeList(selectedProject.plan_json?.growthActions).length ? (
                    <div className="campaign-detail-section">
                      <p className="campaign-eyebrow">Growth actions</p>
                      <ul>
                        {normalizeList(selectedProject.plan_json?.growthActions).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}

                </>
              ) : (
                <div className="campaign-empty">
                  <FolderOpen className="h-6 w-6" />
                  Create your first campaign project.
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  )
}
