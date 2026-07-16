const REPLACE_MEDIA_PATTERN = /\b(replace|swap|switch|change)\b|\buse\s+(?:this|the|my|our|attached|new)\s+(?:photo|image|picture|file)\b|\binstead\b/i
const ADD_MEDIA_PATTERN = /\b(add|include|attach|keep)\b|\b(also|another|second|extra|carousel)\b|\bwith\s+the\s+(?:current|existing|first)\b/i
const TRANSFORM_MEDIA_PATTERN = /\b(brighten|darken|enhance|improve|clean\s*up|crop|resize|reframe|remove|erase|blur|sharpen|retouch|restore|rotate|flip|recolor|colour|color|background|lighting|contrast|saturation|filter|style|illustrat|cartoon|professional|polish)\b|\badd\s+(?:the\s+|my\s+|our\s+)?(?:logo|text|headline|title|badge|watermark|overlay|person|object|product)\b/i

export const MAX_POST_MEDIA = 10

export const PLATFORM_IMAGE_LIMITS = Object.freeze({
  facebook: 10,
  instagram: 10,
  twitter: 4,
})

export function getPlatformImageLimit(platformId) {
  return PLATFORM_IMAGE_LIMITS[platformId] || MAX_POST_MEDIA
}

export function getPlatformMediaNotice(mediaCount, platforms = []) {
  const count = Math.max(0, Number(mediaCount) || 0)
  const constrained = [...new Set(platforms)]
    .map((platformId) => ({ platformId, limit: getPlatformImageLimit(platformId) }))
    .filter(({ limit }) => count > limit)
  if (!constrained.length) return ''

  const labels = constrained.map(({ platformId, limit }) => `${platformId === 'twitter' ? 'X' : platformId} will use the first ${limit}`)
  return `${labels.join('; ')}. Facebook and Instagram will keep all ${count}. Reorder the photos to choose which appear first.`
}

export function resolveAttachmentMediaAction(request, attachmentCount = 0) {
  if (!attachmentCount) return 'none'
  const text = String(request || '').trim()
  if (REPLACE_MEDIA_PATTERN.test(text)) return 'replace'
  if (ADD_MEDIA_PATTERN.test(text)) return 'add'
  return 'replace'
}

export function shouldTransformAttachment(request) {
  return TRANSFORM_MEDIA_PATTERN.test(String(request || '').trim())
}
