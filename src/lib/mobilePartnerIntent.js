const CREATE_POST_PATTERN = /\b(?:create|make|build|write|draft|prepare|generate|put together)\b[\s\S]{0,80}\b(?:social\s+)?post\b/i
const POST_ABOUT_PATTERN = /\b(?:post|caption)\s+(?:about|for|announcing|promoting|showing|featuring)\b/i
const IMAGE_REQUEST_PATTERN = /\b(?:create|make|build|generate|design|include|add|with|use)\b[\s\S]{0,60}\b(?:image|graphic|visual|artwork|picture|photo)\b|\b(?:image|graphic|visual|artwork|picture|photo)\s+(?:to\s+include|for\s+the\s+post)\b/i
const SOCIAL_PHOTO_PATTERN = /\b(?:realistic|natural|lifestyle|photorealistic|photo[- ]style|social\s+photo)\b/i
const INFOGRAPHIC_PATTERN = /\b(?:infographic|tips graphic|steps graphic|how[- ]to graphic|educational graphic)\b/i
const TOPIC_SEEKING_PATTERN = /\bwhat should (?:i|we) post\b|\bwhat to post\b|\bpost about today\b|\banything going on\b|\banything (?:i|we) should post\b|\bin the area\b|\bwhat(?:'s| is) going on\b|\bideas? for (?:a )?post\b|\bwhat(?:'s| is) happening\b/i
const OPTION_PICK_PATTERN = /^(?:let'?s\s+|i(?:'?ll)?\s+|go\s+with\s+|pick\s+|choose\s+|option\s*)?(1|2|3|one|two|three|first|second|third)\b/i

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

export function pickFreshOpportunities(opportunities = [], limit = 3) {
  const now = Date.now()
  const seen = new Set()
  const rows = []
  for (const item of Array.isArray(opportunities) ? opportunities : []) {
    const title = String(item?.title || '').trim()
    if (!title || seen.has(title.toLowerCase())) continue
    if (String(item?.review_state || '') === 'archived') continue
    if (item?.expires_at && Date.parse(item.expires_at) < now) continue
    const suggestions = Array.isArray(item?.client_opportunity_suggestions) ? item.client_opportunity_suggestions : []
    const captionStarter = String(suggestions.find((row) => String(row?.caption_starter || '').trim())?.caption_starter || '').trim()
    seen.add(title.toLowerCase())
    rows.push({
      id: item.id,
      title,
      summary: String(item?.summary || item?.why_it_matters || '').trim(),
      captionStarter,
      opportunityType: String(item?.opportunity_type || ''),
    })
    if (rows.length >= limit) break
  }
  return rows
}

export function formatTopicOptionsMessage(options = []) {
  if (!options.length) {
    return 'I do not have a fresh local event queued. Tell me what is going on this week, or I can draft a simple studio post.'
  }
  const lines = options.map((option, index) => {
    const detail = String(option.summary || '').replace(/\s+/g, ' ').trim().slice(0, 140)
    return detail ? `${index + 1}. ${option.title}\n${detail}` : `${index + 1}. ${option.title}`
  })
  return `Here is what I would post about right now:\n\n${lines.join('\n\n')}\n\nPick one and I will draft it. Or tell me something else that is going on.`
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
