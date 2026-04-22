const DROPBOX_API_BASE = 'https://api.dropboxapi.com/2'
const DROPBOX_CONTENT_API_BASE = 'https://content.dropboxapi.com/2'
const DROPBOX_OAUTH_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'avif',
  'heic',
  'heif',
  'mp4',
  'mov',
])
const TOKEN_STOP_WORDS = new Set([
  'and',
  'for',
  'from',
  'that',
  'this',
  'with',
  'into',
  'your',
  'the',
  'show',
  'photo',
  'image',
  'idea',
  'post',
  'draft',
  'studio',
])

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  })
}

function normalizePath(path) {
  const cleaned = String(path || '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')

  if (!cleaned || cleaned === '.') return ''
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

function getIsoWeekFolder(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '')
  if (!match) {
    throw new Error('Invalid date. Expected YYYY-MM-DD.')
  }

  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date. Expected YYYY-MM-DD.')
  }

  const dayOfWeek = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek)
  const weekYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const weekNumber = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)

  return `${weekYear}-w${String(weekNumber).padStart(2, '0')}`
}

function hashString(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length > 2 && !TOKEN_STOP_WORDS.has(token))
}

function getExtension(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

function isSupportedMedia(entry) {
  return entry?.['.tag'] === 'file' && SUPPORTED_MEDIA_EXTENSIONS.has(getExtension(entry.name))
}

function isImageMedia(entry) {
  return entry?.['.tag'] === 'file' && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif'].includes(getExtension(entry.name))
}

function scoreEntry(entry, { mediaHint, postType, weekFolder }) {
  const fileName = String(entry?.name || '').toLowerCase()
  const tokens = [...new Set([...tokenize(mediaHint), ...tokenize(postType)])]
  const reasons = []
  let score = 0

  for (const token of tokens) {
    if (fileName.includes(token)) {
      score += token.length > 5 ? 6 : 4
      reasons.push(`Matches "${token}"`)
    }
  }

  const extension = getExtension(entry?.name)
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif'].includes(extension)) {
    score += 5
    reasons.push('Photo-ready file type')
  }

  const weekHint = weekFolder.split('-').join('')
  if (fileName.includes(weekHint) || fileName.includes(weekFolder.replace('-', ''))) {
    score += 3
    reasons.push('Week-specific filename')
  }

  if (/(hero|cover|banner|feature|spotlight|recital|class|studio|team|student|teacher)/.test(fileName)) {
    score += 3
  }

  if (!reasons.length) {
    reasons.push('Best visual match from this week folder')
  }

  score += hashString(`${weekFolder}:${entry?.path_lower || entry?.name}`) % 3

  return { score, reasons }
}

