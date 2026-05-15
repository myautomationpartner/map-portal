const BOOSTABLE_PLATFORM_PRIORITY = ['instagram', 'facebook', 'tiktok', 'linkedin', 'twitter']

function cleanText(value) {
  return String(value || '').trim()
}

function includesAny(text, patterns) {
  const value = cleanText(text).toLowerCase()
  return patterns.some((pattern) => value.includes(pattern))
}

function hasLinkOrTrafficCta(item) {
  const text = `${item?.caption || ''} ${item?.title || ''}`
  return /https?:\/\//i.test(text) || includesAny(text, [
    'book ',
    'schedule',
    'register',
    'sign up',
    'learn more',
    'visit ',
    'click',
    'shop',
    'order',
    'apply',
  ])
}

function isVideoPost(item) {
  const mediaText = `${item?.mediaType || ''} ${item?.thumbnailUrl || ''} ${item?.post?.media_url || ''}`.toLowerCase()
  return mediaText.includes('video') || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(mediaText)
}

function isLocalAwarenessPost(item) {
  const text = `${item?.caption || ''} ${item?.whyNow || ''} ${item?.title || ''}`
  return includesAny(text, [
    'local',
    'nearby',
    'in the area',
    'service area',
    'visit',
    'community',
    'town',
    'city',
    'county',
  ])
}

function pickPlatform(platforms = [], defaultPlatform = '') {
  const available = new Set(Array.isArray(platforms) ? platforms : [])
  if (defaultPlatform && available.has(defaultPlatform)) return defaultPlatform
  return BOOSTABLE_PLATFORM_PRIORITY.find((platform) => available.has(platform)) || [...available][0] || 'facebook'
}

export function recommendBoostSetup({ item, defaultPlatform = '' } = {}) {
  const platform = pickPlatform(item?.platforms, defaultPlatform)
  const base = {
    platform,
    goal: 'engagement',
    budgetAmount: '8',
    budgetType: 'daily',
    durationDays: 3,
    reason: 'This is a safe starter boost for a published post. It keeps spend low while testing response.',
    tip: 'Use this when the post already has a clear message and you want to test audience response.',
  }

  if (isVideoPost(item)) {
    return {
      ...base,
      goal: 'video_views',
      budgetAmount: '8',
      durationDays: 3,
      reason: 'This post appears to use video, so video views are the cleanest first test.',
      tip: 'Use a short run first. If watch time is strong, repeat with a larger audience.',
    }
  }

  if (hasLinkOrTrafficCta(item)) {
    return {
      ...base,
      goal: 'traffic',
      budgetAmount: '12',
      durationDays: 5,
      reason: 'The post has a clear website or booking action, so traffic is the best starting goal.',
      tip: 'Make sure the landing page matches the post before spending more.',
    }
  }

  if (isLocalAwarenessPost(item)) {
    return {
      ...base,
      goal: 'awareness',
      budgetAmount: '10',
      durationDays: 5,
      reason: 'The post has a local awareness angle, so a small local reach test is the right first step.',
      tip: 'Keep the audience tight around the service area or upcoming visit location.',
    }
  }

  return base
}
