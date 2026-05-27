const PARTNER_HELP_OPTIONS = [
  {
    id: 'create_post',
    label: 'Create a new post',
    description: 'Start a fresh Publisher draft.',
  },
  {
    id: 'review_drafts',
    label: 'Review drafts',
    description: 'Open the next draft waiting for review.',
  },
  {
    id: 'scheduled_posts',
    label: 'See scheduled posts',
    description: 'Check what is already planned.',
  },
  {
    id: 'ask_partner',
    label: 'Ask My Partner',
    description: 'Open a guided help chat.',
  },
]

const CLOSED_DRAFT_STATES = new Set(['published', 'published_manually', 'archived', 'superseded'])

function parseDraftTimestamp(value) {
  const time = Date.parse(value || '')
  return Number.isFinite(time) ? time : 0
}

function getDraftScheduledTime(draft) {
  const scheduledTime = parseDraftTimestamp(draft?.scheduled_for)
  if (scheduledTime) return scheduledTime
  return parseDraftTimestamp(draft?.slot_date_local ? `${draft.slot_date_local}T23:59:59` : '')
}

function getDraftTouchedTime(draft) {
  return parseDraftTimestamp(draft?.updated_at) || parseDraftTimestamp(draft?.created_at)
}

export function getOpenReviewDrafts(drafts = [], options = {}) {
  const nowTime = options.now ? new Date(options.now).getTime() : Date.now()

  return (drafts || [])
    .filter((draft) => draft?.id && !CLOSED_DRAFT_STATES.has(String(draft.review_state || '').toLowerCase()))
    .map((draft) => ({
      draft,
      scheduledTime: getDraftScheduledTime(draft),
      touchedTime: getDraftTouchedTime(draft),
    }))
    .sort((left, right) => {
      const leftUpcoming = left.scheduledTime >= nowTime
      const rightUpcoming = right.scheduledTime >= nowTime
      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1
      if (leftUpcoming && rightUpcoming && left.scheduledTime !== right.scheduledTime) {
        return left.scheduledTime - right.scheduledTime
      }
      if (left.touchedTime !== right.touchedTime) return right.touchedTime - left.touchedTime
      return String(left.draft.id).localeCompare(String(right.draft.id))
    })
    .map((entry) => entry.draft)
}

export function selectNextReviewDraft(drafts = [], options = {}) {
  return getOpenReviewDrafts(drafts, options)[0] || null
}

export function getPartnerHelpOptions() {
  return PARTNER_HELP_OPTIONS.map((option) => ({ ...option }))
}

export function resolvePartnerHelpHref(optionId, context = {}) {
  if (optionId === 'create_post') return '/post'
  if (optionId === 'scheduled_posts') return '/post/scheduled'
  if (optionId === 'review_drafts') {
    const draftId = context.firstDraftId || selectNextReviewDraft(context.drafts)?.id
    return draftId ? `/post?draftId=${encodeURIComponent(draftId)}` : '/calendar'
  }
  return ''
}
