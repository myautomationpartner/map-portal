const CREATE_POST_PATTERN = /\b(?:create|make|build|write|draft|prepare|generate|put together)\b[\s\S]{0,80}\b(?:social\s+)?post\b/i
const POST_ABOUT_PATTERN = /\b(?:post|caption)\s+(?:about|for|announcing|promoting|showing|featuring)\b/i
const IMAGE_REQUEST_PATTERN = /\b(?:create|make|build|generate|design|include|add|with|use)\b[\s\S]{0,60}\b(?:image|graphic|visual|artwork|picture|photo)\b|\b(?:image|graphic|visual|artwork|picture|photo)\s+(?:to\s+include|for\s+the\s+post)\b/i
const SOCIAL_PHOTO_PATTERN = /\b(?:realistic|natural|lifestyle|photorealistic|photo[- ]style|social\s+photo)\b/i
const INFOGRAPHIC_PATTERN = /\b(?:infographic|tips graphic|steps graphic|how[- ]to graphic|educational graphic)\b/i
const TOPIC_SEEKING_PATTERN = /\bwhat should (?:i|we|be)? ?post\b|\bwhat should (?:i|we) post\b|\bwhat to post\b|\bpost about today\b|\banything going on\b|\banything (?:i|we) should post\b|\bin the area\b|\bwhat(?:'s| is) going on\b|\bideas? for (?:a )?post\b|\bwhat(?:'s| is) happening\b|\bpromote (?:the )?(?:studio|business)\b/i
const OPTION_PICK_PATTERN = /^(?:let'?s\s+|i(?:'?ll)?\s+|go\s+with\s+|pick\s+|choose\s+|option\s*)?(1|2|3|one|two|three|first|second|third)\b/i
const MONTH_NAMES = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
}
const MONTH_PATTERN = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec'
const DATED_HOOK_PATTERN = new RegExp(
  `\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:[-–—]|to)\\s*(?:(${MONTH_PATTERN})\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?)?\\b`,
  'gi',
)
const TYPE_RANK = {
  seasonal_moment: 0,
  local_event: 1,
  customer_prompt: 2,
}

export function isTopicSeekingRequest(request) {
  const text = String(request || '').trim()
  if (!text) return false
  return TOPIC_SEEKING_PATTERN.test(text)
}

export function isExplicitNewPostRequest(request) {
  const text = String(request || '').trim()
  if (!text) return false
  if (isTopicSeekingRequest(text)) return false
  return CREATE_POST_PATTERN.test(text) || POST_ABOUT_PATTERN.test(text)
}

export function wantsGeneratedPostImage(request) {
  return IMAGE_REQUEST_PATTERN.test(String(request || ''))
}

export function resolveGeneratedPostImageMode(request) {
  const text = String(request || '')
  if (INFOGRAPHIC_PATTERN.test(text)) return 'infographic'
  if (SOCIAL_PHOTO_PATTERN.test(text)) return 'social_photo'
  return 'branded_post'
}

