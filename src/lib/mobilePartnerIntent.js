const CREATE_POST_PATTERN = /\b(?:create|make|build|write|draft|prepare|generate|put together)\b[\s\S]{0,80}\b(?:social\s+)?post\b/i
const POST_ABOUT_PATTERN = /\b(?:post|caption)\s+(?:about|for|announcing|promoting|showing|featuring)\b/i
const IMAGE_REQUEST_PATTERN = /\b(?:create|make|build|generate|design|include|add|with|use)\b[\s\S]{0,60}\b(?:image|graphic|visual|artwork|picture|photo)\b|\b(?:image|graphic|visual|artwork|picture|photo)\s+(?:to\s+include|for\s+the\s+post)\b/i
const SOCIAL_PHOTO_PATTERN = /\b(?:realistic|natural|lifestyle|photorealistic|photo[- ]style|social\s+photo)\b/i
const INFOGRAPHIC_PATTERN = /\b(?:infographic|tips graphic|steps graphic|how[- ]to graphic|educational graphic)\b/i

export function isExplicitNewPostRequest(request) {
  const text = String(request || '').trim()
  if (!text) return false
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
