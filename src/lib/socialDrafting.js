const FALLBACK_INDUSTRY = 'small business'

const POST_TYPE_LIBRARY = {
  promotional_offer: {
    subject: 'a timely offer',
    angles: [
      {
        id: 'easy_next_step',
        label: 'Easy next step',
        shortLabel: 'Keep it simple',
        opening: 'If you have been waiting for a good time to jump in, this is a simple place to start.',
        cta: 'Send us a message if you want the details or want help picking the right fit.',
        topics: ['low-pressure first step', 'clear value', 'what happens next'],
        mediaType: 'offer_highlight',
        mediaPrompt: ({ businessName }) => `A bright, welcoming photo setup that highlights ${businessName} in an approachable way with clear signage or class energy in the background.`,
      },
      {
        id: 'limited_window',
        label: 'Limited window',
        shortLabel: 'Highlight urgency',
        opening: 'This is a good week to make your move while the timing still works in your favor.',
        cta: 'Reach out soon if you want us to save you a spot or answer questions.',
        topics: ['deadline awareness', 'near-term availability', 'clear invitation'],
        mediaType: 'calendar_moment',
        mediaPrompt: ({ businessName }) => `A candid planning or front-desk moment at ${businessName} that suggests a limited-time opening without feeling salesy.`,
      },
      {
        id: 'benefit_first',
        label: 'Benefit first',
        shortLabel: 'Lead with benefits',
        opening: 'The best offers are the ones that make getting started feel easier and more useful right away.',
        cta: 'Message us if you want help deciding whether this is the right next step.',
        topics: ['practical benefit', 'confidence to begin', 'supportive guidance'],
        mediaType: 'helpful_demo',
        mediaPrompt: ({ businessName }) => `A warm, real-life image showing how ${businessName} helps people get started with confidence.`,
      },
      {
        id: 'community_invite',
        label: 'Community invite',
        shortLabel: 'Make it welcoming',
        opening: 'Joining is easier when you know you are walking into a supportive room.',
        cta: 'Come talk with us if you want a welcoming place to begin.',
        topics: ['friendly environment', 'belonging', 'encouraging first visit'],
        mediaType: 'welcoming_scene',
        mediaPrompt: ({ businessName }) => `A welcoming group scene at ${businessName} that feels friendly, organized, and easy to join.`,
      },
    ],
  },
  class_spotlight: {
    subject: 'one of this week\'s classes',
    angles: [
      {
        id: 'confidence_building',
        label: 'Confidence building',
        shortLabel: 'Focus on confidence',
        opening: 'One of the best things about class is watching confidence grow a little more each week.',
        cta: 'If you want to see which class could fit you best, send us a message.',
        topics: ['steady progress', 'encouraging instruction', 'comfortable place to improve'],
        mediaType: 'candid_instruction',
        mediaPrompt: ({ businessName }) => `A candid class moment at ${businessName} with an instructor guiding students in a focused, encouraging way.`,
      },
      {
        id: 'skill_progress',
        label: 'Skill progress',
        shortLabel: 'Highlight progress',
        opening: 'Good classes make progress feel clear, manageable, and worth showing up for.',
        cta: 'Reach out if you want help finding the right level or schedule.',
        topics: ['strong fundamentals', 'small wins', 'consistent growth'],
        mediaType: 'technique_focus',
        mediaPrompt: ({ businessName }) => `A sharp rehearsal or technique photo at ${businessName} that shows attention to detail and real progress.`,
      },
      {
        id: 'student_experience',
        label: 'Student experience',
        shortLabel: 'Center the experience',
        opening: 'The right class should feel productive, welcoming, and something you look forward to.',
        cta: 'Message us if you want to learn more about the class experience.',
        topics: ['supportive atmosphere', 'clear structure', 'enjoyable routine'],
        mediaType: 'group_energy',
        mediaPrompt: ({ businessName }) => `A natural group class photo at ${businessName} with students engaged, smiling, and moving together.`,
      },
      {
        id: 'teacher_perspective',
        label: 'Teacher perspective',
        shortLabel: 'Feature instruction',
        opening: 'Strong instruction changes everything, especially when it meets students right where they are.',
        cta: 'Ask us about the class goals and who it is best for.',
        topics: ['thoughtful coaching', 'clear feedback', 'safe learning environment'],
        mediaType: 'teacher_lead',
        mediaPrompt: ({ businessName }) => `An instructor-led moment at ${businessName} showing coaching, eye contact, and a calm sense of leadership.`,
      },
    ],
  },
  community_story: {
    subject: 'a real moment from the community',
    angles: [
      {
        id: 'belonging',
        label: 'Belonging',
        shortLabel: 'Show connection',
        opening: 'A strong community is built from small moments that make people feel seen and included.',
        cta: 'We would love to welcome you in if you want to be part of it.',
        topics: ['shared experience', 'supportive relationships', 'sense of belonging'],
        mediaType: 'community_group',
        mediaPrompt: ({ businessName }) => `A candid group moment at ${businessName} that feels connected, inclusive, and full of genuine interaction.`,
      },
      {
        id: 'behind_the_scenes',
        label: 'Behind the scenes',
        shortLabel: 'Go behind the scenes',
        opening: 'Some of the best stories happen in the moments before or after the spotlight.',
        cta: 'Follow along if you enjoy seeing more of what daily life looks like here.',
        topics: ['preparation', 'small routines', 'human side of the work'],
        mediaType: 'behind_scenes',
        mediaPrompt: ({ businessName }) => `A behind-the-scenes image at ${businessName} showing setup, preparation, or a candid in-between moment.`,
      },
      {
        id: 'shared_pride',
        label: 'Shared pride',
        shortLabel: 'Celebrate the people',
        opening: 'There is something special about seeing people grow together and cheer one another on.',
        cta: 'Send us a message if you want to learn more about being part of this community.',
        topics: ['mutual encouragement', 'progress together', 'positive culture'],
        mediaType: 'celebration_moment',
        mediaPrompt: ({ businessName }) => `A celebratory but natural photo at ${businessName} that captures shared pride without feeling staged.`,
      },
      {
        id: 'everyday_magic',
        label: 'Everyday magic',
        shortLabel: 'Keep it human',
        opening: 'Not every meaningful moment is big or dramatic. Sometimes it is just a really good day together.',
        cta: 'Keep following along for more real moments from the week.',
        topics: ['ordinary joy', 'consistent care', 'day-to-day connection'],
        mediaType: 'day_in_life',
        mediaPrompt: ({ businessName }) => `An everyday candid at ${businessName} that feels human, warm, and lightly documentary.`,
      },
    ],
  },
  testimonial_social_proof: {
    subject: 'proof that the work is helping',
    angles: [
      {
        id: 'results_story',
        label: 'Results story',
        shortLabel: 'Emphasize outcomes',
        opening: 'The most convincing stories are usually the simple ones that show real progress over time.',
        cta: 'If you want similar support, we are happy to help you get started.',
        topics: ['visible results', 'steady improvement', 'earned trust'],
        mediaType: 'happy_client',
        mediaPrompt: ({ businessName }) => `A genuine testimonial-style image at ${businessName} featuring a proud student, family, or client moment.`,
      },
      {
        id: 'trust_builder',
        label: 'Trust builder',
        shortLabel: 'Build trust',
        opening: 'People usually want one thing before they commit: confidence that they will be in good hands.',
        cta: 'Reach out if you want to talk through what support could look like for you.',
        topics: ['credibility', 'care', 'reliable experience'],
        mediaType: 'supportive_portrait',
        mediaPrompt: ({ businessName }) => `A warm portrait or interaction shot at ${businessName} that communicates trust, attentiveness, and professionalism.`,
      },
      {
        id: 'specific_win',
        label: 'Specific win',
        shortLabel: 'Make it concrete',
        opening: 'Sometimes one specific win says more than a long explanation ever could.',
        cta: 'Message us if you want help working toward a win like this yourself.',
        topics: ['clear milestone', 'real-world change', 'measurable improvement'],
        mediaType: 'milestone_moment',
        mediaPrompt: ({ businessName }) => `A photo at ${businessName} that captures a specific win or milestone with natural pride and focus.`,
      },
      {
        id: 'encouraging_quote',
        label: 'Encouraging quote',
        shortLabel: 'Keep it reassuring',
        opening: 'Hearing someone say they feel more capable is always worth paying attention to.',
        cta: 'We are here if you want to ask what the first step would look like.',
        topics: ['confidence gained', 'positive feedback', 'gentle reassurance'],
        mediaType: 'quote_ready_scene',
        mediaPrompt: ({ businessName }) => `A simple, clean image at ${businessName} that could support a short testimonial quote overlay later if needed.`,
      },
    ],
  },
  event_or_performance: {
    subject: 'an upcoming event or performance',
    angles: [
      {
        id: 'invitation',
        label: 'Invitation',
        shortLabel: 'Invite people in',
        opening: 'There is something exciting about having a date on the calendar and a reason to show up together.',
        cta: 'Reach out if you want the details or want to be part of it.',
        topics: ['save the date', 'community attendance', 'clear invitation'],
        mediaType: 'event_energy',
        mediaPrompt: ({ businessName }) => `An energetic rehearsal or event-prep image at ${businessName} that signals anticipation and momentum.`,
      },
      {
        id: 'preparation',
        label: 'Preparation',
        shortLabel: 'Show the work',
        opening: 'Events feel more meaningful when you can see the care and preparation behind them.',
        cta: 'Follow along as everything comes together.',
        topics: ['practice', 'attention to detail', 'building toward a moment'],
        mediaType: 'prep_scene',
        mediaPrompt: ({ businessName }) => `A rehearsal or preparation photo at ${businessName} that shows concentration and teamwork before an event.`,
      },
      {
        id: 'why_it_matters',
        label: 'Why it matters',
        shortLabel: 'Make it meaningful',
        opening: 'What makes an event memorable is not just the date. It is what the experience means to the people in it.',
        cta: 'Send us a message if you want to learn more or be involved.',
        topics: ['purpose', 'shared experience', 'meaningful opportunity'],
        mediaType: 'meaningful_moment',
        mediaPrompt: ({ businessName }) => `A story-driven image at ${businessName} that captures anticipation and purpose around an event.`,
      },
      {
        id: 'spotlight_preview',
        label: 'Spotlight preview',
        shortLabel: 'Build anticipation',
        opening: 'A quick preview can be enough to get people excited about what is coming next.',
        cta: 'Keep an eye out for more updates as the event gets closer.',
        topics: ['preview', 'excitement', 'what to expect'],
        mediaType: 'preview_scene',
        mediaPrompt: ({ businessName }) => `A preview-style image at ${businessName} that hints at a performance or event without giving everything away.`,
      },
    ],
  },
  seasonal_campaign: {
    subject: 'a timely seasonal message',
    angles: [
      {
        id: 'seasonal_relevance',
        label: 'Seasonal relevance',
        shortLabel: 'Tie into the season',
        opening: 'The season shapes what people need, what they notice, and what feels timely right now.',
        cta: 'Reach out if you want help planning around this season.',
        topics: ['timeliness', 'practical relevance', 'helpful reminder'],
        mediaType: 'seasonal_scene',
        mediaPrompt: ({ businessName }) => `A seasonal but tasteful visual idea for ${businessName} that feels current without becoming overly themed.`,
      },
      {
        id: 'fresh_start',
        label: 'Fresh start',
        shortLabel: 'Frame a reset',
        opening: 'A new season can be a useful reset point when people are ready to begin something with intention.',
        cta: 'If this feels like the right time to start, we would love to help.',
        topics: ['renewal', 'starting point', 'forward momentum'],
        mediaType: 'fresh_start_scene',
        mediaPrompt: ({ businessName }) => `A clean, uplifting visual concept for ${businessName} that signals a fresh start and forward motion.`,
      },
      {
        id: 'seasonal_energy',
        label: 'Seasonal energy',
        shortLabel: 'Make it lively',
        opening: 'Certain times of year bring a natural burst of energy, and that momentum is worth using well.',
        cta: 'Stay tuned for more seasonal updates and opportunities.',
        topics: ['momentum', 'participation', 'timely excitement'],
        mediaType: 'energetic_scene',
        mediaPrompt: ({ businessName }) => `A lively seasonal image idea for ${businessName} with movement, color, and a clear sense of current momentum.`,
      },
      {
        id: 'practical_reminder',
        label: 'Practical reminder',
        shortLabel: 'Keep it helpful',
        opening: 'Sometimes the most useful post is the one that simply reminds people what matters right now.',
        cta: 'Message us if you want help making a plan for the season ahead.',
        topics: ['clarity', 'helpful information', 'timely planning'],
        mediaType: 'helpful_notice',
        mediaPrompt: ({ businessName }) => `A practical, informative seasonal setup for ${businessName} that feels clear, calm, and useful.`,
      },
    ],
  },
}