function firstSentence(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const match = cleaned.match(/^(.+?[.!?])(\s|$)/)
  if (!match) return cleaned
  const sentence = match[1].trim()
  const wordCount = sentence.split(/\s+/).filter(Boolean).length
  if (wordCount < 3 && cleaned.length > sentence.length + 8) return cleaned
  return sentence
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isStaleDatedHook(text, now) {
  const haystack = String(text || '')
  if (!haystack) return false
  const today = startOfLocalDay(now)
  const year = today.getFullYear()
  DATED_HOOK_PATTERN.lastIndex = 0
  let match
  while ((match = DATED_HOOK_PATTERN.exec(haystack)) !== null) {
    const startMonth = MONTH_NAMES[String(match[1] || '').toLowerCase()]
    const startDay = Number(match[2])
    const endMonthName = match[3]
    const endDayRaw = match[4]
    const endMonth = endMonthName ? MONTH_NAMES[String(endMonthName).toLowerCase()] : startMonth
    const endDay = endDayRaw ? Number(endDayRaw) : startDay
    if (!Number.isInteger(startMonth) || !Number.isInteger(endMonth) || !endDay) continue
    const end = new Date(year, endMonth, endDay)
    const daysBefore = Math.round((today.getTime() - startOfLocalDay(end).getTime()) / 86400000)
    if (daysBefore > 2) return true
  }
  return false
}

function opportunityRunId(item) {
  return String(item?.research_run_id || item?.researchRunId || '').trim()
}

function opportunityCreatedAt(item) {
  const parsed = Date.parse(item?.created_at || item?.createdAt || '')
  return Number.isFinite(parsed) ? parsed : 0
}

export function pickFreshOpportunities(opportunities = [], limit = 3, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now)
  const nowMs = current.getTime()
  const input = Array.isArray(opportunities) ? opportunities : []
  const eligible = []

  input.forEach((item, index) => {
    const title = String(item?.title || '').trim()
    if (!title) return
    if (String(item?.review_state || '') === 'archived') return
    if (item?.expires_at && Date.parse(item.expires_at) < nowMs) return
    if (String(item?.opportunity_type || '') === 'competitor_gap') return
    const summary = String(item?.summary || item?.why_it_matters || '').trim()
    if (isStaleDatedHook(`${title} ${summary}`, current)) return
    const suggestions = Array.isArray(item?.client_opportunity_suggestions) ? item.client_opportunity_suggestions : []
    const captionStarter = String(suggestions.find((row) => String(row?.caption_starter || '').trim())?.caption_starter || '').trim()
    eligible.push({
      item,
      index,
      title,
      summary,
      captionStarter,
      opportunityType: String(item?.opportunity_type || ''),
      researchRunId: opportunityRunId(item),
      createdAt: opportunityCreatedAt(item),
    })
  })

  let remaining = eligible
  const runRows = remaining.filter((row) => row.researchRunId)
  if (runRows.length) {
    let newest = runRows[0]
    for (const row of runRows) {
      if (row.createdAt > newest.createdAt || (row.createdAt === newest.createdAt && row.index < newest.index)) {
        newest = row
      }
    }
    remaining = remaining.filter((row) => row.researchRunId === newest.researchRunId)
  }

  remaining.sort((a, b) => {
    const typeDelta = (TYPE_RANK[a.opportunityType] ?? 99) - (TYPE_RANK[b.opportunityType] ?? 99)
    if (typeDelta) return typeDelta
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt
    return a.index - b.index
  })

  const seen = new Set()
  const rows = []
  for (const row of remaining) {
    const key = row.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      id: row.item.id,
      title: row.title,
      summary: row.summary,
      captionStarter: row.captionStarter,
      opportunityType: row.opportunityType,
      researchRunId: row.researchRunId,
    })
    if (rows.length >= limit) break
  }
  return rows
}

function topicReplyCloser(count) {
  if (count <= 1) {
    return 'Which one should I draft? Reply 1, or tell me something else that is going on.'
  }
  if (count === 2) {
    return 'Which one should I draft? Reply 1 or 2, or tell me something else that is going on.'
  }
  return 'Which one should I draft? Reply 1, 2, or 3, or tell me something else that is going on.'
}

export function formatTopicOptionsMessage(options = []) {
  if (!options.length) {
    return 'I looked around this week and do not have a fresh local hook yet. Tell me what is going on, or I can draft a simple studio post.'
  }
  const lines = options.map((option, index) => {
    const detail = firstSentence(option.summary)
    return detail ? `${index + 1}. ${option.title}\n${detail}` : `${index + 1}. ${option.title}`
  })
  return `I looked at this week.\n\n${lines.join('\n\n')}\n\n${topicReplyCloser(options.length)}`
}

export function matchTopicOption(request, options = []) {
  const text = String(request || '').trim()
  if (!text || !options.length) return null
  const numbered = text.match(OPTION_PICK_PATTERN)
  if (numbered) {
    const token = numbered[1].toLowerCase()
    const index = { '1': 0, one: 0, first: 0, '2': 1, two: 1, second: 1, '3': 2, three: 2, third: 2 }[token]
    if (Number.isInteger(index) && options[index]) return options[index]
  }
  const haystack = text.toLowerCase()
  return options.find((option) => {
    const title = String(option.title || '').toLowerCase()
    const words = title.split(/\W+/).filter((word) => word.length > 5)
    return (title.length > 8 && haystack.includes(title.slice(0, 18))) || words.some((word) => haystack.includes(word))
  }) || null
}

export function buildTopicDraftPrompt(option) {
  const title = String(option?.title || '').trim()
  const summary = String(option?.summary || '').trim()
  const starter = String(option?.captionStarter || '').trim()
  return [
    `Draft a short social post about: ${title}.`,
    summary ? `Context: ${summary}` : '',
    starter ? `Caption starter, rewrite in the owner voice: ${starter}` : '',
    'Keep it 1-3 sentences. No LLC or legal-entity names. Nothing publishes until they review.',
  ].filter(Boolean).join(' ')
}
