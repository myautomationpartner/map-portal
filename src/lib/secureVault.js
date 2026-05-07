export const SECURE_VAULT_QUOTA_BYTES = 100 * 1024 * 1024
export const SECURE_VAULT_MAX_FILE_BYTES = 25 * 1024 * 1024
export const SECURE_VAULT_DEFAULT_ACCESS_MODE = 'view_and_download'
export const SECURE_VAULT_VIEW_ONLY_ACCESS_MODE = 'view_only'
export const SECURE_VAULT_MAX_ROOM_DAYS = 30

export const SECURE_VAULT_MIME_OPTIONS = [
  'application/pdf',
  'text/csv',
  'application/csv',
  'text/tab-separated-values',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/rtf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-word.document.macroEnabled.12',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.template.macroEnabled.12',
  'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  'application/vnd.ms-powerpoint.template.macroEnabled.12',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.openxmlformats-officedocument.presentationml.template',
]

const MIME_BY_EXTENSION = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  rtf: 'application/rtf',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docm: 'application/vnd.ms-word.document.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xltm: 'application/vnd.ms-excel.template.macroEnabled.12',
  ppt: 'application/vnd.ms-powerpoint',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  potm: 'application/vnd.ms-powerpoint.template.macroEnabled.12',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  gdoc: 'application/vnd.google-apps.document',
  gsheet: 'application/vnd.google-apps.spreadsheet',
  gslides: 'application/vnd.google-apps.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
}

export function formatVaultBytes(value) {
  const bytes = Math.max(0, Number(value) || 0)

  if (bytes < 1024) return `${Math.round(bytes)} B`

  const kilobytes = bytes / 1024
  if (kilobytes < 1024) return `${formatDecimal(kilobytes)} KB`

  return `${formatDecimal(kilobytes / 1024)} MB`
}

function formatDecimal(value) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function vaultUsagePercent(usedBytes, quotaBytes = SECURE_VAULT_QUOTA_BYTES) {
  const quota = Number(quotaBytes) || SECURE_VAULT_QUOTA_BYTES
  const used = Math.max(0, Number(usedBytes) || 0)
  return Math.min(100, Math.round((used / quota) * 100))
}

export function resolveSecureVaultMimeType(file) {
  if (!file) return ''
  if (SECURE_VAULT_MIME_OPTIONS.includes(file.type)) return file.type

  const extension = String(file.name || '').split('.').pop()?.toLowerCase()
  const inferredMime = extension ? MIME_BY_EXTENSION[extension] : null

  return inferredMime && SECURE_VAULT_MIME_OPTIONS.includes(inferredMime) ? inferredMime : ''
}

export function roomCanDownload(room) {
  return (room?.access_mode || SECURE_VAULT_DEFAULT_ACCESS_MODE) !== SECURE_VAULT_VIEW_ONLY_ACCESS_MODE
}

export function defaultRoomExpiryValue(baseDate = new Date()) {
  const date = new Date(baseDate)
  date.setUTCDate(date.getUTCDate() + 7)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function normalizeRoomExpiry(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function isRoomExpired(room, baseDate = new Date()) {
  const expiresAt = new Date(room?.expires_at || 0)
  return Number.isNaN(expiresAt.getTime()) ? false : expiresAt.getTime() <= baseDate.getTime()
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ''))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function generateRoomToken() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '')
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function buildSecureVaultRoomUrl(token, origin = window.location.origin, basePath = '') {
  const normalizedBase = String(basePath || '').replace(/\/$/, '')
  return `${origin}${normalizedBase}/vault/${encodeURIComponent(token)}`
}

export function buildSecureVaultShareUrl(token, origin = window.location.origin, basePath = '') {
  const normalizedBase = String(basePath || '').replace(/\/$/, '')
  return `${origin}${normalizedBase}/share/${encodeURIComponent(token)}`
}

export function validateSecureVaultFile(file, usedBytes = 0, quotaBytes = SECURE_VAULT_QUOTA_BYTES) {
  const mimeType = resolveSecureVaultMimeType(file)
  if (!mimeType) {
    return { valid: false, reason: 'unsupported_type', mimeType: '' }
  }

  if (file.size > SECURE_VAULT_MAX_FILE_BYTES) {
    return { valid: false, reason: 'file_too_large', mimeType }
  }

  if ((Number(usedBytes) || 0) + file.size > quotaBytes) {
    return { valid: false, reason: 'quota_exceeded', mimeType }
  }

  return { valid: true, reason: '', mimeType }
}
