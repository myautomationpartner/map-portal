import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { openDropboxChooser } from '../lib/dropboxApi'
import {
  fetchProfile,
  fetchScheduledPosts,
  fetchSocialDrafts,
  updateSocialDraft,
  upsertSocialDraft,
} from '../lib/portalApi'
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
  AlertCircle, ArrowUpRight, Calendar, CalendarDays, Camera, CheckCircle2,
  ChevronRight, Clock3, Globe, History, Loader2, Music2, Paperclip,
  Send, Share2, UploadCloud, Wand2, X,
} from 'lucide-react'

const N8N_BASE = import.meta.env.VITE_N8N_BASE_URL || 'https://n8n.myautomationpartner.com'

const PLATFORMS = [
  {
    id: 'facebook',
    label: 'Facebook',
    Icon: Share2,
    accent: '#4267B2',
    soft: 'rgba(66, 103, 178, 0.10)',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    Icon: Camera,
    accent: '#C13584',
    soft: 'rgba(193, 53, 132, 0.10)',
  },
  {
    id: 'google',
    label: 'Google Business',
    Icon: Globe,
    accent: '#34A853',
    soft: 'rgba(52, 168, 83, 0.10)',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    Icon: Music2,
    accent: '#111111',
    soft: 'rgba(17, 17, 17, 0.08)',
  },
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

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
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

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0)))
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date)
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

function formatLocalDateTime(value) {
  const parsed = parseLocalDateTime(value)
  if (!parsed) return 'Pick a calendar slot'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute))
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