function normalizeText(value) {
  return String(value || '').trim()
}

function hashString(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function pickFromList(items, seed, count = 1) {
  if (!Array.isArray(items) || items.length === 0) return []
  const copy = [...items]
  const picked = []
  let cursor = seed

  while (copy.length > 0 && picked.length < Math.min(count, items.length)) {
    const index = cursor % copy.length
    picked.push(copy.splice(index, 1)[0])
    cursor = Math.floor(cursor / 7) + 3
  }

  return picked
}

function inferIndustry(profile, policy) {
  const explicitIndustry = normalizeText(profile?.clients?.industry || profile?.clients?.business_type)
  if (explicitIndustry) return explicitIndustry

  const businessName = normalizeText(profile?.clients?.business_name).toLowerCase()
  if (businessName.includes('dance')) return 'dance studio'
  if (policy?.plannerClientKey === 'dancescapes') return 'dance studio'
  return FALLBACK_INDUSTRY
}

function buildCaptionTitle(postType, angleLabel) {
  const readablePostType = postType.replace(/_/g, ' ')
  return `${readablePostType} · ${angleLabel}`
}

export function parseDraftMeta(reviewNotes) {
  if (!reviewNotes) return {}

  try {
    const parsed = JSON.parse(reviewNotes)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export function stringifyDraftMeta(meta) {
  return JSON.stringify(meta)
}

function getPostTypeConfig(postType) {
  return POST_TYPE_LIBRARY[postType] || {
    subject: 'a draft post',
    angles: POST_TYPE_LIBRARY.community_story.angles,
  }
}

function buildAngleStats(drafts, postType) {
  const stats = new Map()
  const recent = []

  const sortedDrafts = [...(drafts || [])]
    .filter((draft) => draft.post_type === postType)
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))

  for (const draft of sortedDrafts) {
    const meta = parseDraftMeta(draft.review_notes)
    const angleId = meta.angleId
    if (!angleId) continue

    const current = stats.get(angleId) || { total: 0, published: 0, regenerated: 0, edited: 0 }
    current.total += 1
    current.published += meta.publishCount || (draft.review_state === 'published_manually' ? 1 : 0)
    current.regenerated += meta.regenerationCount || 0
    current.edited += meta.editCount || 0
    stats.set(angleId, current)

    if (recent.length < 3) recent.push(angleId)
  }

  return { stats, recent }
}

function chooseAngle(postType, drafts, preferredAngleId) {
  const config = getPostTypeConfig(postType)
  if (preferredAngleId) {
    return config.angles.find((angle) => angle.id === preferredAngleId) || config.angles[0]
  }

  const { stats, recent } = buildAngleStats(drafts, postType)
  const ranked = config.angles
    .map((angle) => {
      const angleStats = stats.get(angle.id) || { total: 0, published: 0, regenerated: 0, edited: 0 }
      const recentPenalty = recent.includes(angle.id) ? 6 : 0
      const score = (angleStats.published * 4) + angleStats.total - recentPenalty - Math.min(angleStats.regenerated, 3)
      return { angle, score }
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.angle.id.localeCompare(right.angle.id)
    })

  return ranked[0]?.angle || config.angles[0]
}

function buildAngleChoices(postType, selectedAngleId) {
  const config = getPostTypeConfig(postType)
  const selected = config.angles.find((angle) => angle.id === selectedAngleId) || config.angles[0]
  const alternates = config.angles.filter((angle) => angle.id !== selected.id).slice(0, 2)
  return [selected, ...alternates].slice(0, 3)
}

function buildCaption({ businessName, industry, postType, angle, slot }) {
  const config = getPostTypeConfig(postType)
  const seed = hashString(`${businessName}:${slot.slot_date_local}:${slot.slot_label}:${postType}:${angle.id}`)
  const topicPoints = pickFromList(angle.topics, seed, 2)
  const readableWindow = slot.slot_label.replace(/_/g, ' ')
  const subject = config.subject
  const supportSentence = `At ${businessName}, ${subject} can be a useful way to highlight ${topicPoints.join(' and ')} in a clear, low-pressure way.`
  const timingSentence = slot.slot_weekday
    ? `It fits well for ${slot.slot_weekday}'s ${readableWindow} slot and keeps the message focused on what matters most right now for your ${industry}.`
    : ''

  return [angle.opening, supportSentence, timingSentence, angle.cta]
    .filter(Boolean)
    .join(' ')
}

function buildDraftBody({ businessName, postType, angle, mediaSuggestion }) {
  return [
    `Post type: ${postType.replace(/_/g, ' ')}`,
    `Angle: ${angle.label}`,
    `Business: ${businessName}`,
    `Media idea: ${mediaSuggestion}`,
  ].join('\n')
}

function buildMediaSuggestion({ businessName, angle }) {
  return angle.mediaPrompt({ businessName })
}

function buildAssetRequirements({ mediaSuggestion, mediaType }) {
  return [
    {
      type: 'media_concept',
      mediaIdeaType: mediaType,
      suggestion: mediaSuggestion,
    },
    {
      type: 'media_action',
      options: ['generate_image', 'upload_photo'],
    },
  ]
}

export function generateDraftForSlot({ profile, policy, slot, drafts, preferredAngleId }) {
  const businessName = normalizeText(profile?.clients?.business_name) || 'Your business'
  const industry = inferIndustry(profile, policy)
  const angle = chooseAngle(slot.post_type, drafts, preferredAngleId)
  const mediaSuggestion = buildMediaSuggestion({ businessName, angle })
  const caption = buildCaption({
    businessName,
    industry,
    postType: slot.post_type,
    angle,
    slot,
  })
  const title = buildCaptionTitle(slot.post_type, angle.label)
  const angleChoices = buildAngleChoices(slot.post_type, angle.id)

  return {
    title,
    caption,
    mediaSuggestion,
    mediaIdeaType: angle.mediaType,
    angle,
    angleChoices,
    draftBody: buildDraftBody({
      businessName,
      postType: slot.post_type,
      angle,
      mediaSuggestion,
    }),
    assetRequirements: buildAssetRequirements({
      mediaSuggestion,
      mediaType: angle.mediaType,
    }),
    meta: {
      version: 1,
      angleId: angle.id,
      angleLabel: angle.label,
      mediaIdeaType: angle.mediaType,
      mediaSuggestion,
      angleChoices: angleChoices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        shortLabel: choice.shortLabel,
      })),
    },
  }
}

export function extractMediaSuggestion(draft) {
  const meta = parseDraftMeta(draft?.review_notes)
  if (typeof meta.mediaSuggestion === 'string' && meta.mediaSuggestion.trim()) {
    return meta.mediaSuggestion.trim()
  }

  const mediaRequirement = Array.isArray(draft?.asset_requirements_json)
    ? draft.asset_requirements_json.find((item) => item?.type === 'media_concept' && item?.suggestion)
    : null

  return mediaRequirement?.suggestion || ''
}

export function extractAngleChoices(draft) {
  const meta = parseDraftMeta(draft?.review_notes)
  if (Array.isArray(meta.angleChoices) && meta.angleChoices.length > 0) {
    return meta.angleChoices
  }

  const selectedAngleId = typeof meta.angleId === 'string' ? meta.angleId : null
  return buildAngleChoices(draft?.post_type || 'community_story', selectedAngleId).map((choice) => ({
    id: choice.id,
    label: choice.label,
    shortLabel: choice.shortLabel,
  }))
}

export function getDraftAngleId(draft) {
  const meta = parseDraftMeta(draft?.review_notes)
  return typeof meta.angleId === 'string' ? meta.angleId : ''
}