async function dropboxRpc(endpoint, accessToken, body) {
  const response = await fetch(`${DROPBOX_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error_summary || `Dropbox API request failed for ${endpoint}.`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

async function exchangeDropboxRefreshToken(refreshToken, clientId, clientSecret) {
  const response = await fetch(DROPBOX_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.access_token) {
    const error = new Error(payload.error_summary || payload.error_description || 'Dropbox token refresh failed.')
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload.access_token
}

async function getDropboxAccessToken(env) {
  const refreshToken = String(env.DROPBOX_REFRESH_TOKEN || '').trim()
  const clientId = String(env.DROPBOX_APP_KEY || '').trim()
  const clientSecret = String(env.DROPBOX_APP_SECRET || '').trim()

  if (refreshToken) {
    if (!clientId || !clientSecret) {
      throw new Error('Dropbox refresh token is configured, but app key/secret are missing.')
    }

    return exchangeDropboxRefreshToken(refreshToken, clientId, clientSecret)
  }

  const accessToken = String(env.DROPBOX_ACCESS_TOKEN || '').trim()
  if (!accessToken) {
    throw new Error('Dropbox access token is not configured in the worker.')
  }

  return accessToken
}

function isFolderMissing(error) {
  return error?.payload?.error?.['.tag'] === 'path'
    && error?.payload?.error?.path?.['.tag'] === 'not_found'
}

async function listFolderEntries(accessToken, path) {
  const firstPage = await dropboxRpc('/files/list_folder', accessToken, {
    path,
    recursive: false,
    include_media_info: true,
    include_deleted: false,
  })

  const entries = [...(firstPage.entries || [])]
  let cursor = firstPage.cursor
  let hasMore = firstPage.has_more

  while (hasMore && cursor) {
    const nextPage = await dropboxRpc('/files/list_folder/continue', accessToken, { cursor })
    entries.push(...(nextPage.entries || []))
    cursor = nextPage.cursor
    hasMore = nextPage.has_more
  }

  return entries
}

async function getSharedLinkMetadata(accessToken, url) {
  return dropboxRpc('/sharing/get_shared_link_metadata', accessToken, { url })
}

async function listSharedFolderEntries(accessToken, url) {
  const payload = await dropboxRpc('/files/list_folder', accessToken, {
    path: '',
    shared_link: { url },
    recursive: false,
    include_media_info: true,
    include_deleted: false,
  })

  return payload.entries || []
}

async function getTemporaryLink(accessToken, path) {
  const payload = await dropboxRpc('/files/get_temporary_link', accessToken, { path })
  return payload?.link || null
}

async function listDirectSharedLinks(accessToken, path) {
  const payload = await dropboxRpc('/sharing/list_shared_links', accessToken, {
    path,
    direct_only: true,
  })
  return payload?.links || []
}

async function createSharedLink(accessToken, path) {
  const payload = await dropboxRpc('/sharing/create_shared_link_with_settings', accessToken, {
    path,
    settings: {
      requested_visibility: 'public',
    },
  })
  return payload?.url || null
}

async function getBestDropboxPreviewLink(accessToken, path) {
  try {
    return await getTemporaryLink(accessToken, path)
  } catch {
    // Fall through to shared-link lookup below.
  }

  try {
    const existingLinks = await listDirectSharedLinks(accessToken, path)
    if (existingLinks.length > 0) {
      return existingLinks[0]?.url || null
    }
  } catch {
    // Fall through to shared-link creation below.
  }

  try {
    return await createSharedLink(accessToken, path)
  } catch (error) {
    if (error?.payload?.error?.['.tag'] === 'shared_link_already_exists') {
      try {
        const existingLinks = await listDirectSharedLinks(accessToken, path)
        return existingLinks[0]?.url || null
      } catch {
        return null
      }
    }
    return null
  }
}

async function getDropboxThumbnail(accessToken, path, size = 'w128h128') {
  const response = await fetch(`${DROPBOX_CONTENT_API_BASE}/files/get_thumbnail_v2`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({
        resource: { '.tag': 'path', path },
        format: 'jpeg',
        size,
        mode: 'strict',
      }),
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const error = new Error(payload.error_summary || 'Dropbox thumbnail lookup failed.')
    error.status = response.status
    error.payload = payload
    throw error
  }

  return response
}

async function handleDropboxWeekMedia(request, env) {
  let accessToken
  try {
    accessToken = await getDropboxAccessToken(env)
  } catch (error) {
    return json({ error: error.message || 'Dropbox credentials are not configured in the worker.' }, { status: 500 })
  }

  const url = new URL(request.url)
  const dateString = url.searchParams.get('date') || ''
  const mediaHint = url.searchParams.get('mediaHint') || ''
  const postType = url.searchParams.get('postType') || ''

  let weekFolder
  try {
    weekFolder = getIsoWeekFolder(dateString)
  } catch (error) {
    return json({ error: error.message }, { status: 400 })
  }

  const parentPath = normalizePath(env.DROPBOX_WEEKLY_PARENT_PATH || '/Social Posts')
  const folderPath = normalizePath(`${parentPath}/${weekFolder}`)
  const sharedWeekLink = env.DROPBOX_WEEKLY_SHARED_LINK || ''

  let entries = []
  try {
    entries = await listFolderEntries(accessToken, folderPath)
  } catch (error) {
    let usedSharedLinkFallback = false

    if (isFolderMissing(error) && sharedWeekLink) {
      try {
        const sharedMetadata = await getSharedLinkMetadata(accessToken, sharedWeekLink)
        if (sharedMetadata?.name === weekFolder) {
          entries = await listSharedFolderEntries(accessToken, sharedWeekLink)
          usedSharedLinkFallback = true
        }
      } catch {
        // Fall through to the standard empty-state response below.
      }
    }

    if (isFolderMissing(error) && entries.length === 0) {
      return json({
        weekFolder,
        folderPath,
        suggestions: [],
        message: `No Dropbox folder was found yet for ${weekFolder}.`,
      })
    }

    if (!usedSharedLinkFallback) {
      return json({
        error: error.message || 'Dropbox lookup failed.',
        weekFolder,
        folderPath,
      }, { status: 502 })
    }
  }

  const rankedEntries = entries
    .filter(isSupportedMedia)
    .map((entry) => ({
      entry,
      ...scoreEntry(entry, { mediaHint, postType, weekFolder }),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)

  const suggestions = await Promise.all(
    rankedEntries.map(async ({ entry, score, reasons }) => {
      const link = await getBestDropboxPreviewLink(accessToken, entry.path_lower || entry.path_display)

      return {
        name: entry.name,
        size: entry.size || 0,
        path: entry.path_display || entry.path_lower || '',
        link,
        thumbnail: isImageMedia(entry)
          ? `/api/dropbox/thumbnail?path=${encodeURIComponent(entry.path_lower || entry.path_display || '')}&rev=${encodeURIComponent(entry.rev || '')}`
          : null,
        score,
        reasons,
      }
    }),
  )

  return json({
    weekFolder,
    folderPath,
    totalCandidates: entries.filter(isSupportedMedia).length,
    suggestions,
    message: suggestions.length
      ? `Suggested from Dropbox folder ${weekFolder}.`
      : `Dropbox folder ${weekFolder} is available, but no supported media files were found yet.`,
  })
}

async function handleDropboxThumbnail(request, env) {
  const url = new URL(request.url)
  const path = String(url.searchParams.get('path') || '').trim()
  if (!path) {
    return json({ error: 'Missing Dropbox file path.' }, { status: 400 })
  }

  let accessToken
  try {
    accessToken = await getDropboxAccessToken(env)
  } catch (error) {
    return json({ error: error.message || 'Dropbox credentials are not configured in the worker.' }, { status: 500 })
  }

  try {
    const thumbResponse = await getDropboxThumbnail(accessToken, path)
    return new Response(thumbResponse.body, {
      status: thumbResponse.status,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    return json({ error: error.message || 'Could not load Dropbox thumbnail.' }, { status: error.status || 502 })
  }
}

export { getIsoWeekFolder }

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/dropbox/week-media') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            allow: 'GET, OPTIONS',
          },
        })
      }

      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed.' }, { status: 405 })
      }

      return handleDropboxWeekMedia(request, env)
    }

    if (url.pathname === '/api/dropbox/thumbnail') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            allow: 'GET, OPTIONS',
          },
        })
      }

      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed.' }, { status: 405 })
      }

      return handleDropboxThumbnail(request, env)
    }

    return env.ASSETS.fetch(request)
  },
}