function getMinScheduleValue() {
  const threshold = new Date(Date.now() + 5 * 60_000)
  threshold.setSeconds(0, 0)
  const local = new Date(threshold.getTime() - threshold.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function getSlotKey(slot) {
  return slot ? `${slot.slot_date_local}::${slot.slot_label}` : ''
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

function PlatformPreview({ platformId, profile, content, imagePreview, dropboxAttachments, scheduledFor }) {
  const platform = PLATFORMS.find((item) => item.id === platformId)
  if (!platform) return null

  const businessName = profile?.clients?.business_name || 'Your Business'
  const previewTime = scheduledFor ? formatLocalDateTime(scheduledFor) : 'Ready to publish'
  const attachmentCount = dropboxAttachments.length
  const visualPreview = imagePreview || getDropboxPreviewSource(dropboxAttachments)

  if (platformId === 'instagram') {
    return (
      <div
        className="mx-auto max-w-[430px] overflow-hidden rounded-[28px]"
        style={{ background: '#fff', border: '1px solid var(--portal-border)', boxShadow: '0 18px 40px rgba(26, 24, 20, 0.08)' }}
      >
        <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--portal-border)' }}>
          <div className="h-10 w-10 rounded-full" style={{ background: 'linear-gradient(135deg, #feda75, #d62976, #4f5bd5)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{businessName}</p>
            <p className="text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>{previewTime}</p>
          </div>
        </div>
        <div
          className="aspect-square w-full overflow-hidden"
          style={{ background: visualPreview ? '#f4f1ec' : 'linear-gradient(135deg, rgba(254,218,117,0.16), rgba(214,41,118,0.12))' }}
        >
          {visualPreview ? (
            <img
              src={visualPreview}
              alt="Instagram preview"
              className="h-full w-full object-contain"
              style={{ background: '#f4f1ec' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--portal-text-soft)' }}>
              Image-first Instagram preview
            </div>
          )}
        </div>
        <div className="px-4 py-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--portal-text)' }}>
            <span className="font-semibold">{businessName}</span> {content}
          </p>
        </div>
      </div>
    )
  }

  if (platformId === 'facebook') {
    return (
      <div className="overflow-hidden rounded-[28px]" style={{ background: '#fff', border: '1px solid var(--portal-border)' }}>
        <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--portal-border)' }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ background: platform.accent }}>
            <platform.Icon className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{businessName}</p>
            <p className="text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>{previewTime}</p>
          </div>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--portal-text)' }}>{content}</p>
        </div>
        {visualPreview && (
          <img src={visualPreview} alt="Facebook preview" className="max-h-80 w-full object-cover" />
        )}
      </div>
    )
  }

  if (platformId === 'google') {
    return (
      <div className="rounded-[28px] p-5" style={{ background: '#fff', border: '1px solid var(--portal-border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: platform.accent }}>
            <platform.Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>{businessName}</p>
            <p className="text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>Google Business update</p>
          </div>
        </div>
        <div className="mt-4 rounded-[20px] p-4" style={{ background: 'rgba(52, 168, 83, 0.06)' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: platform.accent }}>
            Scheduled
          </p>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--portal-text)' }}>{content}</p>
          <p className="mt-3 text-xs" style={{ color: 'var(--portal-text-soft)' }}>{previewTime}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] p-5" style={{ background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{businessName}</p>
          <p className="text-[10px] text-white/60">TikTok caption preview</p>
        </div>
        <div className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ background: 'rgba(255,255,255,0.08)' }}>
          {attachmentCount > 0 ? `${attachmentCount} assets` : 'Caption only'}
        </div>
      </div>
      <div className="mt-4 rounded-[22px] p-4" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))' }}>
        <p className="text-lg font-semibold leading-snug">{content || 'Your caption preview will appear here.'}</p>
        <p className="mt-4 text-xs text-white/60">{previewTime}</p>
      </div>
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
                        ? { background: soft, border: `1px solid ${accent}40`, color: accent }
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
                {timingMode === 'now' ? 'Publish now' : formatLocalDateTime(scheduledFor)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {activePlatforms.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {activePlatforms.map((platformId) => {
                    const platform = PLATFORMS.find((item) => item.id === platformId)
                    if (!platform) return null

                    return (
                      <button
                        key={platformId}
                        type="button"
                        onClick={() => setPreviewPlatform(platformId)}
                        className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em]"
                        style={previewPlatform === platformId
                          ? { background: platform.soft, color: platform.accent, border: `1px solid ${platform.accent}40` }
                          : { background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text-soft)', border: '1px solid var(--portal-border)' }}
                      >
                        {platform.label}
                      </button>
                    )
                  })}
                </div>

                <PlatformPreview
                  platformId={previewPlatform}
                  profile={profile}
                  content={content}
                  imagePreview={imagePreview}
                  dropboxAttachments={dropboxAttachments}
                  scheduledFor={scheduledFor}
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
  useOutletContext()

  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const fileInputRef = useRef(null)
  const composerRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const hydratingDraftRef = useRef(false)

  const [content, setContent] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [dropboxAttachments, setDropboxAttachments] = useState([])
  const [dropboxLoading, setDropboxLoading] = useState(false)
  const [timingMode, setTimingMode] = useState('slot')
  const [selectedPlatforms, setSelectedPlatforms] = useState({
    facebook: true,
    instagram: true,
    google: false,
    tiktok: false,
  })
  const [scheduledFor, setScheduledFor] = useState('')
  const [submitState, setSubmitState] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [previewPlatform, setPreviewPlatform] = useState('facebook')
  const [selectedDay, setSelectedDay] = useState('')
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

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  })

  const clientId = profile?.client_id

  const { data: scheduledPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['calendar-posts', clientId],
    queryFn: () => fetchScheduledPosts(clientId),
    enabled: !!clientId,
  })

  const { data: drafts = [], isLoading: draftsLoading } = useQuery({
    queryKey: ['social-drafts', clientId],
    queryFn: () => fetchSocialDrafts(clientId),
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
  const monthBaseDate = useMemo(() => {
    const firstSlotDate = groupedSlots[0]?.[0]
    if (firstSlotDate) {
      const parsed = parseDateOnly(firstSlotDate)
      if (parsed) return new Date(parsed.year, parsed.month - 1, 1)
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  }, [groupedSlots])
  const monthGrid = useMemo(() => buildMonthGrid(monthBaseDate), [monthBaseDate])

  const activePlatforms = Object.entries(selectedPlatforms)
    .filter(([, enabled]) => enabled)
    .map(([platformId]) => platformId)

  const charLimit = selectedPlatforms.google ? 1500 : 2200
  const charOver = content.length > charLimit
  const charPercent = Math.min((content.length / charLimit) * 100, 100)
  const isSubmitting = submitState === 'uploading' || submitState === 'posting'
  const minScheduleValue = getMinScheduleValue()
  const dropboxPreviewSource = getDropboxPreviewSource(dropboxAttachments)
  const mediaPreviewSource = imagePreview || dropboxPreviewSource
  const selectedDaySlots = selectedDay ? (slotsByDate.get(selectedDay) || []) : []
  const selectableDaySlots = selectedDaySlots.filter((slot) => ['recommended_fill', 'occupied_draft'].includes(slot.state))
  const activeSlot = useMemo(() => {
    if (!activeSlotKey || !calendar?.slots) return null
    return calendar.slots.find((slot) => getSlotKey(slot) === activeSlotKey) || null
  }, [activeSlotKey, calendar])
  const activeDraft = useMemo(() => drafts.find((draft) => draft.id === activeDraftId) || findDraftForSlot(drafts, activeSlot), [activeDraftId, drafts, activeSlot])

  const timingSummary = timingMode === 'now'
    ? 'Publishing as soon as you approve'
    : scheduledFor
      ? formatLocalDateTime(scheduledFor)
      : timingMode === 'custom'
        ? 'Choose any date and time'
        : 'Pick a slot from the calendar'

  const draftTargetDate = searchParams.get('date') || ''
  const draftTargetSlot = searchParams.get('slot') || ''

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
    if (!calendar?.slots || !draftTargetDate || !draftTargetSlot || draftLoading) return

    const slot = calendar.slots.find((entry) => entry.slot_date_local === draftTargetDate && entry.slot_label === draftTargetSlot)
    if (!slot || getSlotKey(slot) === activeSlotKey) return

    resolveDraftForSlot(slot, { source: 'calendar_link' })
  }, [calendar, draftTargetDate, draftTargetSlot, draftLoading, activeSlotKey, drafts, resolveDraftForSlot])

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

  const applyDraftToComposer = useCallback((draft, slot) => {
    hydratingDraftRef.current = true
    setActiveDraftId(draft.id || '')
    setActiveSlotKey(getSlotKey(slot))
    setSelectedAngleId(getDraftAngleId(draft))
    setAngleChoices(extractAngleChoices(draft))
    setMediaSuggestion(extractMediaSuggestion(draft))
    setGeneratedCaption(draft.draft_caption || '')
    setContent(draft.draft_caption || '')
    setDraftDirty(false)
    setDraftStatus(draft.draft_caption ? 'Draft loaded.' : 'Draft ready.')
    setDraftError('')
    setTimingMode('slot')
    setScheduledFor(slotToInputValue(slot))
    setSelectedDay(slot.slot_date_local)

    window.setTimeout(() => {
      hydratingDraftRef.current = false
    }, 0)
  }, [])

  const resolveDraftForSlot = useCallback(async (slot, options = {}) => {
    if (!profile || !calendar?.policy) return

    const preferredAngleId = options.preferredAngleId || ''
    const existingDraft = findDraftForSlot(drafts, slot)
    const shouldGenerate = !existingDraft?.draft_caption || Boolean(preferredAngleId)

    setDraftLoading(true)
    setDraftError('')
    setErrorMsg('')

    try {
      if (!shouldGenerate && existingDraft) {
        applyDraftToComposer(existingDraft, slot)
        return
      }

      const generated = generateDraftForSlot({
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
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      applyDraftToComposer(savedDraft, slot)
      setDraftStatus(preferredAngleId ? 'Caption regenerated with a new angle.' : 'Draft created and loaded.')
    } catch (error) {
      console.error('[SocialDraft]', error)
      setDraftError(error.message || 'Could not resolve this draft.')
    } finally {
      setDraftLoading(false)
    }
  }, [profile, calendar, drafts, queryClient, clientId, applyDraftToComposer])

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
          editCount: (currentMeta.editCount || 0) + 1,
          lastEditedAt: new Date().toISOString(),
          editSeverity: deltaRatio >= 0.35 ? 'heavy' : 'light',
        }),
      })

      setDraftStatus(deltaRatio >= 0.35 ? 'Draft edits saved. Future defaults will treat this as a heavier edit.' : 'Draft edits saved.')
      setGeneratedCaption(savedDraft.draft_caption || nextCaption.trim())
      setDraftDirty(false)
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
    } catch (error) {
      console.error('[SocialDraftAutosave]', error)
      setDraftError(error.message || 'Could not save draft edits.')
    }
  }, [activeDraftId, activeSlot, activeDraft, angleChoices, selectedAngleId, generatedCaption, mediaSuggestion, queryClient, clientId])

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Only image files are supported.')
      return
    }

    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (loadEvent) => setImagePreview(loadEvent.target?.result || null)
    reader.readAsDataURL(file)
    setErrorMsg('')
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDropboxAttach() {
    setDropboxLoading(true)
    setErrorMsg('')
    try {
      const files = await openDropboxChooser({ multiselect: true, linkType: 'preview' })
      if (files.length > 0) {
        setDropboxAttachments((previous) => {
          const existingLinks = new Set(previous.map((file) => file.link))
          const incoming = files.filter((file) => !existingLinks.has(file.link))
          return [...previous, ...incoming]
        })
      }
    } catch (error) {
      console.error('[Dropbox]', error)
      setErrorMsg(error.message || 'Could not open Dropbox. Please try again.')
    } finally {
      setDropboxLoading(false)
    }
  }

  function removeDropboxAttachment(link) {
    setDropboxAttachments((previous) => previous.filter((file) => file.link !== link))
  }

  function chooseSlot(slot) {
    const nextValue = slotToInputValue(slot)
    if (!nextValue) return

    setTimingMode('slot')
    setScheduledFor(nextValue)
    setSelectedDay(slot.slot_date_local)
    setErrorMsg('')
    setSearchParams({ date: slot.slot_date_local, slot: slot.slot_label })
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    resolveDraftForSlot(slot, { source: 'slot_click' })
  }

  function chooseNow() {
    setTimingMode('now')
    setScheduledFor('')
    setErrorMsg('')
    setDraftError('')
  }

  function chooseCustomTime(dayKey = '') {
    setTimingMode('custom')
    setSelectedDay(dayKey || selectedDay)
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
    const filename = `${clientId}/${Date.now()}.${extension}`
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

    setErrorMsg('')
    setReviewOpen(true)
  }

  async function handleSubmit() {
    const validationError = validatePost()
    if (validationError) {
      setErrorMsg(validationError)
      setReviewOpen(false)
      return
    }

    if (activePlatforms.length === 0) {
      setErrorMsg('Select at least one platform in the approval window.')
      return
    }

    let savedPostId = null

    try {
      let r2MediaUrl = null
      if (imageFile) {
        setSubmitState('uploading')
        r2MediaUrl = await uploadToR2(imageFile)
      }

      setSubmitState('posting')

      const effectiveMediaUrl = r2MediaUrl || (dropboxAttachments.length > 0 ? dropboxAttachments[0].link : null)
      const scheduledForIso = timingMode === 'now' ? null : localDateTimeToIso(scheduledFor)
      const targetStatus = timingMode === 'now' ? 'published' : 'scheduled'

      const { data: post, error: insertError } = await supabase
        .from('posts')
        .insert({
          client_id: clientId,
          content: content.trim(),
          media_url: effectiveMediaUrl,
          platforms: activePlatforms,
          status: 'draft',
          scheduled_for: scheduledForIso,
        })
        .select()
        .single()

      if (insertError) throw insertError
      savedPostId = post.id

      const n8nResponse = await fetch(`${N8N_BASE}/webhook/social-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          clientId,
          content: content.trim(),
          mediaUrl: r2MediaUrl,
          dropboxLinks: dropboxAttachments.map(({ name, link, size }) => ({ name, link, size })),
          platforms: activePlatforms,
          scheduledFor: scheduledForIso,
        }),
      })

      const n8nData = await n8nResponse.json().catch(() => ({}))
      const n8nSuccess = n8nResponse.ok && n8nData?.success !== false

      await supabase
        .from('posts')
        .update({
          status: n8nSuccess ? targetStatus : 'failed',
          n8n_execution_id: n8nData?.zernioPostId ?? null,
          published_at: n8nSuccess && targetStatus === 'published' ? new Date().toISOString() : null,
        })
        .eq('id', post.id)

      if (!n8nSuccess) {
        throw new Error(typeof n8nData?.message === 'string' ? n8nData.message : `${timingMode === 'now' ? 'Publishing' : 'Scheduling'} failed. Please try again.`)
      }

      if (activeDraftId) {
        const currentMeta = parseDraftMeta(activeDraft?.review_notes)
        await updateSocialDraft(activeDraftId, {
          review_state: 'published_manually',
          published_reference: post.id,
          review_notes: stringifyDraftMeta({
            ...currentMeta,
            publishCount: (currentMeta.publishCount || 0) + 1,
            lastPublishedAt: new Date().toISOString(),
          }),
        })
      }

      await queryClient.invalidateQueries({ queryKey: ['calendar-posts', clientId] })
      await queryClient.invalidateQueries({ queryKey: ['social-drafts', clientId] })
      setSubmitState('success')
      setReviewOpen(false)
      setTimeout(() => {
        setContent('')
        setImageFile(null)
        setImagePreview(null)
        setDropboxAttachments([])
        setScheduledFor('')
        setTimingMode('slot')
        setSubmitState('idle')
        setErrorMsg('')
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
      <div className="portal-page mx-auto max-w-[1520px] space-y-6 md:p-6 xl:p-8">
        <section className="portal-surface rounded-[36px] p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-3xl">
              <span className="portal-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                Calendar-driven publishing
              </span>
              <h1 className="portal-page-title mt-3 font-display">Publisher</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                Click a live calendar slot to load an existing draft or create one instantly, then approve platform-specific previews before it schedules.
              </p>
            </div>

            <Link
              to="/post/history"
              className="flex items-center gap-3 rounded-[24px] px-5 py-4 text-left transition-all hover:-translate-y-px"
              style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid var(--portal-border)' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-[14px]"
                style={{ background: 'rgba(26, 24, 20, 0.06)', border: '1px solid var(--portal-border)' }}
              >
                <History className="h-4 w-4" style={{ color: 'var(--portal-text-muted)' }} />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
                  Archive
                </p>
                <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                  Post history
                  <ChevronRight className="h-3 w-3" style={{ color: 'var(--portal-text-muted)' }} />
                </p>
              </div>
            </Link>
          </div>
        </section>

        {(submitState === 'success' || errorMsg || draftError || draftStatus) && (
          <section className="space-y-3">
            {submitState === 'success' && (
              <div className="portal-status-success flex items-center gap-3 rounded-2xl px-5 py-4">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {timingMode === 'now' ? 'Post published successfully' : 'Post scheduled successfully'}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--portal-text-muted)' }}>
                    {timingMode === 'now'
                      ? 'Your post has been sent to the selected platforms.'
                      : 'The scheduled slot is now reserved and ready for publish time.'}
                  </p>
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.95fr)]">
          <div className="space-y-5">
            <section ref={composerRef} className="portal-panel rounded-[34px] p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>
                    Timing
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {timingSummary}
                  </h2>
                </div>
                <div className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: 'rgba(245,240,235,0.9)', color: 'var(--portal-text-soft)' }}>
                  {timingMode === 'now' ? 'Immediate publish' : scheduledFor ? 'Ready to compose' : 'Choose timing'}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={chooseNow}
                  className="rounded-2xl px-4 py-3 text-sm font-semibold"
                  style={timingMode === 'now'
                    ? { background: 'rgba(201,168,76,0.14)', color: 'var(--portal-primary)', border: '1px solid rgba(201,168,76,0.32)' }
                    : { background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                >
                  Post now
                </button>
                <button
                  type="button"
                  onClick={() => chooseCustomTime(selectedDay)}
                  className="rounded-2xl px-4 py-3 text-sm font-semibold"
                  style={timingMode === 'custom'
                    ? { background: 'rgba(201,168,76,0.14)', color: 'var(--portal-primary)', border: '1px solid rgba(201,168,76,0.32)' }
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
                  className="rounded-2xl px-4 py-3 text-sm font-semibold"
                  style={timingMode === 'slot'
                    ? { background: 'rgba(201,168,76,0.14)', color: 'var(--portal-primary)', border: '1px solid rgba(201,168,76,0.32)' }
                    : { background: 'rgba(255,255,255,0.82)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)' }}
                >
                  Calendar slot
                </button>
              </div>

              {timingMode === 'custom' && (
                <div className="mt-4">
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
            </section>

            <section className="portal-panel rounded-[34px] p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>
                    Draft assistant
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {activeDraftId ? 'Draft loaded into the editor' : 'Pick a slot to generate a draft'}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
                    The draft stays platform-neutral first, shows a suggested media concept, and can swap to a different angle without exposing prompts.
                  </p>
                </div>
                <div className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: 'rgba(245,240,235,0.9)', color: draftLoading ? 'var(--portal-primary)' : 'var(--portal-text-soft)' }}>
                  {draftLoading ? 'Generating draft…' : activeDraftId ? 'Draft-backed editor' : 'No draft selected'}
                </div>
              </div>

              <div className="mt-5 rounded-[28px] p-4" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid var(--portal-border)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                  Suggested media
                </p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--portal-text)' }}>
                  {mediaSuggestion || 'Select a recommended or saved draft slot and the media idea will appear here.'}
                </p>
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                  Want a different angle?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
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
                  }) : (
                    <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(255,255,255,0.72)', color: 'var(--portal-text-muted)', border: '1px solid var(--portal-border)' }}>
                      Angle choices will appear after a draft is created.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="portal-panel rounded-[34px] p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>
                    Media
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                    Start with the suggested concept below, then upload a real image or bring one in from Dropbox.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                  style={{ background: 'rgba(201,168,76,0.12)', color: 'var(--portal-primary)' }}
                >
                  <UploadCloud className="h-4 w-4" />
                  Upload from my computer
                </button>
                <button
                  type="button"
                  onClick={handleDropboxAttach}
                  disabled={isSubmitting || dropboxLoading}
                  className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'rgba(26,24,20,0.06)', color: 'var(--portal-text)' }}
                >
                  {dropboxLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  {dropboxLoading ? 'Opening Dropbox…' : 'Choose from Dropbox'}
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-[28px]" style={{ border: '1px solid var(--portal-border)', background: 'rgba(255,255,255,0.78)' }}>
                {mediaPreviewSource ? (
                  <div className="relative">
                    <img src={mediaPreviewSource} alt="Upload preview" className="max-h-[420px] w-full object-cover" />
                    {imagePreview && (
                      <button
                        onClick={removeImage}
                        disabled={isSubmitting}
                        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white"
                        style={{ background: 'rgba(0,0,0,0.58)' }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {!imagePreview && dropboxPreviewSource && (
                      <div
                        className="absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{ background: 'rgba(0,0,0,0.58)', color: '#fff' }}
                      >
                        Dropbox preview
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                    className="flex min-h-[320px] w-full flex-col items-center justify-center gap-4 px-6 py-10 text-center"
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
                        Choose one strong visual from your computer or Dropbox.
                      </p>
                    </div>
                  </button>
                )}
              </div>

              {dropboxAttachments.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--portal-text-soft)' }}>
                    Dropbox assets
                  </p>
                  {dropboxAttachments.map((file) => (
                    <div
                      key={file.link}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: 'rgba(255,255,255,0.86)', border: '1px solid var(--portal-border)' }}
                    >
                      {file.thumbnail ? (
                        <img src={file.thumbnail} alt={file.name} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.18)' }}
                        >
                          <Paperclip className="h-3.5 w-3.5" style={{ color: 'var(--portal-primary)' }} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" style={{ color: 'var(--portal-text)' }}>{file.name}</p>
                        {file.size > 0 && (
                          <p className="mt-0.5 text-[10px]" style={{ color: 'var(--portal-text-soft)' }}>{formatFileSize(file.size)}</p>
                        )}
                      </div>
                      <a href={file.link} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1" style={{ color: 'var(--portal-text-soft)' }}>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                      <button onClick={() => removeDropboxAttachment(file.link)} disabled={isSubmitting} className="shrink-0 p-1" style={{ color: 'var(--portal-text-soft)' }}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </section>

            <section className="portal-panel rounded-[34px] p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>
                    Copy
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
                    The draft caption appears here automatically. You can edit freely and it will save back to the draft.
                  </p>
                </div>
                <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: 'rgba(245,240,235,0.9)', color: charOver ? 'var(--portal-danger)' : 'var(--portal-text-soft)' }}>
                  {content.length}/{charLimit}
                </span>
              </div>

              <textarea
                value={content}
                onChange={(event) => {
                  setContent(event.target.value)
                  setErrorMsg('')
                  if (!hydratingDraftRef.current && activeDraftId) {
                    setDraftDirty(true)
                    setDraftStatus('Saving caption edits…')
                  }
                }}
                placeholder="Select a draft-backed slot to prefill the caption…"
                rows={5}
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
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[34px] p-5 md:p-6" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--portal-border)', boxShadow: 'var(--portal-shadow-soft)' }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-soft)' }}>
                    Calendar planner
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
                    {formatMonthLabel(monthBaseDate)}
                  </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: 'rgba(245,240,235,0.9)', color: 'var(--portal-text-soft)' }}>
                  <Clock3 className="h-3.5 w-3.5" />
                  {timingSummary}
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
                      const counts = {
                        recommended: daySlots.filter((slot) => slot.state === 'recommended_fill').length,
                        planned: daySlots.filter((slot) => slot.state === 'occupied_planned').length,
                        draft: daySlots.filter((slot) => slot.state === 'occupied_draft').length,
                      }
                      const isSelectedDay = selectedDay === day.key

                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => setSelectedDay(day.key)}
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
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[22px] p-4 text-sm" style={{ background: 'rgba(255,255,255,0.74)', color: 'var(--portal-text-muted)' }}>
                        No recommended or saved draft slot on this day. Use `Custom time for this day` if you still want to schedule it here.
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
        imagePreview={imagePreview}
        dropboxAttachments={dropboxAttachments}
        selectedPlatforms={selectedPlatforms}
        setSelectedPlatforms={setSelectedPlatforms}
        previewPlatform={previewPlatform}
        setPreviewPlatform={setPreviewPlatform}
        timingMode={timingMode}
        scheduledFor={scheduledFor}
      />
    </>
  )
}
