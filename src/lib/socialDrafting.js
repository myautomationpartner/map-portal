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
  signature_highlight: {
    subject: 'a signature offer or standout experience',
    angles: [
      {
        id: 'signature_value',
        label: 'Signature value',
        shortLabel: 'Highlight the signature',
        opening: 'One of the easiest ways to understand what makes this business special is to start with the thing people remember most.',
        cta: 'Send us a message if you want help choosing the best place to start.',
        topics: ['standout experience', 'best-known offering', 'why people come back'],
        mediaType: 'signature_highlight',
        mediaPrompt: ({ businessName }) => `A polished but real image that highlights the signature experience or best-known offering from ${businessName}.`,
      },
      {
        id: 'outcome_first',
        label: 'Outcome first',
        shortLabel: 'Lead with the result',
        opening: 'People respond quickly when they can picture the result before they even ask a question.',
        cta: 'Reach out if you want help deciding whether this is the right fit for you.',
        topics: ['clear outcome', 'customer benefit', 'practical result'],
        mediaType: 'outcome_scene',
        mediaPrompt: ({ businessName }) => `A results-focused image from ${businessName} that makes the end benefit feel obvious and desirable.`,
      },
      {
        id: 'best_seller',
        label: 'Best seller',
        shortLabel: 'Feature a favorite',
        opening: 'Sometimes the simplest post is just showing the thing customers already love and explaining why.',
        cta: 'Ask us if you want the quick version of what makes this a favorite.',
        topics: ['customer favorite', 'easy introduction', 'strong first impression'],
        mediaType: 'best_seller',
        mediaPrompt: ({ businessName }) => `A strong hero image from ${businessName} featuring a customer favorite, signature service, or flagship offering.`,
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
  student_spotlight: {
    subject: 'a student story worth celebrating',
    angles: [
      {
        id: 'small_win',
        label: 'Small win',
        shortLabel: 'Celebrate progress',
        opening: 'Sometimes the best post is a simple moment that shows real progress happening right in front of you.',
        cta: 'Message us if you want to find the right class for this kind of growth.',
        topics: ['earned progress', 'visible confidence', 'consistent support'],
        mediaType: 'student_highlight',
        mediaPrompt: ({ businessName }) => `A genuine student moment at ${businessName} that captures progress, focus, and pride without feeling staged.`,
      },
      {
        id: 'confidence_bloom',
        label: 'Confidence bloom',
        shortLabel: 'Show confidence',
        opening: 'Confidence usually grows little by little, and those moments deserve to be noticed.',
        cta: 'Reach out if you want a supportive place to build confidence too.',
        topics: ['growing confidence', 'encouraging instruction', 'steady wins'],
        mediaType: 'confident_student',
        mediaPrompt: ({ businessName }) => `A bright student-focused image at ${businessName} that feels confident, natural, and encouraging.`,
      },
      {
        id: 'family_pride',
        label: 'Family pride',
        shortLabel: 'Include the families',
        opening: 'One of the most rewarding parts of growth is seeing the pride it creates for everyone around it.',
        cta: 'Ask us how we help students and families feel part of the journey.',
        topics: ['support system', 'shared pride', 'meaningful progress'],
        mediaType: 'family_pride_scene',
        mediaPrompt: ({ businessName }) => `A warm parent-and-student or post-class moment at ${businessName} that communicates pride and support.`,
      },
      {
        id: 'spotlight_moment',
        label: 'Spotlight moment',
        shortLabel: 'Make it special',
        opening: 'A quick spotlight can turn an ordinary week into a moment someone remembers for a long time.',
        cta: 'Follow along for more student highlights from the studio.',
        topics: ['recognition', 'encouragement', 'studio culture'],
        mediaType: 'spotlight_ready',
        mediaPrompt: ({ businessName }) => `A clean, spotlight-ready student image at ${businessName} with strong energy and a clear focal subject.`,
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
  teacher_tip: {
    subject: 'a helpful tip from the teaching team',
    angles: [
      {
        id: 'quick_tip',
        label: 'Quick tip',
        shortLabel: 'Share a tip',
        opening: 'A short, practical tip can go a long way when it helps someone feel more confident before they walk in the door.',
        cta: 'Send us a message if you want more guidance for getting started.',
        topics: ['practical advice', 'simple next step', 'confidence boost'],
        mediaType: 'teacher_tip_scene',
        mediaPrompt: ({ businessName }) => `An instructor-led image at ${businessName} that feels helpful, approachable, and ready for a tip-style caption.`,
      },
      {
        id: 'myth_buster',
        label: 'Myth buster',
        shortLabel: 'Clear things up',
        opening: 'A lot of hesitation comes from assumptions, and sometimes one clear reminder makes things feel much easier.',
        cta: 'Reach out if you want help figuring out what actually fits best.',
        topics: ['clarity', 'lower pressure', 'helpful correction'],
        mediaType: 'clarity_scene',
        mediaPrompt: ({ businessName }) => `A calm, instructional moment at ${businessName} that supports a reassuring myth-busting or FAQ style post.`,
      },
      {
        id: 'practice_cue',
        label: 'Practice cue',
        shortLabel: 'Make it useful',
        opening: 'The most useful advice is the kind people can actually remember and use right away.',
        cta: 'Follow along for more simple teaching cues from the week.',
        topics: ['rememberable advice', 'simple technique', 'teaching value'],
        mediaType: 'practice_detail',
        mediaPrompt: ({ businessName }) => `A close-up or technique-focused image at ${businessName} that pairs well with a simple coaching cue.`,
      },
      {
        id: 'coach_voice',
        label: 'Coach voice',
        shortLabel: 'Feature the teacher',
        opening: 'Strong teaching is often about saying the right thing in the right moment and helping people trust the process.',
        cta: 'Ask us what a great first class experience looks like here.',
        topics: ['teacher perspective', 'supportive coaching', 'clear instruction'],
        mediaType: 'coach_moment',
        mediaPrompt: ({ businessName }) => `An expressive teacher moment at ${businessName} with clear eye contact, leadership, and warmth.`,
      },
    ],
  },
  expert_tip: {
    subject: 'a helpful expert tip',
    angles: [
      {
        id: 'quick_win_tip',
        label: 'Quick win',
        shortLabel: 'Share a quick win',
        opening: 'A useful tip earns attention fast when it helps someone avoid a mistake or feel more confident right away.',
        cta: 'Follow along for more practical advice like this.',
        topics: ['simple improvement', 'avoidable mistake', 'easy confidence boost'],
        mediaType: 'expert_tip_scene',
        mediaPrompt: ({ businessName }) => `An approachable expert-led image from ${businessName} that fits a clear, practical tip-style post.`,
      },
      {
        id: 'faq_answer',
        label: 'FAQ answer',
        shortLabel: 'Answer a common question',
        opening: 'A lot of hesitation disappears when you answer the question people keep wondering about but do not always ask.',
        cta: 'Message us if you want the fuller answer for your situation.',
        topics: ['common question', 'clear explanation', 'trust through clarity'],
        mediaType: 'faq_answer',
        mediaPrompt: ({ businessName }) => `A calm and credible image from ${businessName} that supports an FAQ or myth-busting caption.`,
      },
      {
        id: 'pro_perspective',
        label: 'Pro perspective',
        shortLabel: 'Use expert perspective',
        opening: 'Sometimes what helps most is hearing how a pro thinks about the situation and what they notice first.',
        cta: 'Reach out if you want help applying this to your own situation.',
        topics: ['expert point of view', 'smart next step', 'what to watch for'],
        mediaType: 'expert_perspective',
        mediaPrompt: ({ businessName }) => `A professional, trustworthy image from ${businessName} that feels credible, modern, and human.`,
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
  behind_the_scenes: {
    subject: 'what the week looks like behind the scenes',
    angles: [
      {
        id: 'setup_story',
        label: 'Setup story',
        shortLabel: 'Show the prep',
        opening: 'A lot of care happens before the class, performance, or milestone that everyone else gets to see.',
        cta: 'Follow along if you enjoy seeing how the week comes together.',
        topics: ['preparation', 'care behind the work', 'studio rhythm'],
        mediaType: 'prep_detail',
        mediaPrompt: ({ businessName }) => `A behind-the-scenes prep image at ${businessName} that shows setup, organization, and quiet care.`,
      },
      {
        id: 'rehearsal_detail',
        label: 'Rehearsal detail',
        shortLabel: 'Catch the process',
        opening: 'The process is often just as meaningful as the finished result, especially when you get close enough to notice it.',
        cta: 'Keep following for more real moments from rehearsal and class life.',
        topics: ['process', 'discipline', 'in-between moments'],
        mediaType: 'process_scene',
        mediaPrompt: ({ businessName }) => `A rehearsal-detail photo at ${businessName} showing concentration, movement, and in-progress work.`,
      },
      {
        id: 'studio_life',
        label: 'Studio life',
        shortLabel: 'Show daily life',
        opening: 'The everyday rhythm of a studio tells people a lot about what it feels like to spend time there.',
        cta: 'Message us if you want to learn more about what weekly studio life looks like.',
        topics: ['daily routine', 'studio atmosphere', 'real environment'],
        mediaType: 'day_in_studio',
        mediaPrompt: ({ businessName }) => `An everyday studio-life image at ${businessName} that feels candid, welcoming, and lightly documentary.`,
      },
      {
        id: 'quiet_moment',
        label: 'Quiet moment',
        shortLabel: 'Keep it intimate',
        opening: 'Not every strong post needs a big performance moment. Sometimes a quieter detail says more.',
        cta: 'Stay tuned for more behind-the-scenes moments from the week.',
        topics: ['quiet confidence', 'attention to detail', 'authenticity'],
        mediaType: 'quiet_detail',
        mediaPrompt: ({ businessName }) => `A quiet, intimate image at ${businessName} that captures texture, detail, and a sense of care.`,
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
  milestone_moment: {
    subject: 'a win worth marking',
    angles: [
      {
        id: 'big_win',
        label: 'Big win',
        shortLabel: 'Celebrate a win',
        opening: 'Some milestones deserve a little extra attention because they reflect real work, growth, and commitment.',
        cta: 'We would love to help you work toward your own next milestone too.',
        topics: ['earned achievement', 'progress worth sharing', 'real accomplishment'],
        mediaType: 'milestone_highlight',
        mediaPrompt: ({ businessName }) => `A milestone-focused photo at ${businessName} that feels proud, polished, and genuinely celebratory.`,
      },
      {
        id: 'growth_marker',
        label: 'Growth marker',
        shortLabel: 'Show the journey',
        opening: 'A milestone means more when people can feel the growth behind it, not just the headline itself.',
        cta: 'Message us if you want support building toward something meaningful.',
        topics: ['journey', 'visible growth', 'steady effort'],
        mediaType: 'growth_story',
        mediaPrompt: ({ businessName }) => `A story-driven image at ${businessName} that suggests progress, effort, and a meaningful growth marker.`,
      },
      {
        id: 'shared_celebration',
        label: 'Shared celebration',
        shortLabel: 'Celebrate together',
        opening: 'Wins feel even better when they are shared with the people who helped make them possible.',
        cta: 'Follow along for more celebrations from the studio community.',
        topics: ['shared joy', 'community support', 'positive momentum'],
        mediaType: 'group_celebration',
        mediaPrompt: ({ businessName }) => `A natural celebration image at ${businessName} with supportive energy and genuine group pride.`,
      },
      {
        id: 'next_chapter',
        label: 'Next chapter',
        shortLabel: 'Point forward',
        opening: 'A milestone is exciting because it also points to what comes next.',
        cta: 'Reach out if you want to take your own next step with us.',
        topics: ['forward motion', 'new chapter', 'future possibility'],
        mediaType: 'forward_looking',
        mediaPrompt: ({ businessName }) => `An uplifting image at ${businessName} that communicates achievement and a sense of what comes next.`,
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
  const embeddedPlannerProfile = Array.isArray(profile?.clients?.client_planner_profiles)
    ? profile.clients.client_planner_profiles[0]
    : profile?.clients?.client_planner_profiles
  const explicitIndustry = normalizeText(
    embeddedPlannerProfile?.business_type ||
    profile?.clients?.industry ||
    profile?.clients?.business_type,
  )
  if (explicitIndustry) return explicitIndustry

  const businessName = normalizeText(profile?.clients?.business_name).toLowerCase()
  if (businessName.includes('dance')) return 'dance studio'
  if (policy?.plannerClientKey === 'dancescapes') return 'dance studio'
  return FALLBACK_INDUSTRY
}

function getEmbeddedPlannerProfile(profile) {
  return Array.isArray(profile?.clients?.client_planner_profiles)
    ? profile.clients.client_planner_profiles[0] || null
    : profile?.clients?.client_planner_profiles || null
}

function getLearningState(profile) {
  const plannerProfile = getEmbeddedPlannerProfile(profile)
  return plannerProfile?.learning_state_json && typeof plannerProfile.learning_state_json === 'object'
    ? plannerProfile.learning_state_json
    : {}
}

function getPlannerVoiceTraits(profile) {
  const plannerProfile = getEmbeddedPlannerProfile(profile)
  const voiceTraits = plannerProfile?.profile_json?.voice_traits
  return Array.isArray(voiceTraits) ? voiceTraits.filter(Boolean) : []
}

function getPlannerVariationSeed(profile) {
  const plannerProfile = getEmbeddedPlannerProfile(profile)
  return Number.isInteger(plannerProfile?.variation_seed) ? plannerProfile.variation_seed : 0
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

function mergeLearningStats(profile, postType, stats) {
  const learningState = getLearningState(profile)
  const angleScores = learningState?.angle_scores?.[postType]

  if (!angleScores || typeof angleScores !== 'object') {
    return stats
  }

  const merged = new Map(stats)

  for (const [angleId, value] of Object.entries(angleScores)) {
    if (!value || typeof value !== 'object') continue
    const current = merged.get(angleId) || { total: 0, published: 0, regenerated: 0, edited: 0, deleted: 0, learnedScore: 0 }
    current.deleted += Number(value.deleted || 0)
    current.learnedScore += Number(value.score || 0)
    merged.set(angleId, current)
  }

  return merged
}

function chooseAngle(profile, postType, drafts, preferredAngleId) {
  const config = getPostTypeConfig(postType)
  if (preferredAngleId) {
    return config.angles.find((angle) => angle.id === preferredAngleId) || config.angles[0]
  }

  const { stats, recent } = buildAngleStats(drafts, postType)
  const mergedStats = mergeLearningStats(profile, postType, stats)
  const ranked = config.angles
    .map((angle) => {
      const angleStats = mergedStats.get(angle.id) || { total: 0, published: 0, regenerated: 0, edited: 0, deleted: 0, learnedScore: 0 }
      const recentPenalty = recent.includes(angle.id) ? 6 : 0
      const score = (
        (angleStats.published * 4)
        + angleStats.total
        + (angleStats.learnedScore || 0)
        - (angleStats.deleted || 0) * 3
        - recentPenalty
        - Math.min(angleStats.regenerated, 3)
      )
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
  const seed = hashString(`${businessName}:${slot.slot_date_local}:${slot.slot_label}:${postType}:${angle.id}`)
  const topicPoint = pickFromList(angle.topics, seed, 1)[0] || industry
  const opening = angle.opening
    .replace(/^At\s+[^,]+,\s*/i, '')
    .trim()

  const supportByPostType = {
    promotional_offer: `A simple next step with ${topicPoint}.`,
    signature_highlight: `A standout highlight built around ${topicPoint}.`,
    class_spotlight: `A class built around ${topicPoint}.`,
    student_spotlight: `A student story shaped by ${topicPoint}.`,
    community_story: `A moment that reflects ${topicPoint}.`,
    teacher_tip: `A helpful reminder focused on ${topicPoint}.`,
    expert_tip: `A clear expert tip centered on ${topicPoint}.`,
    testimonial_social_proof: `A real example of ${topicPoint}.`,
    behind_the_scenes: `A behind-the-scenes moment centered on ${topicPoint}.`,
    event_or_performance: `A good time to highlight ${topicPoint}.`,
    milestone_moment: `A milestone that reflects ${topicPoint}.`,
    seasonal_campaign: `A timely reminder around ${topicPoint}.`,
  }

  const supportSentence = supportByPostType[postType] || `A quick post focused on ${topicPoint}.`
  const voiceTraits = getPlannerVoiceTraits(slot.profile)
  const variationSeed = getPlannerVariationSeed(slot.profile)
  const voicePrompt = pickFromList(voiceTraits, seed + variationSeed, 1)[0] || ''
  const voiceSentence = voicePrompt
    ? `Keep the tone ${voicePrompt.replace(/-/g, ' ')} and grounded in what people would actually want to hear right now.`
    : ''

  const shortCta = angle.cta
    .replace(/^If you want to /i, '')
    .replace(/^Reach out if you want to /i, '')
    .replace(/^Reach out soon if you want us to /i, '')
    .replace(/^Message us if you want to /i, '')
    .replace(/^Send us a message if you want /i, '')
    .replace(/^Ask us about /i, 'Ask about ')
    .replace(/^Come talk with us if you want /i, '')
    .replace(/^Keep following along /i, 'Follow along ')
    .replace(/^Keep an eye out /i, 'Watch for ')
    .trim()

  return [opening, supportSentence, shortCta]
    .concat(voiceSentence ? [voiceSentence] : [])
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
  const angle = chooseAngle(profile, slot.post_type, drafts, preferredAngleId)
  const mediaSuggestion = buildMediaSuggestion({ businessName, angle })
  const caption = buildCaption({
    businessName,
    industry,
    postType: slot.post_type,
    angle,
    slot: {
      ...slot,
      profile,
    },
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
