const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi
const TRAILING_PUNCTUATION_PATTERN = /[),.;:!?]+$/

export function splitMessageLinks(value) {
  const text = String(value || '')
  if (!text) return []

  const parts = []
  let cursor = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0]
    const start = match.index || 0
    const trailing = rawUrl.match(TRAILING_PUNCTUATION_PATTERN)?.[0] || ''
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl

    if (start > cursor) {
      parts.push({ type: 'text', value: text.slice(cursor, start) })
    }

    if (url) {
      parts.push({ type: 'link', value: url })
    }

    if (trailing) {
      parts.push({ type: 'text', value: trailing })
    }

    cursor = start + rawUrl.length
  }

  if (cursor < text.length) {
    parts.push({ type: 'text', value: text.slice(cursor) })
  }

  return parts.length ? parts : [{ type: 'text', value: text }]
}
