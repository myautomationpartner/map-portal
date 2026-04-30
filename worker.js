const DROPBOX_API_BASE = 'https://api.dropboxapi.com/2'
const DROPBOX_CONTENT_API_BASE = 'https://content.dropboxapi.com/2'
const DROPBOX_OAUTH_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const DEFAULT_CHATWOOT_BASE_URL = 'https://chatwoot.myautomationpartner.com'
const DEFAULT_N8N_BASE_URL = 'https://n8n.myautomationpartner.com'
const DEFAULT_ZERNIO_API_BASE_URL = 'https://zernio.com/api/v1'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xwASGbwUsZhX5CFNizTAmg_U50hkD7o'
const DEFAULT_CHATWOOT_SOCIAL_INBOX_NAME = 'Social Inbox'
const CONTENT_PARTNER_CONTACT_NAME = 'My Partner'
const TECHNICAL_HOST_SUFFIXES = ['.workers.dev', '.pages.dev']
const DEFAULT_SHARED_PORTAL_PATH_PREFIX = 'portal'
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

function getCanonicalPortalHost(env) {
  return String(env.PORTAL_CANONICAL_HOST || '').trim().toLowerCase()
}

function getSharedPortalPathPrefix(env) {
  return String(env.PORTAL_SHARED_PATH_PREFIX || DEFAULT_SHARED_PORTAL_PATH_PREFIX)
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
}

function extractTenantSlugFromPath(pathname, env) {
  const segments = String(pathname || '')
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean)
  const prefix = getSharedPortalPathPrefix(env)

  if (prefix && segments[0] === prefix && segments[1]) return segments[1]
  return ''
}

function normalizeSharedPortalRequest(request, env) {
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const prefix = getSharedPortalPathPrefix(env)

  if (!prefix || segments[0]?.toLowerCase() !== prefix || !segments[1]) {
    return { request, url, tenantSlug: '' }
  }

  const tenantSlug = decodeURIComponent(segments[1]).trim().toLowerCase()
  const strippedSegments = segments.slice(2)
  const normalizedUrl = new URL(request.url)
  normalizedUrl.pathname = `/${strippedSegments.join('/')}`.replace(/\/+$/, '') || '/'

  const headers = new Headers(request.headers)
  headers.set('x-map-tenant-slug', tenantSlug)
  headers.set('x-map-original-pathname', url.pathname)

  return {
    request: new Request(normalizedUrl.toString(), {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: request.redirect,
    }),
    url: normalizedUrl,
    tenantSlug,
  }
}

function buildSharedPortalTrailingSlashRedirect(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) return null

  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const prefix = getSharedPortalPathPrefix(env)

  if (!prefix || segments.length !== 2 || segments[0]?.toLowerCase() !== prefix) return null
  if (url.pathname.endsWith('/')) return null

  url.pathname = `${url.pathname}/`

  return new Response(null, {
    status: 308,
    headers: {
      location: url.toString(),
      'cache-control': 'no-store',
    },
  })
}

function shouldBypassCanonicalRedirect(url) {
  const path = String(url.pathname || '')
  if (path.startsWith('/api/')) return true
  return /^\/[^/]+\/[^/]+\/api\//.test(path)
}

function buildCanonicalRedirect(request, env) {
  const canonicalHost = getCanonicalPortalHost(env)
  if (!canonicalHost) return null
  if (!['GET', 'HEAD'].includes(request.method)) return null

  const url = new URL(request.url)
  const currentHost = String(
    request.headers.get('x-forwarded-host')
    || request.headers.get('host')
    || url.hostname
    || '',
  )
    .split(':')[0]
    .trim()
    .toLowerCase()

  if (!currentHost || currentHost === canonicalHost) return null
  if (shouldBypassCanonicalRedirect(url)) return null

  const isTechnicalHost = TECHNICAL_HOST_SUFFIXES.some((suffix) => currentHost.endsWith(suffix))
  if (!isTechnicalHost) return null

  url.protocol = 'https:'
  url.host = canonicalHost

  return new Response(null, {
    status: 308,
    headers: {
      location: url.toString(),
      'cache-control': 'no-store',
    },
  })
}

function getN8nBaseUrl(env) {
  return String(env.N8N_BASE_URL || DEFAULT_N8N_BASE_URL).replace(/\/$/, '')
}

function buildSafeN8nRedirectUrl(request, env, requestedRedirectUrl, tenantSlug = '') {
  const requestUrl = new URL(request.url)
  const prefix = getSharedPortalPathPrefix(env)
  const safePath = prefix && tenantSlug
    ? `/${prefix}/${tenantSlug}/settings`
    : '/settings'
  const fallbackUrl = new URL(safePath, requestUrl.origin)

  if (!requestedRedirectUrl) return fallbackUrl.toString()

  try {
    const parsed = new URL(String(requestedRedirectUrl), requestUrl.origin)
    if (parsed.origin !== requestUrl.origin) return fallbackUrl.toString()
    return parsed.toString()
  } catch {
    return fallbackUrl.toString()
  }
}

async function proxyN8nWebhook(request, env, webhookPath) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        allow: 'POST, OPTIONS',
      },
    })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405 })
  }

  const targetUrl = `${getN8nBaseUrl(env)}/webhook/${webhookPath}`

  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error
  if (auth.user.role !== 'admin') {
    return json({ error: 'Only client admins can manage social connections.' }, { status: 403 })
  }

  let body = {}
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Could not read request body as JSON.' }, { status: 400 })
  }

  const requestedClientId = String(body?.clientId || '').trim()
  if (requestedClientId && requestedClientId !== String(auth.user.client_id || '')) {
    return json({ error: 'This portal session is not authorized for the requested tenant.' }, { status: 403 })
  }

  const tenantSlug = String(auth.user?.clients?.slug || '').trim().toLowerCase()
  const securedBody = {
    ...(body && typeof body === 'object' ? body : {}),
    clientId: auth.user.client_id,
    tenantSlug,
    redirectUrl: buildSafeN8nRedirectUrl(request, env, body?.redirectUrl, tenantSlug),
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(securedBody),
    })

    const responseText = await response.text()
    return new Response(responseText, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return json({
      error: error?.message || `Failed to reach ${webhookPath}.`,
    }, { status: 502 })
  }
}

function normalizePlatform(platform) {
  const value = String(platform || '').trim().toLowerCase()
  const platformMap = {
    facebook: 'facebook',
    facebook_page: 'facebook',
    fb: 'facebook',
    instagram: 'instagram',
    ig: 'instagram',
    tiktok: 'tiktok',
    tt: 'tiktok',
    linkedin: 'linkedin',
    linked_in: 'linkedin',
    linkedin_page: 'linkedin',
    linkedin_company: 'linkedin',
    li: 'linkedin',
    twitter: 'twitter',
    x: 'twitter',
    x_twitter: 'twitter',
    xtwitter: 'twitter',
  }

  return platformMap[value] || null
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function safeCompareHex(left, right) {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

async function verifyZernioWebhookSignature(rawBody, signature, secret) {
  const normalizedSignature = String(signature || '').trim().toLowerCase()
  const normalizedSecret = String(secret || '')
  if (!normalizedSignature || !normalizedSecret) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizedSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return safeCompareHex(expected, normalizedSignature)
}

function getSupabaseConfig(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '')
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '')
  const publishableKey = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY || '')
  const clientId = String(env.PORTAL_CLIENT_ID || '')
  const webhookSecret = String(env.ZERNIO_WEBHOOK_SECRET || '')

  if (!url || !serviceRoleKey || !webhookSecret) {
    throw new Error('Missing worker secrets for Zernio webhook reconciliation.')
  }

  return { url, serviceRoleKey, publishableKey, clientId, webhookSecret }
}

function getPortalAuthConfig(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '')
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '')
  const publishableKey = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY || '')
  const clientId = String(env.PORTAL_CLIENT_ID || '')

  if (!url || !serviceRoleKey) {
    throw new Error('Missing worker secrets for portal authentication.')
  }

  return { url, serviceRoleKey, publishableKey, clientId }
}

async function supabaseRest(envConfig, path, init = {}) {
  const response = await fetch(`${envConfig.url}${path}`, {
    ...init,
    headers: {
      apikey: envConfig.serviceRoleKey,
      Authorization: `Bearer ${envConfig.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Supabase request failed (${response.status}).`)
  }

  return response
}

async function authorizePortalUser(request, env) {
  const authHeader = request.headers.get('authorization') || ''
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!bearerToken) {
    return { error: json({ error: 'Authentication required.' }, { status: 401 }) }
  }

  let envConfig
  try {
    envConfig = getPortalAuthConfig(env)
  } catch (error) {
    return { error: json({ error: error.message || 'Portal auth is not configured.' }, { status: 500 }) }
  }

  const userResponse = await fetch(`${envConfig.url}/auth/v1/user`, {
    headers: {
      apikey: envConfig.serviceRoleKey,
      Authorization: `Bearer ${bearerToken}`,
    },
  })

  if (!userResponse.ok) {
    return { error: json({ error: 'Invalid or expired portal session.' }, { status: 401 }) }
  }

  const authUser = await userResponse.json().catch(() => null)
  const authUserId = String(authUser?.id || '').trim()
  if (!authUserId) {
    return { error: json({ error: 'Invalid portal session.' }, { status: 401 }) }
  }

  const requestedTenantSlug = String(
    request.headers.get('x-map-tenant-slug')
    || extractTenantSlugFromPath(new URL(request.url).pathname, env)
    || '',
  ).trim().toLowerCase()
  const filters = new URLSearchParams({
    select: 'id,client_id,role,email,clients(slug)',
    id: `eq.${authUserId}`,
    limit: '1',
  })
  if (envConfig.clientId) filters.set('client_id', `eq.${envConfig.clientId}`)

  let portalRows = []
  try {
    const response = await supabaseRest(envConfig, `/rest/v1/users?${filters.toString()}`)
    portalRows = await response.json()
  } catch (error) {
    return { error: json({ error: error.message || 'Could not verify portal access.' }, { status: 502 }) }
  }

  const portalUser = Array.isArray(portalRows) ? portalRows[0] : null
  if (!portalUser) {
    return { error: json({ error: 'This portal session is not authorized for this tenant.' }, { status: 403 }) }
  }

  const profileSlug = String(portalUser?.clients?.slug || '').trim().toLowerCase()
  if (requestedTenantSlug && profileSlug && requestedTenantSlug !== profileSlug) {
    return { error: json({ error: 'This portal session is not authorized for this tenant path.' }, { status: 403 }) }
  }

  return {
    user: portalUser,
    envConfig: {
      ...envConfig,
      clientId: envConfig.clientId || portalUser.client_id,
      clientSlug: profileSlug,
    },
    bearerToken,
  }
}

function getChatwootConfig(env) {
  if (env?.baseUrl && env?.accountId && env?.apiToken) return env

  const baseUrl = String(env.CHATWOOT_BASE_URL || DEFAULT_CHATWOOT_BASE_URL).replace(/\/$/, '')
  const accountId = String(env.CHATWOOT_ACCOUNT_ID || '').trim()
  const apiToken = String(env.CHATWOOT_API_ACCESS_TOKEN || '').trim()
  const socialInboxId = parsePositiveInteger(env.CHATWOOT_SOCIAL_INBOX_ID)

  if (!accountId || !apiToken) {
    throw new Error('Chatwoot API is not configured for this portal yet.')
  }

  return { baseUrl, accountId, apiToken, socialInboxId }
}

async function getChatwootConfigForClient(env, envConfig, options = {}) {
  const overrideAccountId = String(options.accountId || '').trim()
  if (env.CHATWOOT_ACCOUNT_ID) {
    const config = getChatwootConfig(env)
    return overrideAccountId ? { ...config, accountId: overrideAccountId } : config
  }

  const baseUrl = String(env.CHATWOOT_BASE_URL || DEFAULT_CHATWOOT_BASE_URL).replace(/\/$/, '')
  const apiToken = String(env.CHATWOOT_API_ACCESS_TOKEN || '').trim()
  if (!apiToken) {
    throw new Error('Chatwoot API is not configured for this portal yet.')
  }

  const settings = await loadWebsiteChatSettings(envConfig)
  const accountId = overrideAccountId || String(settings?.chatwoot_account_id || '').trim()
  if (!accountId) {
    throw new Error('Chatwoot account is not configured for this tenant yet.')
  }

  return {
    baseUrl,
    apiToken,
    accountId,
    socialInboxId: parsePositiveInteger(settings?.chatwoot_social_inbox_id) || parsePositiveInteger(env.CHATWOOT_SOCIAL_INBOX_ID),
  }
}

function getWebhookChatwootAccountId(payload, message, conversation) {
  return firstString(
    payload?.account?.id,
    payload?.account_id,
    payload?.accountId,
    message?.account_id,
    message?.accountId,
    conversation?.account_id,
    conversation?.accountId,
  )
}

function getZernioConfig(env) {
  const baseUrl = String(env.ZERNIO_API_BASE_URL || DEFAULT_ZERNIO_API_BASE_URL).replace(/\/$/, '')
  const apiKey = String(env.ZERNIO_API_KEY || '').trim()

  if (!apiKey) {
    throw new Error('Zernio API key is not configured for inbox replies yet.')
  }

  return { baseUrl, apiKey }
}

function chatwootHeaders(apiToken, extra = {}) {
  return {
    api_access_token: apiToken,
    'content-type': 'application/json',
    ...extra,
  }
}

function sanitizeChatwootError(message) {
  return String(message || 'Chatwoot request failed.')
    .replace(/api_access_token=[^&\s]+/gi, 'api_access_token=<redacted>')
    .replace(/api_access_token:?\s*["']?[^"',\s]+/gi, 'api_access_token: <redacted>')
}

async function readChatwootResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}))
  }

  const text = await response.text().catch(() => '')
  return text ? { message: text } : {}
}

async function chatwootFetch(env, path, init = {}) {
  const config = getChatwootConfig(env)
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  const response = await fetch(`${config.baseUrl}/api/v1/accounts/${config.accountId}${path}`, {
    ...init,
    headers: isFormData
      ? { api_access_token: config.apiToken, ...(init.headers || {}) }
      : chatwootHeaders(config.apiToken, init.headers || {}),
  })

  const payload = await readChatwootResponse(response)
  if (!response.ok) {
    const error = new Error(sanitizeChatwootError(payload?.message || payload?.error || `Chatwoot request failed (${response.status}).`))
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

async function callSupabaseFunction(envConfig, functionName, body, gatewayToken = '') {
  const gatewayJwt = gatewayToken || envConfig.publishableKey || envConfig.serviceRoleKey
  const response = await fetch(`${envConfig.url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gatewayJwt}`,
      apikey: envConfig.publishableKey || envConfig.serviceRoleKey,
      'x-map-service-role': envConfig.serviceRoleKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  })

  const payload = await readChatwootResponse(response)
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || `${functionName} failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

async function zernioFetch(env, path, init = {}) {
  const config = getZernioConfig(env)
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  })

  const payload = await readChatwootResponse(response)
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `Zernio request failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

function normalizeBoostGoal(goal) {
  const value = String(goal || '').trim().toLowerCase()
  const allowed = new Set([
    'engagement',
    'traffic',
    'awareness',
    'video_views',
    'lead_generation',
    'conversions',
    'app_promotion',
  ])
  return allowed.has(value) ? value : null
}

function normalizeBudgetType(type) {
  const value = String(type || '').trim().toLowerCase()
  return value === 'lifetime' ? 'lifetime' : 'daily'
}

function normalizeBoostStatus(status) {
  const value = String(status || '').trim().toLowerCase()
    .replace(/[\s-]+/g, '_')
  const statusMap = {
    pending: 'pending',
    pending_review: 'pending',
    in_review: 'pending',
    active: 'active',
    live: 'active',
    enabled: 'active',
    paused: 'paused',
    completed: 'completed',
    complete: 'completed',
    ended: 'completed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    rejected: 'rejected',
    disapproved: 'rejected',
    failed: 'failed',
    error: 'failed',
  }
  return statusMap[value] || 'active'
}

function parseBoostAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null
}

async function loadBoostRows(envConfig, { postId } = {}) {
  const filters = new URLSearchParams({
    select: '*',
    client_id: `eq.${envConfig.clientId}`,
    order: 'created_at.desc',
  })

  if (postId) filters.set('post_id', `eq.${postId}`)

  const response = await supabaseRest(envConfig, `/rest/v1/post_boosts?${filters.toString()}`)
  return response.json()
}

async function loadPostForBoost(envConfig, postId) {
  const filters = new URLSearchParams({
    select: 'id,client_id,content,platforms,status,published_at,n8n_execution_id',
    id: `eq.${postId}`,
    client_id: `eq.${envConfig.clientId}`,
    limit: '1',
  })

  const response = await supabaseRest(envConfig, `/rest/v1/posts?${filters.toString()}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

async function loadSocialConnectionForBoost(envConfig, platform) {
  const filters = new URLSearchParams({
    select: 'id,platform,zernio_account_id,username',
    client_id: `eq.${envConfig.clientId}`,
    platform: `eq.${platform}`,
    limit: '1',
  })

  const response = await supabaseRest(envConfig, `/rest/v1/social_connections?${filters.toString()}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

async function insertPostBoost(envConfig, payload) {
  const response = await supabaseRest(envConfig, '/rest/v1/post_boosts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

async function handlePostBoosts(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { allow: 'GET, POST, OPTIONS' } })
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, POST' } })
  }

  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error

  if (request.method === 'GET') {
    const url = new URL(request.url)
    const postId = String(url.searchParams.get('postId') || '').trim()
    try {
      const boosts = await loadBoostRows(auth.envConfig, { postId })
      return json({ success: true, boosts })
    } catch (error) {
      return json({ error: error.message || 'Could not load boosts.' }, { status: 502 })
    }
  }

  if (auth.user.role !== 'admin') {
    return json({ error: 'Only client admins can boost posts.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const postId = String(body.postId || '').trim()
  const platform = normalizePlatform(body.platform)
  const goal = normalizeBoostGoal(body.goal)
  const budgetAmount = parseBoostAmount(body.budgetAmount)
  const budgetType = normalizeBudgetType(body.budgetType)
  const adAccountId = String(body.adAccountId || '').trim()
  const currency = String(body.currency || 'USD').trim().toUpperCase().slice(0, 3) || 'USD'
  const name = String(body.name || 'MAP Boost').trim().slice(0, 255)
  const startsAt = String(body.startsAt || '').trim() || null
  const endsAt = String(body.endsAt || '').trim() || null
  const targeting = body.targeting && typeof body.targeting === 'object' && !Array.isArray(body.targeting)
    ? body.targeting
    : {}

  if (!postId) return json({ error: 'Choose a published post to boost.' }, { status: 400 })
  if (!platform) return json({ error: 'Choose a supported platform to boost.' }, { status: 400 })
  if (!goal) return json({ error: 'Choose a supported boost goal.' }, { status: 400 })
  if (!budgetAmount) return json({ error: 'Enter a boost budget greater than $0.' }, { status: 400 })
  if (!adAccountId) return json({ error: 'Enter the ad account ID from Zernio.' }, { status: 400 })

  try {
    const post = await loadPostForBoost(auth.envConfig, postId)
    if (!post) return json({ error: 'Published post was not found for this portal.' }, { status: 404 })
    if (post.status !== 'published') {
      return json({ error: 'Boost is available after a post is published.' }, { status: 409 })
    }
    if (!post.n8n_execution_id) {
      return json({ error: 'This post is missing its Zernio post ID and cannot be boosted yet.' }, { status: 409 })
    }
    if (!Array.isArray(post.platforms) || !post.platforms.includes(platform)) {
      return json({ error: `This post was not published to ${platform}.` }, { status: 409 })
    }

    const connection = await loadSocialConnectionForBoost(auth.envConfig, platform)
    if (!connection?.zernio_account_id) {
      return json({ error: `Connect ${platform} in Settings before boosting.` }, { status: 409 })
    }

    const zernioBody = {
      postId: post.n8n_execution_id,
      accountId: connection.zernio_account_id,
      adAccountId,
      name,
      goal,
      budget: {
        amount: budgetAmount,
        type: budgetType,
        currency,
      },
      ...(startsAt || endsAt ? { schedule: { ...(startsAt ? { startDate: startsAt } : {}), ...(endsAt ? { endDate: endsAt } : {}) } } : {}),
      ...(Object.keys(targeting).length ? { targeting } : {}),
    }

    const zernioResult = await zernioFetch(env, '/ads/boost', {
      method: 'POST',
      body: JSON.stringify(zernioBody),
    })
    const ad = zernioResult?.ad || zernioResult?.data?.ad || {}
    const boost = await insertPostBoost(auth.envConfig, {
      client_id: auth.envConfig.clientId,
      post_id: post.id,
      social_connection_id: connection.id || null,
      platform,
      zernio_account_id: connection.zernio_account_id,
      ad_account_id: adAccountId,
      name,
      goal,
      budget_amount: budgetAmount,
      budget_type: budgetType,
      currency,
      starts_at: startsAt,
      ends_at: endsAt,
      targeting_json: targeting,
      zernio_ad_id: ad._id || ad.id || null,
      platform_ad_id: ad.platformAdId || null,
      platform_campaign_id: ad.platformCampaignId || null,
      platform_ad_set_id: ad.platformAdSetId || null,
      status: normalizeBoostStatus(ad.status),
      zernio_response_json: zernioResult || {},
      created_by: auth.user.id,
    })

    return json({
      success: true,
      boost,
      message: zernioResult?.message || 'Boost launched.',
    }, { status: 201 })
  } catch (error) {
    return json({
      error: error.message || 'Could not launch boost.',
      details: error.payload || null,
    }, { status: error.status || 502 })
  }
}

function isMissingRemoteScheduledDelete(payload, raw) {
  const message = [
    payload?.message,
    payload?.error,
    raw,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return message.includes('404') && message.includes('post not found')
}

async function loadTenantPostForDelete(envConfig, postId) {
  const filters = new URLSearchParams({
    select: 'id,client_id,status,n8n_execution_id',
    id: `eq.${postId}`,
    client_id: `eq.${envConfig.clientId}`,
    limit: '1',
  })

  const response = await supabaseRest(envConfig, `/rest/v1/posts?${filters.toString()}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

async function cancelRemoteScheduledPost(env, envConfig, post) {
  if (!post.n8n_execution_id) {
    return { attempted: false, skipped: true, reason: 'No Zernio scheduled post id was stored.' }
  }

  const response = await fetch(`${getN8nBaseUrl(env)}/webhook/social-publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete',
      postId: post.id,
      clientId: envConfig.clientId,
      zernioPostId: post.n8n_execution_id,
    }),
  })
  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || payload?.success === false) {
    if (isMissingRemoteScheduledDelete(payload, raw)) {
      return {
        attempted: true,
        ignoredMissingRemotePost: true,
        message: payload?.message || payload?.error || raw || 'Remote scheduled post was already missing.',
      }
    }
    const error = new Error(payload?.message || payload?.error || raw || 'Could not cancel this scheduled post in the publisher workflow.')
    error.status = response.status || 502
    error.payload = payload
    throw error
  }

  return {
    attempted: true,
    success: true,
    message: payload?.message || 'Remote scheduled post cancelled.',
  }
}

async function deleteTenantPost(envConfig, postId) {
  const filters = new URLSearchParams({
    select: 'id',
    id: `eq.${postId}`,
    client_id: `eq.${envConfig.clientId}`,
  })

  const response = await supabaseRest(envConfig, `/rest/v1/posts?${filters.toString()}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
  const rows = await response.json().catch(() => [])
  return Array.isArray(rows) ? rows : []
}

async function handleScheduledPostDelete(request, env, postId) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { allow: 'POST, DELETE, OPTIONS' } })
  }

  if (!['POST', 'DELETE'].includes(request.method)) {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'POST, DELETE' } })
  }

  if (!isUuidLike(postId)) {
    return json({ error: 'Invalid post id.' }, { status: 400 })
  }

  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error

  if (auth.user.role !== 'admin') {
    return json({ error: 'Only client admins can delete scheduled posts.' }, { status: 403 })
  }

  try {
    const post = await loadTenantPostForDelete(auth.envConfig, postId)
    if (!post) {
      return json({ error: 'Scheduled post was not found for this portal.' }, { status: 404 })
    }
    if (post.status !== 'scheduled') {
      return json({ error: 'Only scheduled posts can be deleted here.' }, { status: 409 })
    }

    const remoteDelete = await cancelRemoteScheduledPost(env, auth.envConfig, post)
    const deletedRows = await deleteTenantPost(auth.envConfig, post.id)
    if (!deletedRows.length) {
      return json({ error: 'The scheduled post was not deleted. Please refresh and try again.' }, { status: 409 })
    }

    return json({
      success: true,
      deletedPostId: post.id,
      remoteDelete,
    })
  } catch (error) {
    return json({
      error: error.message || 'Could not delete this scheduled post.',
      details: error.payload || null,
    }, { status: error.status || 502 })
  }
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function trimText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeHexColor(value, fallback = '#C9A84C') {
  const color = String(value || '').trim()
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : fallback
}

function normalizeJsonArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback
}

function buildWebsiteChatSnippet(settings) {
  const baseUrl = String(settings?.chatwoot_base_url || DEFAULT_CHATWOOT_BASE_URL).replace(/\/$/, '')
  const websiteToken = String(settings?.chatwoot_website_token || '').trim()
  if (!websiteToken) return ''

  return [
    '<script>',
    '  (function(d,t) {',
    `    var BASE_URL="${baseUrl.replace(/"/g, '&quot;')}";`,
    '    var g=d.createElement(t),s=d.getElementsByTagName(t)[0];',
    '    g.src=BASE_URL+"/packs/js/sdk.js";',
    '    g.defer=true;',
    '    g.async=true;',
    '    s.parentNode.insertBefore(g,s);',
    '    g.onload=function(){',
    `      window.chatwootSDK.run({ websiteToken: "${websiteToken.replace(/"/g, '&quot;')}", baseUrl: BASE_URL });`,
    '    };',
    '  })(document,"script");',
    '</script>',
  ].join('\n')
}

async function loadWebsiteChatSettings(envConfig) {
  const params = new URLSearchParams({
    select: '*',
    client_id: `eq.${envConfig.clientId}`,
    limit: '1',
  })
  const response = await supabaseRest(envConfig, `/rest/v1/client_website_chat_settings?${params.toString()}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

async function loadPortalClientBySlug(envConfig, slug) {
  const normalizedSlug = String(slug || '').trim().toLowerCase()
  if (!normalizedSlug) return null

  const params = new URLSearchParams({
    select: 'id,slug,business_name,website_url,portal_domain',
    slug: `eq.${normalizedSlug}`,
    limit: '1',
  })
  const response = await supabaseRest(envConfig, `/rest/v1/clients?${params.toString()}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

async function getPortalWebhookConfig(request, env) {
  const envConfig = getPortalAuthConfig(env)
  if (envConfig.clientId) return envConfig

  const requestedTenantSlug = String(
    request.headers.get('x-map-tenant-slug')
    || extractTenantSlugFromPath(new URL(request.url).pathname, env)
    || '',
  ).trim().toLowerCase()
  const client = await loadPortalClientBySlug(envConfig, requestedTenantSlug)
  if (!client?.id) {
    throw new Error('Could not resolve tenant for Chatwoot webhook.')
  }

  return {
    ...envConfig,
    clientId: client.id,
    clientSlug: client.slug,
  }
}

async function loadPortalClient(envConfig) {
  const params = new URLSearchParams({
    select: 'id,slug,business_name,website_url,portal_domain',
    id: `eq.${envConfig.clientId}`,
    limit: '1',
  })
  const response = await supabaseRest(envConfig, `/rest/v1/clients?${params.toString()}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

async function updateWebsiteChatSettings(envConfig, body) {
  const response = await supabaseRest(
    envConfig,
    `/rest/v1/client_website_chat_settings?client_id=eq.${encodeURIComponent(envConfig.clientId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body),
    },
  )
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

function websiteChatResponse(settings, extras = {}) {
  return {
    configured: Boolean(settings?.chatwoot_website_token),
    settings,
    installSnippet: buildWebsiteChatSnippet(settings),
    ...extras,
  }
}

function sanitizeWebsiteChatSettingsPatch(body) {
  const patch = {}
  if ('widget_color' in body) patch.widget_color = normalizeHexColor(body.widget_color)
  if ('welcome_heading' in body) patch.welcome_heading = trimText(body.welcome_heading, 80) || 'Hi there'
  if ('welcome_tagline' in body) patch.welcome_tagline = trimText(body.welcome_tagline, 180) || 'Send us a message and we will get back to you soon.'
  if ('greeting_enabled' in body) patch.greeting_enabled = Boolean(body.greeting_enabled)
  if ('greeting_message' in body) patch.greeting_message = trimText(body.greeting_message, 500) || 'Hi! How can we help?'
  if ('pre_chat_form_enabled' in body) patch.pre_chat_form_enabled = Boolean(body.pre_chat_form_enabled)
  if ('pre_chat_message' in body) patch.pre_chat_message = trimText(body.pre_chat_message, 300) || 'Tell us how to reach you before we start.'
  if ('pre_chat_fields' in body) patch.pre_chat_fields = normalizeJsonArray(body.pre_chat_fields, [])
  if ('saved_replies' in body) {
    patch.saved_replies = normalizeJsonArray(body.saved_replies, [])
      .slice(0, 12)
      .map((reply) => ({
        title: trimText(reply?.title, 60) || 'Reply',
        message: trimText(reply?.message, 1200),
      }))
      .filter((reply) => reply.message)
  }
  if ('automation_rules' in body) {
    patch.automation_rules = normalizeJsonArray(body.automation_rules, [])
      .slice(0, 8)
      .map((rule) => ({
        id: trimText(rule?.id, 50),
        enabled: Boolean(rule?.enabled),
        label: trimText(rule?.label, 80),
        message: trimText(rule?.message, 1200),
      }))
      .filter((rule) => rule.id && rule.label)
  }
  return patch
}

async function syncWebsiteChatToChatwoot(env, settings, patch) {
  const inboxId = parsePositiveInteger(settings?.chatwoot_website_inbox_id)
  if (!inboxId) return { synced: false, reason: 'Website Chat inbox id is not configured.' }

  const chatwootPatch = {}
  if ('widget_color' in patch) chatwootPatch.widget_color = patch.widget_color
  if ('greeting_enabled' in patch) chatwootPatch.greeting_enabled = patch.greeting_enabled
  if ('greeting_message' in patch) chatwootPatch.greeting_message = patch.greeting_message

  if (!Object.keys(chatwootPatch).length) {
    return { synced: false, reason: 'No Chatwoot widget fields changed.' }
  }

  await chatwootFetch(env, `/inboxes/${inboxId}`, {
    method: 'PATCH',
    body: JSON.stringify(chatwootPatch),
  })

  return { synced: true }
}

async function handleWebsiteChatSettings(request, env) {
  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error

  if (request.method === 'GET') {
    const settings = await loadWebsiteChatSettings(auth.envConfig)
    return json(websiteChatResponse(settings))
  }

  if (request.method !== 'PATCH') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, PATCH' } })
  }

  if (auth.user.role !== 'admin') {
    return json({ error: 'Only client admins can change website chat settings.' }, { status: 403 })
  }

  const currentSettings = await loadWebsiteChatSettings(auth.envConfig)
  if (!currentSettings) {
    return json({ error: 'Website chat settings are not configured for this portal yet.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const patch = sanitizeWebsiteChatSettingsPatch(body)
  if (!Object.keys(patch).length) {
    return json(websiteChatResponse(currentSettings, { sync: { synced: false, reason: 'No changes provided.' } }))
  }

  let sync = { synced: false }
  try {
    sync = await syncWebsiteChatToChatwoot(env, currentSettings, patch)
  } catch (error) {
    sync = { synced: false, warning: error.message || 'Could not sync widget changes to Chatwoot.' }
  }

  const updated = await updateWebsiteChatSettings(auth.envConfig, patch)
  return json(websiteChatResponse(updated, { sync }))
}

async function handleWebsiteChatInstallCheck(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'POST' } })
  }

  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error

  const [settings, client] = await Promise.all([
    loadWebsiteChatSettings(auth.envConfig),
    loadPortalClient(auth.envConfig),
  ])

  if (!settings?.chatwoot_website_token) {
    return json({ error: 'Website chat token is not configured yet.' }, { status: 404 })
  }

  const websiteUrl = String(client?.website_url || '').trim()
  if (!websiteUrl) {
    const updated = await updateWebsiteChatSettings(auth.envConfig, {
      install_status: 'needs_help',
      last_checked_at: new Date().toISOString(),
      last_check_error: 'No website URL is saved for this client.',
    })
    return json(websiteChatResponse(updated, { detected: false }))
  }

  try {
    const response = await fetch(websiteUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': 'MAP Website Chat Install Checker/1.0',
      },
    })
    const html = await response.text()
    const hasToken = html.includes(settings.chatwoot_website_token)
    const hasChatwoot = html.includes(settings.chatwoot_base_url) || html.includes('chatwootSDK.run')
    const detected = response.ok && hasToken && hasChatwoot
    const now = new Date().toISOString()
    const updated = await updateWebsiteChatSettings(auth.envConfig, {
      install_status: detected ? 'detected' : 'not_detected',
      last_checked_at: now,
      last_detected_at: detected ? now : settings.last_detected_at,
      last_check_error: detected ? null : 'The widget script was not found on the saved website homepage.',
    })

    return json(websiteChatResponse(updated, { detected, checkedUrl: websiteUrl }))
  } catch (error) {
    const updated = await updateWebsiteChatSettings(auth.envConfig, {
      install_status: 'needs_help',
      last_checked_at: new Date().toISOString(),
      last_check_error: error.message || 'Could not fetch the saved website homepage.',
    })
    return json(websiteChatResponse(updated, { detected: false, checkedUrl: websiteUrl }))
  }
}

async function handleChatwootMobileSetupEmail(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'POST' } })
  }

  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error

  const email = String(auth.user?.email || '').trim().toLowerCase()
  if (!email) {
    return json({ error: 'Your portal user does not have an email address.' }, { status: 400 })
  }

  const baseUrl = String(env.CHATWOOT_BASE_URL || DEFAULT_CHATWOOT_BASE_URL).replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/auth/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      redirect_url: `${baseUrl}/app/login`,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    return json({
      error: sanitizeChatwootError(payload?.message || payload?.error || 'Could not send the mobile inbox setup email.'),
    }, { status: response.status })
  }

  return json({
    success: true,
    email,
    message: 'Mobile inbox setup email sent.',
  })
}

async function handleContentPartnerConversation(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { allow: 'POST, OPTIONS' },
    })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'POST' } })
  }

  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error

  try {
    const { conversation, contact, inbox, assignment } = await findOrCreateChatwootContentPartnerConversation(env, auth.envConfig, auth.user)
    const conversationId = conversation?.id || conversation?.payload?.id
    if (!conversationId) throw new Error('MAP Content Partner conversation could not be opened.')

    return json({
      success: true,
      conversationId,
      inboxId: inbox?.id || null,
      contactId: contact?.id || null,
      assignedToPortalUser: Boolean(assignment?.assigned || assignment?.alreadyAssigned),
      title: CONTENT_PARTNER_CONTACT_NAME,
      reviewPath: '/post',
    })
  } catch (error) {
    return json({
      error: sanitizeChatwootError(error?.message || 'Could not open MAP Content Partner.'),
    }, { status: error?.status || 502 })
  }
}

async function handleChatwootProxy(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { allow: 'GET, POST, OPTIONS' },
    })
  }

  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error

  const url = new URL(request.url)
  const route = url.pathname.replace(/^\/api\/chatwoot\/?/, '')

  try {
    const chatwootConfig = await getChatwootConfigForClient(env, auth.envConfig)

    if (route === 'health') {
      getChatwootConfig(chatwootConfig)
      return json({ configured: true })
    }

    if (route === 'inboxes' && request.method === 'GET') {
      const payload = await chatwootFetch(chatwootConfig, '/inboxes')
      return json(payload)
    }

    if (route === 'agents' && request.method === 'GET') {
      const payload = await chatwootFetch(chatwootConfig, '/agents')
      return json(payload)
    }

    if (route === 'conversations' && request.method === 'GET') {
      const params = new URLSearchParams()
      params.set('status', url.searchParams.get('status') || 'open')
      params.set('assignee_type', url.searchParams.get('assignee_type') || 'all')
      params.set('page', String(parsePositiveInteger(url.searchParams.get('page')) || 1))

      const q = String(url.searchParams.get('q') || '').trim()
      const inboxId = parsePositiveInteger(url.searchParams.get('inbox_id'))
      if (q) params.set('q', q.slice(0, 120))
      if (inboxId) params.set('inbox_id', String(inboxId))

      const payload = await chatwootFetch(chatwootConfig, `/conversations?${params.toString()}`)
      return json(payload)
    }

    const messagesMatch = /^conversations\/(\d+)\/messages$/.exec(route)
    if (messagesMatch && request.method === 'GET') {
      const conversationId = messagesMatch[1]
      const payload = await chatwootFetch(chatwootConfig, `/conversations/${conversationId}/messages`)
      return json(payload)
    }

    if (messagesMatch && request.method === 'POST') {
      const conversationId = messagesMatch[1]
      const body = await request.json().catch(() => ({}))
      const content = String(body.content || '').trim()
      if (!content) {
        return json({ error: 'Reply content is required.' }, { status: 400 })
      }

      const conversation = await chatwootFetch(chatwootConfig, `/conversations/${conversationId}`)
      const shouldBridgeToZernio = isZernioBackedConversation(conversation) && !body.private
      const shouldRunContentPartner = isContentPartnerConversation(conversation) && !body.private
      let zernioResult = null

      if (shouldRunContentPartner) {
        await assignChatwootContentPartnerConversation(env, conversation, auth.user).catch((error) => {
          console.warn('Content Partner conversation assignment skipped.', sanitizeChatwootError(error?.message || error))
        })
      }

      if (shouldBridgeToZernio) {
        zernioResult = await sendZernioConversationReply(env, conversation, content)
      }

      const payload = await chatwootFetch(chatwootConfig, `/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: content.slice(0, 5000),
          message_type: 'outgoing',
          private: Boolean(body.private),
          content_type: 'text',
          source_id: zernioResult?.messageId ? `zernio:${zernioResult.messageId}` : undefined,
          content_attributes: zernioResult ? {
            zernio_bridge_sent: true,
            zernio_message_id: zernioResult.messageId || null,
          } : {},
        }),
      })
      if (shouldRunContentPartner) {
        const createdMessage = extractChatwootRecord(payload) || {}
        const contentPartnerMessage = {
          ...createdMessage,
          id: firstString(createdMessage.id, createdMessage.source_id),
          conversation_id: firstString(createdMessage.conversation_id, conversationId),
          inbox_id: createdMessage.inbox_id || conversation?.inbox_id || null,
          content: firstString(createdMessage.content, content),
          message_type: 'outgoing',
          private: false,
          sender: createdMessage.sender || {
            id: auth.user?.id || null,
            name: auth.user?.email || 'Portal user',
          },
        }
        const contentPartnerResult = await processContentPartnerMessage(
          env,
          auth.envConfig,
          { message: contentPartnerMessage, conversation },
          contentPartnerMessage,
          conversation,
          auth.bearerToken,
        )
        const responsePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
          ? { ...payload }
          : { payload }
        responsePayload.contentPartner = {
          deduped: Boolean(contentPartnerResult?.deduped),
          requestId: contentPartnerResult?.requestId || null,
          draftId: contentPartnerResult?.draftId || null,
        }
        return json(responsePayload)
      }
      return json(payload)
    }

    const statusMatch = /^conversations\/(\d+)\/status$/.exec(route)
    if (statusMatch && request.method === 'POST') {
      const conversationId = statusMatch[1]
      const body = await request.json().catch(() => ({}))
      const status = String(body.status || '').trim().toLowerCase()
      const allowedStatuses = new Set(['open', 'resolved', 'pending'])
      if (!allowedStatuses.has(status)) {
        return json({ error: 'Status must be open, pending, or resolved.' }, { status: 400 })
      }

      const payload = await chatwootFetch(chatwootConfig, `/conversations/${conversationId}/toggle_status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      return json(payload)
    }

    return json({ error: 'Chatwoot route not found.' }, { status: 404 })
  } catch (error) {
    const status = error?.status || (String(error?.message || '').includes('not configured') ? 503 : 502)
    return json({ error: sanitizeChatwootError(error?.message) }, { status })
  }
}

function getChatwootSocialInboxId(env) {
  const configured = getChatwootConfig(env).socialInboxId
  if (configured) return configured
  return null
}

async function resolveChatwootSocialInbox(env) {
  const configuredId = getChatwootSocialInboxId(env)
  if (configuredId) return { id: configuredId }

  const inboxes = await chatwootFetch(env, '/inboxes')
  const payload = Array.isArray(inboxes?.payload) ? inboxes.payload : (Array.isArray(inboxes) ? inboxes : [])
  const socialInbox = payload.find((inbox) => (
    String(inbox?.name || '').trim().toLowerCase() === DEFAULT_CHATWOOT_SOCIAL_INBOX_NAME.toLowerCase()
    && String(inbox?.channel_type || '').toLowerCase().includes('api')
  ))

  if (!socialInbox?.id) {
    throw new Error('Chatwoot Social Inbox API channel is not configured.')
  }

  return socialInbox
}

function getConversationCustomAttributes(conversation) {
  return conversation?.custom_attributes || conversation?.payload?.custom_attributes || {}
}

function isZernioBackedConversation(conversation) {
  const attrs = getConversationCustomAttributes(conversation)
  return Boolean(attrs?.zernio_conversation_id && attrs?.zernio_account_id)
}

function buildContentPartnerIdentifier(clientId) {
  return `map-content-partner:${clientId}`.slice(0, 255)
}

function isContentPartnerConversation(conversation) {
  const attrs = getConversationCustomAttributes(conversation)
  const additional = conversation?.additional_attributes || conversation?.payload?.additional_attributes || {}
  const senderIdentifier = firstString(
    conversation?.meta?.sender?.identifier,
    conversation?.contact?.identifier,
    conversation?.contact_inbox?.source_id,
  )
  return attrs?.source === 'map_content_partner'
    || attrs?.map_content_partner === true
    || additional?.source === 'map_content_partner'
    || senderIdentifier.startsWith('map-content-partner:')
}

function isContentPartnerAutomationMessage(message) {
  const attrs = message?.content_attributes || {}
  const sourceId = firstString(message?.source_id)

  return attrs?.map_content_partner_reply === true
    || attrs?.map_content_partner_system === true
    || sourceId.startsWith('map-content-partner:reply:')
    || sourceId.startsWith('map-content-partner:greeting:')
}

function shouldProcessContentPartnerWebhookMessage(message, conversation) {
  if (!isContentPartnerConversation(conversation)) return false
  if (message?.private) return false
  if (isContentPartnerAutomationMessage(message)) return false

  const hasContent = Boolean(firstString(message?.content))
  const hasAttachments = normalizeChatwootMessageAttachments({}, message).length > 0
  return hasContent || hasAttachments
}

async function ensureChatwootContactInbox(env, contact, inboxId, sourceId) {
  if (!contact?.id) return contact
  if (getContactInboxSourceId(contact, inboxId)) return contact

  try {
    await chatwootFetch(env, `/contacts/${contact.id}/contact_inboxes`, {
      method: 'POST',
      body: JSON.stringify({
        inbox_id: inboxId,
        source_id: sourceId,
      }),
    })
  } catch (error) {
    if (error?.status !== 422 && error?.status !== 409) throw error
  }

  return findChatwootContactByIdentifier(env, sourceId)
}

async function findOrCreateChatwootContentPartnerContact(env, inboxId, envConfig) {
  const identifier = buildContentPartnerIdentifier(envConfig.clientId)
  const existing = await findChatwootContactByIdentifier(env, identifier)
  if (existing?.id) return ensureChatwootContactInbox(env, existing, inboxId, identifier)

  const created = await chatwootFetch(env, '/contacts', {
    method: 'POST',
    body: JSON.stringify({
      inbox_id: inboxId,
      name: CONTENT_PARTNER_CONTACT_NAME,
      identifier,
      additional_attributes: {
        source: 'map_content_partner',
      },
      custom_attributes: {
        source: 'map_content_partner',
        map_content_partner: true,
        portal_client_id: envConfig.clientId,
      },
    }),
  })

  const contact = Array.isArray(created?.payload) ? created.payload[0] : created?.payload || created
  if (contact?.id) return ensureChatwootContactInbox(env, contact, inboxId, identifier)

  return findChatwootContactByIdentifier(env, identifier)
}

async function findChatwootContentPartnerConversation(env, contactId, inboxId, envConfig) {
  const payload = await chatwootFetch(env, `/contacts/${contactId}/conversations`)
  const conversations = Array.isArray(payload?.payload) ? payload.payload : (Array.isArray(payload) ? payload : [])
  return conversations.find((conversation) => (
    Number(conversation?.inbox_id) === Number(inboxId)
    && isContentPartnerConversation(conversation)
    && String(getConversationCustomAttributes(conversation)?.portal_client_id || '') === String(envConfig.clientId)
    && String(conversation?.status || '').toLowerCase() !== 'resolved'
  )) || conversations.find((conversation) => (
    Number(conversation?.inbox_id) === Number(inboxId)
    && isContentPartnerConversation(conversation)
  )) || null
}

async function createChatwootContentPartnerConversation(env, contact, inboxId, envConfig) {
  const sourceId = getContactInboxSourceId(contact, inboxId) || buildContentPartnerIdentifier(envConfig.clientId)
  const conversation = await chatwootFetch(env, '/conversations', {
    method: 'POST',
    body: JSON.stringify({
      source_id: sourceId,
      inbox_id: inboxId,
      contact_id: contact.id,
      status: 'open',
      custom_attributes: {
        source: 'map_content_partner',
        map_content_partner: true,
        portal_client_id: envConfig.clientId,
      },
      additional_attributes: {
        source: 'map_content_partner',
      },
    }),
  })

  const conversationId = conversation?.id || conversation?.payload?.id
  if (conversationId) {
    await chatwootFetch(env, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: 'Send me a rough note, photos, or both. I will turn it into a Publisher draft for you to review before anything posts.',
        message_type: 'incoming',
        private: false,
        content_type: 'text',
        source_id: `map-content-partner:greeting:${envConfig.clientId}`,
        content_attributes: {
          map_content_partner_system: true,
        },
      }),
    })
  }

  return conversation
}

function getChatwootAgentId(agent) {
  return parsePositiveInteger(firstString(
    agent?.id,
    agent?.user_id,
    agent?.user?.id,
  ))
}

function getChatwootAgentEmail(agent) {
  return normalizeEmail(firstString(
    agent?.email,
    agent?.user?.email,
  ))
}

function getChatwootConversationId(conversation) {
  return parsePositiveInteger(firstString(
    conversation?.id,
    conversation?.payload?.id,
  ))
}

function getChatwootConversationStatus(conversation) {
  return firstString(
    conversation?.status,
    conversation?.payload?.status,
  ).toLowerCase()
}

function getChatwootConversationAssigneeId(conversation) {
  return parsePositiveInteger(firstString(
    conversation?.assignee_id,
    conversation?.payload?.assignee_id,
    conversation?.meta?.assignee?.id,
    conversation?.payload?.meta?.assignee?.id,
    conversation?.assignee?.id,
    conversation?.payload?.assignee?.id,
  ))
}

async function findChatwootAgentByEmail(env, email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const payload = await chatwootFetch(env, '/agents')
  const agents = Array.isArray(payload?.payload) ? payload.payload : (Array.isArray(payload) ? payload : [])
  return agents.find((agent) => getChatwootAgentEmail(agent) === normalizedEmail) || null
}

async function assignChatwootContentPartnerConversation(env, conversation, portalUser) {
  const conversationId = getChatwootConversationId(conversation)
  const portalEmail = normalizeEmail(portalUser?.email)
  if (!conversationId || !portalEmail) {
    return { assigned: false, alreadyAssigned: false, reason: 'missing_conversation_or_user' }
  }

  const agent = await findChatwootAgentByEmail(env, portalEmail)
  const assigneeId = getChatwootAgentId(agent)
  if (!assigneeId) {
    return { assigned: false, alreadyAssigned: false, reason: 'chatwoot_agent_not_found' }
  }

  if (getChatwootConversationAssigneeId(conversation) === assigneeId) {
    return { assigned: false, alreadyAssigned: true, assigneeId }
  }

  await chatwootFetch(env, `/conversations/${conversationId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ assignee_id: assigneeId }),
  })

  return { assigned: true, alreadyAssigned: false, assigneeId }
}

async function ensureChatwootConversationOpen(env, conversation) {
  const conversationId = getChatwootConversationId(conversation)
  if (!conversationId || getChatwootConversationStatus(conversation) === 'open') {
    return { reopened: false }
  }

  await chatwootFetch(env, `/conversations/${conversationId}/toggle_status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'open' }),
  })

  return { reopened: true, conversationId }
}

async function findOrCreateChatwootContentPartnerConversation(env, envConfig, portalUser = null) {
  const inbox = await resolveChatwootSocialInbox(env)
  const contact = await findOrCreateChatwootContentPartnerContact(env, inbox.id, envConfig)
  if (!contact?.id) throw new Error('Could not create MAP Content Partner contact.')

  const existing = await findChatwootContentPartnerConversation(env, contact.id, inbox.id, envConfig)
  if (existing?.id) {
    const reopen = await ensureChatwootConversationOpen(env, existing).catch((error) => ({
      reopened: false,
      reason: sanitizeChatwootError(error?.message || 'Could not reopen Content Partner conversation.'),
    }))
    const assignment = await assignChatwootContentPartnerConversation(env, existing, portalUser).catch((error) => ({
      assigned: false,
      alreadyAssigned: false,
      reason: sanitizeChatwootError(error?.message || 'Could not assign Content Partner conversation.'),
    }))
    return { conversation: existing, contact, inbox, assignment, reopen }
  }

  const conversation = await createChatwootContentPartnerConversation(env, contact, inbox.id, envConfig)
  const assignment = await assignChatwootContentPartnerConversation(env, conversation, portalUser).catch((error) => ({
    assigned: false,
    alreadyAssigned: false,
    reason: sanitizeChatwootError(error?.message || 'Could not assign Content Partner conversation.'),
  }))
  return { conversation, contact, inbox, assignment }
}

async function contentPartnerReplyExists(env, conversationId, triggerMessageId) {
  if (!conversationId || !triggerMessageId) return false
  const payload = await chatwootFetch(env, `/conversations/${conversationId}/messages`)
  const messages = Array.isArray(payload?.payload) ? payload.payload : (Array.isArray(payload) ? payload : [])
  return messages.some((message) => (
    String(message?.content_attributes?.map_content_partner_trigger_message_id || '') === String(triggerMessageId)
    || String(message?.source_id || '') === `map-content-partner:${triggerMessageId}`
    || String(message?.source_id || '') === `map-content-partner:reply:${triggerMessageId}`
  ))
}

function extractChatwootRecord(payload) {
  if (Array.isArray(payload?.payload)) return payload.payload[0] || null
  if (payload?.payload && typeof payload.payload === 'object') return payload.payload
  if (payload?.message && typeof payload.message === 'object') return payload.message
  return payload && typeof payload === 'object' ? payload : null
}

function getPortalReviewUrl(env, draftId, envConfig = null) {
  const canonicalHost = getCanonicalPortalHost(env)
  const path = draftId ? `/post?draftId=${encodeURIComponent(draftId)}` : '/post'
  const basePath = getPortalBasePath(envConfig)
  return canonicalHost ? `https://${canonicalHost}${basePath}${path}` : `${basePath}${path}`
}

function getPortalBasePath(envConfig = null) {
  const slug = String(envConfig?.clientSlug || '').trim().toLowerCase()
  const prefix = getSharedPortalPathPrefix({})
  return slug ? `/${prefix}/${slug}` : ''
}

function getPortalOrigin(env, envConfig = null) {
  const canonicalHost = getCanonicalPortalHost(env)
  if (!canonicalHost) return ''
  return `https://${canonicalHost}${getPortalBasePath(envConfig)}`
}

function getContentPartnerPreviewUrl(env, draftId, requestId, envConfig = null) {
  const origin = getPortalOrigin(env, envConfig)
  if (!origin || !draftId || !requestId) return ''
  const path = `/api/content-partner/previews/${encodeURIComponent(draftId)}.svg`
  return `${origin}${path}?token=${encodeURIComponent(requestId)}`
}

function uuidToShortToken(uuid) {
  const normalized = String(uuid || '').trim().toLowerCase()
  if (!isUuidLike(normalized)) return ''
  const hex = normalized.replace(/-/g, '')
  let binary = ''
  for (let index = 0; index < hex.length; index += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function shortTokenToUuid(token) {
  const normalized = String(token || '').trim().replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return ''
  const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`
  let binary = ''
  try {
    binary = atob(padded)
  } catch {
    return ''
  }
  if (binary.length !== 16) return ''
  const hex = Array.from(binary, (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function getContentPartnerReviewUrl(env, draftId, requestId, envConfig = null) {
  const origin = getPortalOrigin(env, envConfig)
  if (!origin || !draftId || !requestId) return ''
  const shortToken = uuidToShortToken(requestId)
  if (shortToken) return `${origin}/r/${encodeURIComponent(shortToken)}`
  return `${origin}/content-preview/${encodeURIComponent(draftId)}?token=${encodeURIComponent(requestId)}`
}

function getContentPartnerQuickFixUrl(env, requestId, action, envConfig = null) {
  const origin = getPortalOrigin(env, envConfig)
  const shortToken = uuidToShortToken(requestId)
  const normalizedAction = String(action || '').trim().toLowerCase()
  if (!origin || !shortToken || !normalizedAction) return ''
  return `${origin}/f/${encodeURIComponent(shortToken)}/${encodeURIComponent(normalizedAction)}`
}

function normalizeChatwootMessageAttachments(payload, message) {
  if (Array.isArray(message?.attachments)) return message.attachments
  if (Array.isArray(payload?.attachments)) return payload.attachments
  if (Array.isArray(payload?.message?.attachments)) return payload.message.attachments
  return []
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function wrapPreviewText(value, maxChars, maxLines) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }

    if (lines.length === maxLines) break
  }

  if (lines.length < maxLines && current) lines.push(current)
  const consumedLength = lines.join(' ').length
  const sourceLength = words.join(' ').length
  if (sourceLength > consumedLength && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?-]+$/, '')}...`
  }

  return lines.length ? lines : ['Ready for review.']
}

function formatPreviewDate(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 'Ready to schedule'

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function extractMediaSuggestionFromDraft(draft) {
  const reviewNotes = parseJsonObject(draft?.review_notes)
  if (reviewNotes.mediaSuggestion) return firstString(reviewNotes.mediaSuggestion)

  const requirements = Array.isArray(draft?.asset_requirements_json) ? draft.asset_requirements_json : []
  const mediaConcept = requirements.find((item) => item?.type === 'media_concept' && item?.suggestion)
  return firstString(mediaConcept?.suggestion)
}

function normalizePreviewPlatforms(value) {
  const platforms = Array.isArray(value) ? value : []
  return platforms
    .map((platform) => normalizePlatform(platform) || String(platform || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5)
}

function renderTextLines(lines, { x, y, lineHeight, size, weight = 500, color = '#1f1f1f', letterSpacing = 0 }) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + (index * lineHeight)}" font-size="${size}" font-weight="${weight}" fill="${color}" letter-spacing="${letterSpacing}">${escapeSvgText(line)}</text>`
  )).join('')
}

function renderPreviewPlatformChips(platforms, x, y) {
  const labels = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
    twitter: 'X',
  }
  const colors = {
    facebook: '#2f6ecb',
    instagram: '#c13584',
    tiktok: '#111111',
    linkedin: '#0a66c2',
    twitter: '#111111',
  }
  const items = normalizePreviewPlatforms(platforms)
  const chips = items.length ? items : ['facebook', 'instagram']

  let offset = 0
  return chips.map((platform) => {
    const label = labels[platform] || platform.replace(/_/g, ' ')
    const width = Math.max(104, Math.min(168, 46 + (label.length * 12)))
    const chip = [
      `<rect x="${x + offset}" y="${y}" width="${width}" height="44" rx="16" fill="${colors[platform] || '#70e4ff'}" opacity="0.18"/>`,
      `<circle cx="${x + offset + 24}" cy="${y + 22}" r="10" fill="${colors[platform] || '#6b7280'}"/>`,
      `<text x="${x + offset + 44}" y="${y + 29}" font-size="20" font-weight="800" fill="#dbe3f4">${escapeSvgText(label)}</text>`,
    ].join('')
    offset += width + 14
    return chip
  }).join('')
}

function renderContentPartnerPreviewSvg({
  businessName,
  title,
  caption,
  scheduledFor,
  platforms,
  mediaSuggestion,
} = {}) {
  const name = firstString(businessName, 'Your business')
  const draftTitle = firstString(title, 'Publisher draft')
  const captionText = firstString(caption, 'A new social post draft is ready for review.')
  const mediaText = firstString(mediaSuggestion, 'Add or choose the best image before scheduling.')
  const titleLines = wrapPreviewText(draftTitle, 34, 2)
  const captionLines = wrapPreviewText(captionText, 64, 5)
  const mediaLines = wrapPreviewText(mediaText, 62, 1)
  const scheduleLabel = formatPreviewDate(scheduledFor)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07090f"/>
      <stop offset="0.54" stop-color="#0b0e18"/>
      <stop offset="1" stop-color="#0f1320"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#172037" stop-opacity="0.98"/>
      <stop offset="1" stop-color="#101627" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#70e4ff"/>
      <stop offset="0.52" stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#988cff"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000000" flood-opacity="0.42"/>
    </filter>
  </defs>
  <rect width="1200" height="900" fill="url(#page)"/>
  <path d="M0 118 H1200 M0 238 H1200 M0 358 H1200 M0 478 H1200 M0 598 H1200 M0 718 H1200 M120 0 V900 M240 0 V900 M360 0 V900 M480 0 V900 M600 0 V900 M720 0 V900 M840 0 V900 M960 0 V900 M1080 0 V900" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
  <rect x="72" y="58" width="1056" height="784" rx="22" fill="url(#panel)" filter="url(#shadow)"/>
  <rect x="72" y="58" width="1056" height="784" rx="22" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
  <rect x="106" y="92" width="988" height="124" rx="18" fill="#ffffff" opacity="0.055"/>
  <rect x="126" y="116" width="76" height="76" rx="18" fill="url(#accent)"/>
  <text x="164" y="164" text-anchor="middle" font-size="25" font-weight="900" fill="#071018">MAP</text>
  <text x="230" y="142" font-size="27" font-weight="800" fill="#f5f7fb">${escapeSvgText(name)}</text>
  <text x="230" y="176" font-size="20" font-weight="600" fill="#a6afc2">Content Partner draft preview</text>
  <rect x="814" y="122" width="232" height="58" rx="16" fill="#70e4ff" fill-opacity="0.12" stroke="#70e4ff" stroke-opacity="0.34" stroke-width="2"/>
  <text x="930" y="158" text-anchor="middle" font-size="21" font-weight="850" fill="#dbe3f4">Manual review</text>
  <text x="112" y="275" font-size="18" font-weight="800" fill="#70e4ff">PUBLISHER DRAFT</text>
  ${renderTextLines(titleLines, { x: 112, y: 338, lineHeight: 58, size: 50, weight: 900, color: '#f5f7fb' })}
  <rect x="112" y="516" width="976" height="216" rx="18" fill="#ffffff" fill-opacity="0.065" stroke="#ffffff" stroke-opacity="0.13" stroke-width="2"/>
  <text x="146" y="562" font-size="18" font-weight="800" fill="#70e4ff">POST COPY</text>
  ${renderTextLines(captionLines, { x: 146, y: 606, lineHeight: 29, size: 24, weight: 500, color: '#dbe3f4' })}
  <line x1="112" y1="744" x2="1088" y2="744" stroke="#ffffff" stroke-opacity="0.13" stroke-width="2"/>
  <text x="112" y="778" font-size="18" font-weight="800" fill="#70e4ff">SUGGESTED TIME</text>
  <text x="112" y="814" font-size="28" font-weight="800" fill="#f5f7fb">${escapeSvgText(scheduleLabel)}</text>
  <text x="512" y="778" font-size="18" font-weight="800" fill="#70e4ff">IMAGE IDEA</text>
  ${renderTextLines(mediaLines, { x: 512, y: 814, lineHeight: 26, size: 21, weight: 600, color: '#a6afc2' })}
  ${renderPreviewPlatformChips(platforms, 112, 454)}
</svg>`
}

async function loadContentPartnerPreview(envConfig, draftId, requestId) {
  if (!isUuidLike(draftId) || !isUuidLike(requestId)) return null

  const requestParams = new URLSearchParams({
    select: 'id,generated_draft_id,ai_metadata_json,created_at',
    id: `eq.${requestId}`,
    generated_draft_id: `eq.${draftId}`,
    client_id: `eq.${envConfig.clientId}`,
    limit: '1',
  })
  const requestRowsResponse = await supabaseRest(envConfig, `/rest/v1/content_partner_requests?${requestParams.toString()}`)
  const requestRows = await requestRowsResponse.json()
  const requestRow = Array.isArray(requestRows) ? requestRows[0] : null
  if (!requestRow?.id) return null

  const draftParams = new URLSearchParams({
    select: 'id,draft_title,draft_caption,scheduled_for,review_notes,asset_requirements_json,client_id',
    id: `eq.${draftId}`,
    client_id: `eq.${envConfig.clientId}`,
    limit: '1',
  })
  const draftRowsResponse = await supabaseRest(envConfig, `/rest/v1/social_drafts?${draftParams.toString()}`)
  const draftRows = await draftRowsResponse.json()
  const draft = Array.isArray(draftRows) ? draftRows[0] : null
  if (!draft?.id) return null

  const clientParams = new URLSearchParams({
    select: 'business_name,slug',
    id: `eq.${envConfig.clientId}`,
    limit: '1',
  })
  const clientRowsResponse = await supabaseRest(envConfig, `/rest/v1/clients?${clientParams.toString()}`)
  const clientRows = await clientRowsResponse.json()
  const client = Array.isArray(clientRows) ? clientRows[0] || {} : {}
  const aiMeta = parseJsonObject(requestRow.ai_metadata_json)

  return {
    businessName: firstString(client.business_name, client.slug),
    title: draft.draft_title,
    caption: draft.draft_caption,
    scheduledFor: draft.scheduled_for,
    mediaSuggestion: extractMediaSuggestionFromDraft(draft),
    platforms: normalizePreviewPlatforms(aiMeta.recommendedPlatforms),
  }
}

async function handleContentPartnerPreview(request, env, draftId) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD' } })
  }

  const url = new URL(request.url)
  const requestId = String(url.searchParams.get('token') || '').trim()
  if (!draftId || !requestId) return json({ error: 'Preview token is required.' }, { status: 400 })

  let envConfig
  try {
    envConfig = await getPortalWebhookConfig(request, env)
  } catch (error) {
    return json({ error: error.message || 'Portal preview is not configured.' }, { status: 500 })
  }

  try {
    const preview = await loadContentPartnerPreview(envConfig, draftId, requestId)
    if (!preview) return json({ error: 'Preview was not found.' }, { status: 404 })
    const contentType = 'image/svg+xml; charset=utf-8'

    if (request.method === 'HEAD') {
      return new Response(null, {
        headers: {
          'content-type': contentType,
          'cache-control': 'private, max-age=900',
        },
      })
    }

    return new Response(renderContentPartnerPreviewSvg(preview), {
      headers: {
        'content-type': contentType,
        'cache-control': 'private, max-age=900',
      },
    })
  } catch (error) {
    return json({ error: error.message || 'Could not render the preview.' }, { status: error?.status || 502 })
  }
}

function htmlResponse(markup, init = {}) {
  return new Response(markup, {
    ...init,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...(init.headers || {}),
    },
  })
}

function platformLabel(platform) {
  const labels = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
    twitter: 'X / Twitter',
  }
  return labels[platform] || String(platform || '').replace(/_/g, ' ')
}

function formatReviewDate(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 'Ready to schedule'
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function jsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function extractReviewMediaAssets(draft) {
  const reviewNotes = parseJsonObject(draft?.review_notes)
  const requirements = jsonArray(draft?.asset_requirements_json)
  const assets = []
  const seen = new Set()

  const addAsset = (asset = {}) => {
    const url = firstString(asset.url, asset.link, asset.download_url, asset.file_url, asset.data_url)
    if (!url || seen.has(url)) return
    seen.add(url)
    assets.push({
      url,
      name: firstString(asset.name, asset.fileName, asset.filename, asset.suggestion, 'Attached media'),
      thumbnail: firstString(asset.thumbnail, asset.thumb_url, asset.previewUrl),
      contentType: firstString(asset.contentType, asset.content_type, asset.file_type),
    })
  }

  jsonArray(reviewNotes.mediaAssets).forEach(addAsset)
  requirements
    .filter((item) => item?.type === 'source_media' || item?.url)
    .forEach(addAsset)

  return assets
}

function normalizeReviewPlatforms(aiMeta, reviewNotes) {
  const fromAi = normalizePreviewPlatforms(aiMeta?.recommendedPlatforms)
  if (fromAi.length) return fromAi
  const fromNotes = normalizePreviewPlatforms(reviewNotes?.recommendedPlatforms)
  if (fromNotes.length) return fromNotes
  return ['facebook', 'instagram']
}

async function loadContentPartnerReview(envConfig, draftId, requestId) {
  if (!isUuidLike(draftId) || !isUuidLike(requestId)) return null

  const requestParams = new URLSearchParams({
    select: 'id,client_id,chatwoot_conversation_id,chatwoot_message_id,generated_draft_id,status,ai_metadata_json,created_at',
    id: `eq.${requestId}`,
    generated_draft_id: `eq.${draftId}`,
    client_id: `eq.${envConfig.clientId}`,
    limit: '1',
  })
  const requestRowsResponse = await supabaseRest(envConfig, `/rest/v1/content_partner_requests?${requestParams.toString()}`)
  const requestRows = await requestRowsResponse.json()
  const requestRow = Array.isArray(requestRows) ? requestRows[0] : null
  if (!requestRow?.id) return null

  const draftParams = new URLSearchParams({
    select: 'id,client_id,draft_title,draft_body,draft_caption,scheduled_for,review_notes,asset_requirements_json,review_state,approved_at,published_reference,source_workflow,created_at',
    id: `eq.${draftId}`,
    client_id: `eq.${envConfig.clientId}`,
    limit: '1',
  })
  const draftRowsResponse = await supabaseRest(envConfig, `/rest/v1/social_drafts?${draftParams.toString()}`)
  const draftRows = await draftRowsResponse.json()
  const draft = Array.isArray(draftRows) ? draftRows[0] : null
  if (!draft?.id) return null

  const clientParams = new URLSearchParams({
    select: 'id,business_name,slug,portal_domain',
    id: `eq.${envConfig.clientId}`,
    limit: '1',
  })
  const clientRowsResponse = await supabaseRest(envConfig, `/rest/v1/clients?${clientParams.toString()}`)
  const clientRows = await clientRowsResponse.json()
  const client = Array.isArray(clientRows) ? clientRows[0] || {} : {}
  const aiMeta = parseJsonObject(requestRow.ai_metadata_json)
  const reviewNotes = parseJsonObject(draft.review_notes)

  return {
    request: requestRow,
    draft,
    client,
    aiMeta,
    reviewNotes,
    businessName: firstString(client.business_name, client.slug, 'Your business'),
    title: firstString(draft.draft_title, 'Publisher draft'),
    caption: firstString(draft.draft_caption, draft.draft_body, 'A new social post draft is ready for review.'),
    scheduledFor: draft.scheduled_for,
    mediaSuggestion: extractMediaSuggestionFromDraft(draft),
    mediaAssets: extractReviewMediaAssets(draft),
    platforms: normalizeReviewPlatforms(aiMeta, reviewNotes),
  }
}

function renderQuickReviewPage(env, context) {
  const envConfig = { clientId: context.client?.id, clientSlug: context.client?.slug }
  const approveUrl = `${getPortalBasePath(envConfig)}/api/content-partner/reviews/${encodeURIComponent(context.draft.id)}/approve?token=${encodeURIComponent(context.request.id)}`
  const editorUrl = getPortalReviewUrl(env, context.draft.id, envConfig)
  const previewUrl = getContentPartnerPreviewUrl(env, context.draft.id, context.request.id, envConfig)
  const simplifyUrl = getContentPartnerQuickFixUrl(env, context.request.id, 's', envConfig)
  const polishUrl = getContentPartnerQuickFixUrl(env, context.request.id, 'p', envConfig)
  const imageUrl = getContentPartnerQuickFixUrl(env, context.request.id, 'i', envConfig)
  const alreadyScheduled = Boolean(context.draft.published_reference)
  const platformChips = context.platforms.map((platform) => (
    `<span class="chip">${escapeHtml(platformLabel(platform))}</span>`
  )).join('')
  const firstMedia = context.mediaAssets[0]
  const mediaHtml = firstMedia?.url
    ? `<img class="media" src="${escapeHtml(firstMedia.thumbnail || firstMedia.url)}" alt="${escapeHtml(firstMedia.name || 'Selected media')}">`
    : `<img class="preview" src="${escapeHtml(previewUrl)}" alt="Publisher draft preview">`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(context.title)} · MAP Content Partner</title>
  <style>
    :root { color-scheme: dark; --ink:#f5f7fb; --muted:#a6afc2; --soft:#dbe3f4; --line:rgba(255,255,255,.12); --line-strong:rgba(255,255,255,.2); --paper:rgba(16,22,39,.78); --paper-strong:rgba(23,32,55,.92); --cyan:#70e4ff; --blue:#38bdf8; --purple:#988cff; --magenta:#ff7ab8; --dark:#07090f; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 50% -12%, rgba(112,228,255,.22), transparent 33rem), radial-gradient(circle at 85% 18%, rgba(56,189,248,.14), transparent 25rem), radial-gradient(circle at 12% 36%, rgba(152,140,255,.13), transparent 24rem), linear-gradient(180deg,#07090f 0%,#0b0e18 54%,#0f1320 100%); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body::before { content:""; position:fixed; inset:0; pointer-events:none; background-image:linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size:32px 32px; mask-image:linear-gradient(180deg, rgba(0,0,0,.36), transparent 82%); }
    main { position:relative; width: min(980px, calc(100vw - 28px)); margin: 18px auto; background: var(--paper); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; box-shadow: 0 34px 90px rgba(0,0,0,.45); backdrop-filter: blur(18px); }
    header { display: flex; justify-content: space-between; gap: 18px; padding: 28px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg,rgba(23,32,55,.92),rgba(16,22,39,.72)); }
    .eyebrow { margin: 0 0 8px; color: var(--cyan); font-size: 13px; font-weight: 900; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(34px, 6vw, 64px); line-height: 0.97; letter-spacing: 0; max-width: 760px; }
    .badge { align-self: flex-start; white-space: nowrap; border: 1px solid rgba(112,228,255,.36); background: rgba(112,228,255,.12); color: var(--soft); border-radius: 999px; padding: 11px 15px; font-weight: 900; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.65fr); gap: 0; }
    .copy { padding: 28px; border-right: 1px solid var(--line); }
    .side { padding: 28px; background: rgba(255,255,255,.045); }
    label { display: block; margin: 0 0 12px; color: var(--cyan); font-size: 13px; font-weight: 900; text-transform: uppercase; }
    .caption { white-space: pre-wrap; border: 1px solid var(--line); border-radius: 16px; background: rgba(255,255,255,.055); padding: 20px; font-size: 22px; line-height: 1.45; color: var(--soft); }
    .meta { display: grid; gap: 18px; margin-top: 22px; padding-top: 22px; border-top: 1px solid var(--line); }
    .value { margin: 0; color: var(--soft); font-size: 19px; line-height: 1.45; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; }
    .chip { display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid rgba(152,140,255,.32); background: rgba(152,140,255,.12); color: var(--soft); padding: 8px 12px; font-weight: 900; }
    .media, .preview { width: 100%; display: block; border-radius: 16px; border: 1px solid var(--line); background: rgba(7,9,15,.55); object-fit: contain; max-height: 430px; }
    .actions { display: grid; gap: 12px; margin-top: 22px; }
    .quick { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top: 22px; }
    button, .secondary { width: 100%; border-radius: 16px; padding: 16px 18px; font: inherit; font-size: 18px; font-weight: 950; text-align: center; text-decoration: none; cursor: pointer; }
    button { border: 1px solid rgba(112,228,255,.42); background: linear-gradient(135deg,var(--cyan),var(--blue)); color: #071018; box-shadow: 0 18px 36px rgba(56,189,248,.22); }
    button:disabled { cursor: default; opacity: 0.58; box-shadow: none; }
    .secondary { display: block; border: 1px solid var(--line); background: rgba(255,255,255,.055); color: var(--ink); }
    .quick a { display:flex; min-height:52px; align-items:center; justify-content:center; border:1px solid var(--line); border-radius:14px; background:rgba(255,255,255,.055); color:var(--soft); text-align:center; text-decoration:none; font-weight:900; font-size:14px; line-height:1.15; }
    .note { margin: 12px 0 0; color: var(--muted); font-size: 14px; line-height: 1.45; }
    @media (max-width: 760px) {
      main { width: 100%; min-height: 100vh; margin: 0; border-radius: 0; border-left: 0; border-right: 0; }
      header, .grid { display: block; }
      header { padding: 22px; }
      .badge { display: inline-flex; margin-top: 16px; }
      .copy, .side { padding: 22px; border-right: 0; }
      .copy { border-bottom: 1px solid var(--line); }
      .quick { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="eyebrow">${escapeHtml(context.businessName)} · Content Partner</p>
        <h1>${escapeHtml(context.title)}</h1>
      </div>
      <div class="badge">${alreadyScheduled ? 'Scheduled' : 'Ready for approval'}</div>
    </header>
    <section class="grid">
      <div class="copy">
        <label>Post copy</label>
        <div class="caption">${escapeHtml(context.caption)}</div>
        <div class="meta">
          <div>
            <label>Recommended time</label>
            <p class="value">${escapeHtml(formatReviewDate(context.scheduledFor))}</p>
          </div>
          <div>
            <label>Publishing to</label>
            <div class="chips">${platformChips}</div>
          </div>
          <div>
            <label>Image idea</label>
            <p class="value">${escapeHtml(context.mediaSuggestion)}</p>
          </div>
        </div>
      </div>
      <aside class="side">
        ${mediaHtml}
        <div class="quick">
          ${simplifyUrl ? `<a href="${escapeHtml(simplifyUrl)}">Simplify text</a>` : ''}
          ${polishUrl ? `<a href="${escapeHtml(polishUrl)}">Polish tone</a>` : ''}
          ${imageUrl ? `<a href="${escapeHtml(imageUrl)}">Fix image idea</a>` : ''}
        </div>
        <div class="actions">
          <form method="post" action="${escapeHtml(approveUrl)}">
            <button type="submit" ${alreadyScheduled ? 'disabled' : ''}>${alreadyScheduled ? 'Already scheduled' : 'Approve and schedule'}</button>
          </form>
          ${editorUrl ? `<a class="secondary" href="${escapeHtml(editorUrl)}">Open full editor</a>` : ''}
        </div>
        <p class="note">Approving schedules this draft at the recommended time. Need changes first? Use the full editor.</p>
      </aside>
    </section>
  </main>
</body>
</html>`
}

function renderQuickReviewResultPage({ title, message, linkHref = '', linkLabel = 'Back to preview', ok = true }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at 50% -12%, rgba(112,228,255,.22), transparent 33rem), radial-gradient(circle at 85% 18%, rgba(56,189,248,.14), transparent 25rem), linear-gradient(180deg,#07090f 0%,#0b0e18 54%,#0f1320 100%); color:#f5f7fb; font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    section { width:min(680px, calc(100vw - 32px)); background:rgba(16,22,39,.78); border:1px solid rgba(255,255,255,.12); border-radius:20px; padding:34px; box-shadow:0 34px 90px rgba(0,0,0,.45); backdrop-filter:blur(18px); }
    .badge { display:inline-flex; border-radius:999px; padding:8px 13px; font-weight:900; background:${ok ? 'rgba(112,228,255,.12)' : 'rgba(255,122,184,.13)'}; color:${ok ? '#dbe3f4' : '#ffd7e8'}; border:1px solid ${ok ? 'rgba(112,228,255,.34)' : 'rgba(255,122,184,.34)'}; }
    h1 { margin:20px 0 10px; font-size:clamp(34px, 6vw, 58px); line-height:1; }
    p { margin:0; color:#a6afc2; font-size:20px; line-height:1.45; }
    a { display:inline-flex; margin-top:24px; border-radius:16px; border:1px solid rgba(112,228,255,.42); background:linear-gradient(135deg,#70e4ff,#38bdf8); color:#071018; padding:15px 18px; text-decoration:none; font-weight:950; }
  </style>
</head>
<body>
  <section>
    <span class="badge">${ok ? 'Scheduled' : 'Needs attention'}</span>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${linkHref ? `<a href="${escapeHtml(linkHref)}">${escapeHtml(linkLabel)}</a>` : ''}
  </section>
</body>
</html>`
}

function normalizeContentPartnerQuickFixAction(action) {
  const normalized = String(action || '').trim().toLowerCase()
  const aliases = {
    s: 'simplify',
    short: 'simplify',
    shorter: 'simplify',
    simplify: 'simplify',
    p: 'polish',
    polish: 'polish',
    tone: 'polish',
    i: 'image',
    image: 'image',
    media: 'image',
  }
  return aliases[normalized] || ''
}

function simplifyDraftCaption(caption) {
  const source = String(caption || '').replace(/\s+/g, ' ').trim()
  if (!source) return ''
  const sentences = source.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [source]
  const kept = sentences.map((sentence) => sentence.trim()).filter(Boolean).slice(0, 2).join(' ')
  return trimText(kept || source, 360)
}

function polishDraftCaption(caption) {
  const source = String(caption || '').trim()
  if (!source) return ''
  const cleaned = source.replace(/\n{3,}/g, '\n\n')
  if (/learn more|take a look|contact us|let us know/i.test(cleaned)) return cleaned
  return `${cleaned}\n\nTake a look and let us know what you think.`
}

function improveImageSuggestion(current, context) {
  const base = firstString(current, context?.mediaSuggestion, 'Use a clear, high-quality image that supports the post.')
  if (/bright|clean|crop|text overlay|mobile/i.test(base)) return base
  return `${base} Use a bright, clean crop with the main subject centered, avoid heavy text overlays, and make sure it reads well on mobile.`
}

async function updateContentPartnerDraftQuickFix(envConfig, context, action) {
  const normalizedAction = normalizeContentPartnerQuickFixAction(action)
  if (!normalizedAction) {
    const error = new Error('Unsupported quick fix.')
    error.status = 400
    throw error
  }
  if (context.draft.published_reference) {
    const error = new Error('This draft is already scheduled.')
    error.status = 409
    throw error
  }

  const reviewNotes = {
    ...context.reviewNotes,
    quickFixes: [
      ...(Array.isArray(context.reviewNotes.quickFixes) ? context.reviewNotes.quickFixes : []),
      { action: normalizedAction, appliedAt: new Date().toISOString() },
    ].slice(-12),
  }
  const patch = { review_notes: JSON.stringify(reviewNotes) }

  if (normalizedAction === 'simplify') {
    patch.draft_caption = simplifyDraftCaption(context.caption)
  } else if (normalizedAction === 'polish') {
    patch.draft_caption = polishDraftCaption(context.caption)
  } else if (normalizedAction === 'image') {
    const requirements = jsonArray(context.draft.asset_requirements_json)
    const nextSuggestion = improveImageSuggestion(context.mediaSuggestion, context)
    const conceptIndex = requirements.findIndex((item) => item?.type === 'media_concept')
    if (conceptIndex >= 0) {
      requirements[conceptIndex] = {
        ...requirements[conceptIndex],
        suggestion: nextSuggestion,
        quickFix: true,
      }
    } else {
      requirements.unshift({
        type: 'media_concept',
        suggestion: nextSuggestion,
        source: 'chatwoot_content_partner',
        quickFix: true,
      })
    }
    reviewNotes.mediaSuggestion = nextSuggestion
    patch.review_notes = JSON.stringify(reviewNotes)
    patch.asset_requirements_json = requirements
  }

  const filters = new URLSearchParams({
    id: `eq.${context.draft.id}`,
    client_id: `eq.${envConfig.clientId}`,
  })
  await supabaseRest(envConfig, `/rest/v1/social_drafts?${filters.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })

  return normalizedAction
}

async function handleContentPartnerQuickFix(request, env, token, action) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET' } })
  }

  const requestId = shortTokenToUuid(token)
  if (!requestId) return json({ error: 'Quick fix link is invalid.' }, { status: 400 })

  let envConfig
  try {
    envConfig = await getPortalWebhookConfig(request, env)
  } catch (error) {
    return json({ error: error.message || 'Portal review is not configured.' }, { status: 500 })
  }

  try {
    const requestParams = new URLSearchParams({
      select: 'generated_draft_id',
      id: `eq.${requestId}`,
      client_id: `eq.${envConfig.clientId}`,
      limit: '1',
    })
    const response = await supabaseRest(envConfig, `/rest/v1/content_partner_requests?${requestParams.toString()}`)
    const rows = await response.json()
    const draftId = Array.isArray(rows) ? rows[0]?.generated_draft_id : ''
    if (!draftId) return json({ error: 'Draft was not found.' }, { status: 404 })

    const context = await loadContentPartnerReview(envConfig, draftId, requestId)
    if (!context) return json({ error: 'Draft was not found.' }, { status: 404 })
    await updateContentPartnerDraftQuickFix(envConfig, context, action)
    const refreshed = await loadContentPartnerReview(envConfig, draftId, requestId)
    return htmlResponse(renderQuickReviewPage(env, refreshed || context))
  } catch (error) {
    return htmlResponse(renderQuickReviewResultPage({
      title: 'Could not update draft',
      message: error.message || 'MAP could not apply that quick fix.',
      linkHref: getContentPartnerReviewUrl(env, '', requestId, envConfig),
      ok: false,
    }), { status: error?.status || 502 })
  }
}

function normalizeApprovalSchedule(value) {
  const date = new Date(value || '')
  const minimum = new Date(Date.now() + (10 * 60 * 1000))
  if (Number.isNaN(date.getTime())) {
    return { scheduledFor: minimum.toISOString(), adjusted: true }
  }
  if (date.getTime() < minimum.getTime()) {
    return { scheduledFor: minimum.toISOString(), adjusted: true }
  }
  return { scheduledFor: date.toISOString(), adjusted: false }
}

async function sendContentPartnerApprovalNotice(env, context, post, scheduledFor) {
  const conversationId = parsePositiveInteger(context.request?.chatwoot_conversation_id)
  if (!conversationId) return

  await chatwootFetch(env, `/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: `Approved and scheduled for ${formatReviewDate(scheduledFor)}.`,
      message_type: 'incoming',
      private: false,
      content_type: 'text',
      source_id: `map-content-partner:approved:${context.draft.id}`,
      content_attributes: {
        map_content_partner_system: true,
        map_content_partner_approved: true,
        map_content_partner_request_id: context.request.id,
        map_content_partner_draft_id: context.draft.id,
        map_content_partner_post_id: post?.id || null,
      },
    }),
  })
}

async function scheduleApprovedContentPartnerDraft(env, envConfig, context) {
  const content = firstString(context.caption, context.title)
  if (!content) throw new Error('This draft does not have post copy to schedule.')

  const platforms = context.platforms.length ? context.platforms : ['facebook', 'instagram']
  const { scheduledFor, adjusted } = normalizeApprovalSchedule(context.scheduledFor)
  const mediaAssets = context.mediaAssets
  const mediaUrls = mediaAssets.map((asset) => asset.url).filter(Boolean)
  const mediaUrl = mediaUrls[0] || null
  const platformVariants = parseJsonObject(context.reviewNotes?.platformVariants)

  const insertResponse = await supabaseRest(envConfig, '/rest/v1/posts?select=id,client_id,content,media_url,platforms,status,scheduled_for,n8n_execution_id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      client_id: envConfig.clientId,
      content,
      media_url: mediaUrl,
      platforms,
      status: 'draft',
      scheduled_for: scheduledFor,
      platform_variants_json: platformVariants,
    }),
  })
  const insertedRows = await insertResponse.json()
  const post = Array.isArray(insertedRows) ? insertedRows[0] : null
  if (!post?.id) throw new Error('The approved post could not be saved.')

  const n8nResponse = await fetch(`${getN8nBaseUrl(env)}/webhook/social-publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      postId: post.id,
      clientId: envConfig.clientId,
      content,
      platformVariants,
      mediaVariants: {},
      mediaUrl,
      mediaUrls,
      mediaAssets,
      dropboxLinks: [],
      platforms,
      scheduledFor,
    }),
  })
  const n8nRawText = await n8nResponse.text()
  const n8nData = (() => {
    try {
      return n8nRawText ? JSON.parse(n8nRawText) : {}
    } catch {
      return {}
    }
  })()
  const publishedPlatforms = Array.isArray(n8nData?.publishedPlatforms) ? n8nData.publishedPlatforms : []
  const skippedPlatforms = Array.isArray(n8nData?.skippedPlatforms) ? n8nData.skippedPlatforms : []
  const effectivePublishedPlatforms = publishedPlatforms.length
    ? publishedPlatforms
    : platforms.filter((platform) => !skippedPlatforms.includes(platform))
  const n8nSuccess = n8nResponse.ok && n8nData?.success !== false && effectivePublishedPlatforms.length > 0

  await supabaseRest(envConfig, `/rest/v1/posts?id=eq.${encodeURIComponent(post.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: n8nSuccess ? 'scheduled' : 'failed',
      n8n_execution_id: n8nSuccess ? (n8nData?.zernioPostId ?? post.n8n_execution_id ?? null) : (post.n8n_execution_id || null),
      published_at: null,
    }),
  })

  if (!n8nSuccess) {
    throw new Error(n8nData?.message || n8nData?.error || n8nRawText || 'The social publish workflow did not schedule this post.')
  }

  const updatedNotes = {
    ...context.reviewNotes,
    quickReviewApprovedAt: new Date().toISOString(),
    quickReviewScheduledFor: scheduledFor,
    quickReviewScheduleAdjusted: adjusted,
    quickReviewPostId: post.id,
    quickReviewPlatforms: platforms,
    publishCount: (Number(context.reviewNotes?.publishCount) || 0) + 1,
  }
  await supabaseRest(envConfig, `/rest/v1/social_drafts?id=eq.${encodeURIComponent(context.draft.id)}&client_id=eq.${encodeURIComponent(envConfig.clientId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      review_state: 'published_manually',
      approved_at: updatedNotes.quickReviewApprovedAt,
      published_reference: post.id,
      review_notes: JSON.stringify(updatedNotes),
    }),
  })

  await sendContentPartnerApprovalNotice(env, context, post, scheduledFor).catch((error) => {
    console.warn('Content Partner approval notice skipped.', sanitizeChatwootError(error?.message || error))
  })

  return { post, scheduledFor, adjusted, platforms }
}

async function handleContentPartnerReviewPage(request, env, draftId) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD' } })
  }

  const url = new URL(request.url)
  const requestId = String(url.searchParams.get('token') || '').trim()
  if (!draftId || !requestId) return json({ error: 'Review token is required.' }, { status: 400 })

  let envConfig
  try {
    envConfig = await getPortalWebhookConfig(request, env)
  } catch (error) {
    return json({ error: error.message || 'Portal review is not configured.' }, { status: 500 })
  }

  try {
    const context = await loadContentPartnerReview(envConfig, draftId, requestId)
    if (!context) return json({ error: 'Review was not found.' }, { status: 404 })
    if (request.method === 'HEAD') return htmlResponse('', { status: 200 })
    return htmlResponse(renderQuickReviewPage(env, context))
  } catch (error) {
    return json({ error: error.message || 'Could not load this review.' }, { status: error?.status || 502 })
  }
}

async function handleContentPartnerShortReview(request, env, token) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, HEAD' } })
  }

  const requestId = shortTokenToUuid(token)
  if (!requestId) return json({ error: 'Review link is invalid.' }, { status: 400 })

  let envConfig
  try {
    envConfig = await getPortalWebhookConfig(request, env)
  } catch (error) {
    return json({ error: error.message || 'Portal review is not configured.' }, { status: 500 })
  }

  try {
    const requestParams = new URLSearchParams({
      select: 'generated_draft_id',
      id: `eq.${requestId}`,
      client_id: `eq.${envConfig.clientId}`,
      limit: '1',
    })
    const response = await supabaseRest(envConfig, `/rest/v1/content_partner_requests?${requestParams.toString()}`)
    const rows = await response.json()
    const draftId = Array.isArray(rows) ? rows[0]?.generated_draft_id : ''
    if (!draftId) return json({ error: 'Review was not found.' }, { status: 404 })

    const context = await loadContentPartnerReview(envConfig, draftId, requestId)
    if (!context) return json({ error: 'Review was not found.' }, { status: 404 })
    if (request.method === 'HEAD') return htmlResponse('', { status: 200 })
    return htmlResponse(renderQuickReviewPage(env, context))
  } catch (error) {
    return json({ error: error.message || 'Could not load this review.' }, { status: error?.status || 502 })
  }
}

async function handleContentPartnerReviewApprove(request, env, draftId) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { allow: 'POST, OPTIONS' } })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'POST' } })
  }

  const url = new URL(request.url)
  const requestId = String(url.searchParams.get('token') || '').trim()
  const backUrl = getContentPartnerReviewUrl(env, draftId, requestId)
  if (!draftId || !requestId) return htmlResponse(renderQuickReviewResultPage({
    title: 'Missing review token',
    message: 'This approval link is missing the secure review token.',
    linkHref: backUrl,
    ok: false,
  }), { status: 400 })

  let envConfig
  try {
    envConfig = await getPortalWebhookConfig(request, env)
  } catch (error) {
    return htmlResponse(renderQuickReviewResultPage({
      title: 'Portal is not configured',
      message: error.message || 'This portal cannot schedule posts right now.',
      ok: false,
    }), { status: 500 })
  }

  try {
    const context = await loadContentPartnerReview(envConfig, draftId, requestId)
    if (!context) {
      return htmlResponse(renderQuickReviewResultPage({
        title: 'Review not found',
        message: 'This review link is no longer valid.',
        ok: false,
      }), { status: 404 })
    }

    if (context.draft.published_reference) {
      return htmlResponse(renderQuickReviewResultPage({
        title: 'Already scheduled',
        message: `This draft was already approved and scheduled for ${formatReviewDate(context.draft.scheduled_for)}.`,
        linkHref: backUrl,
        linkLabel: 'View preview',
      }))
    }

    const result = await scheduleApprovedContentPartnerDraft(env, envConfig, context)
    const adjustedCopy = result.adjusted ? ' The original recommended time had passed, so MAP moved it to the next safe posting window.' : ''
    return htmlResponse(renderQuickReviewResultPage({
      title: 'Post scheduled',
      message: `Your post is scheduled for ${formatReviewDate(result.scheduledFor)} on ${result.platforms.map(platformLabel).join(', ')}.${adjustedCopy}`,
      linkHref: getPortalReviewUrl(env, context.draft.id, envConfig),
      linkLabel: 'Open full editor',
    }))
  } catch (error) {
    return htmlResponse(renderQuickReviewResultPage({
      title: 'Could not schedule',
      message: error.message || 'MAP could not schedule this post. Please open the full editor and try again.',
      linkHref: backUrl,
      linkLabel: 'Back to preview',
      ok: false,
    }), { status: error?.status || 502 })
  }
}

async function createContentPartnerDraft(env, envConfig, payload, message, conversation, gatewayToken = '', chatwootContext = {}) {
  const sender = message.sender || payload.sender || {}
  const chatwootConfig = await getChatwootConfigForClient(env, envConfig, chatwootContext)
  return callSupabaseFunction(envConfig, 'portal-content-partner', {
    clientId: envConfig.clientId,
    chatwootAccountId: chatwootConfig.accountId,
    chatwootInboxId: conversation?.inbox_id || message.inbox_id || null,
    chatwootConversationId: conversation?.id || message.conversation_id || null,
    chatwootMessageId: firstString(message.id, message.source_id),
    senderId: firstString(sender.id, message.sender_id),
    senderName: firstString(sender.name, sender.available_name, message.sender?.name),
    messageContent: firstString(message.content),
    attachments: normalizeChatwootMessageAttachments(payload, message),
  }, gatewayToken)
}

async function sendContentPartnerChatwootReply(env, envConfig, conversationId, triggerMessageId, result, chatwootContext = {}) {
  const reviewUrl = getContentPartnerReviewUrl(env, result?.draftId, result?.requestId, envConfig)
  const editorUrl = `${getPortalOrigin(env, envConfig) || ''}${result?.draftId ? `/post?draftId=${encodeURIComponent(result.draftId)}` : '/post'}`
  const previewUrl = getContentPartnerPreviewUrl(env, result?.draftId, result?.requestId, envConfig)
  const simplifyUrl = getContentPartnerQuickFixUrl(env, result?.requestId, 's', envConfig)
  const imageUrl = getContentPartnerQuickFixUrl(env, result?.requestId, 'i', envConfig)
  const draftCaption = firstString(result?.caption, result?.draftCaption, result?.draft_caption)
  const captionPreview = draftCaption
    ? `${trimText(draftCaption, 320)}${draftCaption.length > 320 ? '...' : ''}`
    : ''
  const lines = [
    'Draft ready.',
    captionPreview ? `Copy preview:\n${captionPreview}` : firstString(result?.partnerReply) || 'I created a Publisher draft from your message.',
    reviewUrl ? `Review and approve:\n${reviewUrl}` : '',
    simplifyUrl && imageUrl ? `Quick fixes:\nSimplify: ${simplifyUrl}\nImage: ${imageUrl}` : '',
  ].filter(Boolean)
  const content = lines.join('\n\n').slice(0, 5000)
  const contentAttributes = {
    map_content_partner_reply: true,
    map_content_partner_trigger_message_id: String(triggerMessageId),
    map_content_partner_request_id: result?.requestId || null,
    map_content_partner_draft_id: result?.draftId || null,
    map_content_partner_review_url: reviewUrl || null,
    map_content_partner_editor_url: editorUrl || null,
    map_content_partner_preview_url: previewUrl || null,
    map_content_partner_caption: draftCaption || null,
    map_content_partner_simplify_url: simplifyUrl || null,
    map_content_partner_image_url: imageUrl || null,
  }

  const chatwootConfig = await getChatwootConfigForClient(env, envConfig, chatwootContext)
  return chatwootFetch(chatwootConfig, `/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      message_type: 'incoming',
      private: false,
      content_type: 'text',
      source_id: `map-content-partner:reply:${triggerMessageId}`,
      content_attributes: contentAttributes,
    }),
  })
}

async function processContentPartnerMessage(env, envConfig, payload, message, conversation, gatewayToken = '', chatwootContext = {}) {
  const triggerMessageId = firstString(message.id, message.source_id)
  const conversationId = firstString(conversation.id, message.conversation_id)
  if (!triggerMessageId || !conversationId) {
    const error = new Error('Missing Chatwoot content partner message or conversation id.')
    error.status = 400
    throw error
  }

  const chatwootConfig = await getChatwootConfigForClient(env, envConfig, chatwootContext)
  const alreadyReplied = await contentPartnerReplyExists(chatwootConfig, conversationId, triggerMessageId)
  if (alreadyReplied) {
    return { deduped: true, reason: 'Content Partner reply already exists.' }
  }

  const result = await createContentPartnerDraft(env, envConfig, payload, message, conversation, gatewayToken, chatwootContext)
  await sendContentPartnerChatwootReply(env, envConfig, conversationId, triggerMessageId, result, chatwootContext)
  return result
}

function normalizeZernioEventName(request, payload) {
  return String(
    request.headers.get('x-zernio-event')
    || request.headers.get('x-late-event')
    || payload.event
    || '',
  ).trim()
}

function firstString(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

function normalizeZernioAccount(payload) {
  const account = payload.account || {}
  return {
    id: firstString(account.id, account.accountId, payload.accountId, payload.zernioAccountId),
    platform: normalizePlatform(firstString(account.platform, payload.platform)),
    username: firstString(account.username, account.handle, account.displayName, payload.username),
  }
}

function normalizeZernioMessage(payload) {
  const message = payload.message || payload.data?.message || {}
  const conversation = payload.conversation || payload.data?.conversation || {}
  const sender = message.sender || conversation.contact || payload.contact || {}
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : (Array.isArray(payload.attachments) ? payload.attachments : [])
  const messageId = firstString(message.id, message.messageId, payload.messageId, payload.id)
  const conversationId = firstString(conversation.id, conversation.conversationId, message.conversationId, payload.conversationId)
  const senderId = firstString(
    sender.id,
    sender.contactId,
    sender.platformIdentifier,
    sender.username,
    message.senderId,
    conversation.contactId,
    conversation.participantId,
    conversationId,
  )
  const senderName = firstString(
    sender.name,
    sender.displayName,
    sender.username,
    conversation.name,
    conversation.title,
    'Social contact',
  )
  const content = firstString(message.text, message.content, message.message, payload.text, payload.content)

  return {
    id: messageId,
    conversationId,
    senderId,
    senderName,
    senderEmail: firstString(sender.email),
    senderPhone: firstString(sender.phone, sender.phoneNumber),
    senderAvatar: firstString(sender.avatarUrl, sender.avatar, sender.profilePictureUrl),
    content,
    attachments,
    timestamp: firstString(message.timestamp, message.createdAt, payload.timestamp),
  }
}

function buildZernioContactIdentifier(accountId, senderId) {
  return `zernio:${accountId}:${senderId}`.slice(0, 255)
}

function appendAttachmentLinks(content, attachments) {
  const links = (attachments || [])
    .map((attachment) => firstString(attachment.url, attachment.fileUrl, attachment.downloadUrl, attachment.mediaUrl))
    .filter(Boolean)

  if (!links.length) return content || '[Attachment received]'

  const attachmentText = links.map((link) => `Attachment: ${link}`).join('\n')
  return [content, attachmentText].filter(Boolean).join('\n\n')
}

async function findChatwootContactByIdentifier(env, identifier) {
  const params = new URLSearchParams({ q: identifier })
  const payload = await chatwootFetch(env, `/contacts/search?${params.toString()}`)
  const contacts = Array.isArray(payload?.payload) ? payload.payload : []
  return contacts.find((contact) => String(contact.identifier || '') === identifier) || null
}

function getContactInboxSourceId(contact, inboxId) {
  const contactInboxes = Array.isArray(contact?.contact_inboxes) ? contact.contact_inboxes : []
  const contactInbox = contactInboxes.find((entry) => Number(entry?.inbox?.id) === Number(inboxId))
  return firstString(contactInbox?.source_id)
}

async function findOrCreateChatwootZernioContact(env, inboxId, account, message) {
  const identifier = buildZernioContactIdentifier(account.id, message.senderId)
  const existing = await findChatwootContactByIdentifier(env, identifier)
  if (existing?.id && getContactInboxSourceId(existing, inboxId)) return existing

  const created = await chatwootFetch(env, '/contacts', {
    method: 'POST',
    body: JSON.stringify({
      inbox_id: inboxId,
      name: message.senderName,
      email: message.senderEmail || undefined,
      phone_number: message.senderPhone || undefined,
      avatar_url: message.senderAvatar || undefined,
      identifier,
      additional_attributes: {
        source: 'zernio',
        platform: account.platform,
      },
      custom_attributes: {
        zernio_account_id: account.id,
        zernio_platform: account.platform,
        zernio_sender_id: message.senderId,
      },
    }),
  })

  const contact = Array.isArray(created?.payload) ? created.payload[0] : created?.payload || created
  if (contact?.id && getContactInboxSourceId(contact, inboxId)) return contact

  return findChatwootContactByIdentifier(env, identifier)
}

async function findChatwootZernioConversation(env, contactId, zernioConversationId, inboxId) {
  const payload = await chatwootFetch(env, `/contacts/${contactId}/conversations`)
  const conversations = Array.isArray(payload?.payload) ? payload.payload : (Array.isArray(payload) ? payload : [])
  return conversations.find((conversation) => (
    Number(conversation?.inbox_id) === Number(inboxId)
    && String(conversation?.custom_attributes?.zernio_conversation_id || '') === String(zernioConversationId)
    && String(conversation?.status || '').toLowerCase() !== 'resolved'
  )) || conversations.find((conversation) => (
    Number(conversation?.inbox_id) === Number(inboxId)
    && String(conversation?.custom_attributes?.zernio_conversation_id || '') === String(zernioConversationId)
  )) || null
}

async function findOrCreateChatwootZernioConversation(env, contact, inboxId, account, message) {
  const existing = await findChatwootZernioConversation(env, contact.id, message.conversationId, inboxId)
  if (existing?.id) return existing

  const sourceId = getContactInboxSourceId(contact, inboxId)
  if (!sourceId) {
    throw new Error('Chatwoot contact source id is missing for the Social Inbox.')
  }
  return chatwootFetch(env, '/conversations', {
    method: 'POST',
    body: JSON.stringify({
      source_id: sourceId,
      inbox_id: inboxId,
      contact_id: contact.id,
      status: 'open',
      custom_attributes: {
        zernio_account_id: account.id,
        zernio_conversation_id: message.conversationId,
        zernio_platform: account.platform,
        zernio_username: account.username || null,
      },
      additional_attributes: {
        source: 'zernio',
        platform: account.platform,
        zernio_account_id: account.id,
      },
    }),
  })
}

async function chatwootMessageExists(env, conversationId, externalMessageId) {
  if (!externalMessageId) return false
  const payload = await chatwootFetch(env, `/conversations/${conversationId}/messages`)
  const messages = Array.isArray(payload?.payload) ? payload.payload : (Array.isArray(payload) ? payload : [])
  return messages.some((message) => (
    String(message?.source_id || '') === `zernio:${externalMessageId}`
    || String(message?.content_attributes?.zernio_message_id || '') === String(externalMessageId)
    || String(message?.external_source_ids?.zernio || '') === String(externalMessageId)
  ))
}

async function ensureZernioAccountIsConnected(envConfig, account) {
  const filters = new URLSearchParams({
    select: 'id,platform,zernio_account_id,username',
    client_id: `eq.${envConfig.clientId}`,
    zernio_account_id: `eq.${account.id}`,
    limit: '1',
  })

  const response = await supabaseRest(envConfig, `/rest/v1/social_connections?${filters.toString()}`)
  const rows = await response.json()
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) return null

  if (account.platform && normalizePlatform(row.platform) !== account.platform) return null
  return row
}

async function handleZernioInboxWebhook(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { allow: 'POST, OPTIONS' },
    })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405 })
  }

  let envConfig
  try {
    envConfig = getSupabaseConfig(env)
  } catch (error) {
    return json({ error: error.message || 'Webhook configuration is incomplete.' }, { status: 500 })
  }

  let rawBody = ''
  try {
    rawBody = await request.text()
  } catch {
    return json({ error: 'Could not read webhook body.' }, { status: 400 })
  }

  const signature = request.headers.get('x-zernio-signature') || request.headers.get('x-late-signature') || ''
  const isValidSignature = await verifyZernioWebhookSignature(rawBody, signature, envConfig.webhookSecret)
  if (!isValidSignature) {
    return json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let payload = {}
  try {
    payload = JSON.parse(rawBody || '{}')
  } catch {
    return json({ error: 'Webhook payload was not valid JSON.' }, { status: 400 })
  }

  const eventName = normalizeZernioEventName(request, payload)
  if (eventName === 'webhook.test') {
    return json({ success: true, message: 'Inbox webhook test received.' })
  }

  const allowedEvents = new Set(['message.received', 'comment.received', 'review.new'])
  if (!allowedEvents.has(eventName)) {
    return json({ success: true, skipped: true, reason: 'Unhandled inbox event.', event: eventName })
  }

  const account = normalizeZernioAccount(payload)
  const message = normalizeZernioMessage(payload)
  if (!account.id || !account.platform || !message.conversationId || !message.senderId) {
    return json({ error: 'Missing account, platform, conversation, or sender identifier.' }, { status: 400 })
  }

  const connection = await ensureZernioAccountIsConnected(envConfig, account)
  if (!connection) {
    return json({ success: true, skipped: true, reason: 'Zernio account is not connected to this tenant.', event: eventName })
  }

  try {
    const inbox = await resolveChatwootSocialInbox(env)
    const contact = await findOrCreateChatwootZernioContact(env, inbox.id, account, message)
    const conversation = await findOrCreateChatwootZernioConversation(env, contact, inbox.id, account, message)
    const conversationId = conversation?.id
    if (!conversationId) throw new Error('Chatwoot conversation could not be created.')

    if (await chatwootMessageExists(env, conversationId, message.id)) {
      return json({ success: true, deduped: true, conversationId, event: eventName })
    }

    const content = appendAttachmentLinks(message.content, message.attachments).slice(0, 5000)
    const createdMessage = await chatwootFetch(env, `/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        message_type: 'incoming',
        private: false,
        source_id: message.id ? `zernio:${message.id}` : undefined,
        content_type: 'text',
        content_attributes: {
          zernio_event: eventName,
          zernio_message_id: message.id || null,
          zernio_conversation_id: message.conversationId,
          zernio_account_id: account.id,
          zernio_platform: account.platform,
          zernio_timestamp: message.timestamp || null,
          zernio_attachments: message.attachments,
        },
      }),
    })

    return json({
      success: true,
      event: eventName,
      platform: account.platform,
      inboxId: inbox.id,
      contactId: contact.id,
      conversationId,
      messageId: createdMessage?.id || null,
    })
  } catch (error) {
    return json({ error: sanitizeChatwootError(error?.message), event: eventName }, { status: error?.status || 502 })
  }
}

async function sendZernioConversationReply(env, conversation, content) {
  const attrs = getConversationCustomAttributes(conversation)
  const zernioConversationId = firstString(attrs.zernio_conversation_id)
  const zernioAccountId = firstString(attrs.zernio_account_id)
  if (!zernioConversationId || !zernioAccountId) {
    throw new Error('This Chatwoot conversation is missing Zernio routing metadata.')
  }

  const n8nWebhookUrl = String(env.ZERNIO_INBOX_SEND_WEBHOOK_URL || '').trim()
  const requestBody = {
    accountId: zernioAccountId,
    conversationId: zernioConversationId,
    message: content.slice(0, 5000),
  }

  const payload = n8nWebhookUrl
    ? await sendZernioReplyThroughN8n(env, n8nWebhookUrl, requestBody)
    : await zernioFetch(env, `/inbox/conversations/${encodeURIComponent(zernioConversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        accountId: zernioAccountId,
        message: content.slice(0, 5000),
      }),
    })

  return {
    payload,
    messageId: firstString(payload?.message?.id, payload?.id, payload?.data?.id),
  }
}

async function sendZernioReplyThroughN8n(env, webhookUrl, body) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.ZERNIO_INBOX_SEND_SECRET ? { 'x-map-bridge-secret': String(env.ZERNIO_INBOX_SEND_SECRET) } : {}),
    },
    body: JSON.stringify(body),
  })

  const payload = await readChatwootResponse(response)
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.message || payload?.error || `Zernio inbox send workflow failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

async function handleChatwootMessageWebhook(request, env, ctx = null) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { allow: 'POST, OPTIONS' },
    })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405 })
  }

  const url = new URL(request.url)
  const expectedToken = String(env.CHATWOOT_WEBHOOK_BRIDGE_SECRET || '').trim()
  const pathTokenMatch = /^\/api\/chatwoot\/webhooks\/messages\/([^/]+)$/.exec(url.pathname)
  const pathToken = pathTokenMatch?.[1] ? decodeURIComponent(pathTokenMatch[1]) : ''
  const providedToken = firstString(
    url.searchParams.get('token'),
    pathToken,
    request.headers.get('x-map-chatwoot-webhook-token'),
    request.headers.get('x-chatwoot-webhook-token'),
  )

  if (expectedToken && providedToken !== expectedToken) {
    return json({ error: 'Invalid Chatwoot webhook token.' }, { status: 401 })
  }

  const payload = await request.json().catch(() => ({}))
  const eventName = firstString(payload.event, payload.event_name, payload.name)
  const message = payload.message || payload
  const conversation = payload.conversation || message.conversation || {}

  if (eventName && eventName !== 'message_created') {
    return json({ success: true, skipped: true, reason: 'Unhandled Chatwoot event.', event: eventName })
  }

  const isOutgoing = String(message.message_type || '').toLowerCase() === 'outgoing' || Number(message.message_type) === 1
  const alreadyBridged = Boolean(message.content_attributes?.zernio_bridge_sent)
  const isContentPartnerMessage = shouldProcessContentPartnerWebhookMessage(message, conversation)

  if (isContentPartnerMessage) {
    const processContentPartner = async () => {
      const envConfig = await getPortalWebhookConfig(request, env)
      const webhookAccountId = getWebhookChatwootAccountId(payload, message, conversation)
      const chatwootContext = webhookAccountId ? { accountId: webhookAccountId } : {}
      const chatwootConfig = await getChatwootConfigForClient(env, envConfig, chatwootContext)
      await ensureChatwootConversationOpen(chatwootConfig, conversation).catch((error) => {
        console.warn('Content Partner conversation reopen skipped.', sanitizeChatwootError(error?.message || error))
      })
      return processContentPartnerMessage(env, envConfig, payload, message, conversation, '', chatwootContext)
    }

    if (ctx?.waitUntil) {
      ctx.waitUntil(processContentPartner().catch((error) => {
        console.error('Content Partner async webhook failed.', sanitizeChatwootError(error?.message || error))
      }))
      return json({
        success: true,
        queued: true,
        event: eventName || 'message_created',
        contentPartner: true,
      })
    }

    try {
      const result = await processContentPartner()
      return json({
        success: true,
        event: eventName || 'message_created',
        contentPartner: true,
        deduped: Boolean(result.deduped),
        reason: result.reason || null,
        requestId: result.requestId || null,
        draftId: result.draftId || null,
      })
    } catch (error) {
      return json({
        error: sanitizeChatwootError(error?.message || 'Could not create Content Partner draft.'),
      }, { status: error?.status || 502 })
    }
  }

  if (!isOutgoing || message.private || alreadyBridged || !isZernioBackedConversation(conversation)) {
    return json({ success: true, skipped: true, reason: 'Not an outbound Zernio-backed customer reply.' })
  }

  try {
    const zernioResult = await sendZernioConversationReply(env, conversation, firstString(message.content))
    return json({
      success: true,
      event: eventName || 'message_created',
      zernioMessageId: zernioResult.messageId || null,
    })
  } catch (error) {
    return json({ error: error.message || 'Could not bridge Chatwoot reply to Zernio.' }, { status: error?.status || 502 })
  }
}

async function replaceSocialConnection(envConfig, { platform, accountId, username }) {
  const filters = new URLSearchParams({
    client_id: `eq.${envConfig.clientId}`,
    platform: `eq.${platform}`,
  })

  await supabaseRest(
    envConfig,
    `/rest/v1/social_connections?${filters.toString()}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
  )

  const payload = [{
    client_id: envConfig.clientId,
    platform,
    zernio_account_id: accountId,
    username,
    connected_at: new Date().toISOString(),
  }]

  await supabaseRest(
    envConfig,
    '/rest/v1/social_connections',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    },
  )
}

async function removeSocialConnection(envConfig, { platform, accountId }) {
  const filters = new URLSearchParams({
    client_id: `eq.${envConfig.clientId}`,
  })

  if (accountId) {
    filters.set('zernio_account_id', `eq.${accountId}`)
  } else if (platform) {
    filters.set('platform', `eq.${platform}`)
  }

  await supabaseRest(
    envConfig,
    `/rest/v1/social_connections?${filters.toString()}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
  )
}

async function resolveClientIdFromTenantSlug(envConfig, tenantSlug) {
  const slug = String(tenantSlug || '').trim().toLowerCase()
  if (!slug) return ''

  const filters = new URLSearchParams({
    select: 'id',
    slug: `eq.${slug}`,
    limit: '1',
  })
  const response = await supabaseRest(envConfig, `/rest/v1/clients?${filters.toString()}`)
  const rows = await response.json()
  return Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : ''
}

async function handleSocialConnectionDisconnect(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'POST' } })
  }

  const auth = await authorizePortalUser(request, env)
  if (auth.error) return auth.error
  if (auth.user.role !== 'admin') {
    return json({ error: 'Only client admins can disconnect social accounts.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const platform = normalizePlatform(body.platform)
  if (!platform) {
    return json({ error: 'Choose a supported social platform to disconnect.' }, { status: 400 })
  }

  await removeSocialConnection(auth.envConfig, { platform })
  return json({
    success: true,
    platform,
    message: `${platform} is disconnected from this MAP portal.`,
  })
}

async function handleZernioAccountWebhook(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { allow: 'POST, OPTIONS' },
    })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405 })
  }

  let envConfig
  try {
    envConfig = getSupabaseConfig(env)
  } catch (error) {
    return json({ error: error.message || 'Webhook configuration is incomplete.' }, { status: 500 })
  }

  let rawBody = ''
  try {
    rawBody = await request.text()
  } catch {
    return json({ error: 'Could not read webhook body.' }, { status: 400 })
  }

  const signature = request.headers.get('x-zernio-signature') || request.headers.get('x-late-signature') || ''
  const isValidSignature = await verifyZernioWebhookSignature(rawBody, signature, envConfig.webhookSecret)
  if (!isValidSignature) {
    return json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let payload = {}
  try {
    payload = JSON.parse(rawBody || '{}')
  } catch {
    return json({ error: 'Webhook payload was not valid JSON.' }, { status: 400 })
  }

  const eventName = String(
    request.headers.get('x-zernio-event')
    || request.headers.get('x-late-event')
    || payload.event
    || '',
  ).trim()

  if (eventName === 'webhook.test') {
    return json({ success: true, message: 'Webhook test received.' })
  }

  if (!envConfig.clientId) {
    const tenantSlug = request.headers.get('x-map-tenant-slug') || ''
    const clientId = await resolveClientIdFromTenantSlug(envConfig, tenantSlug).catch(() => '')
    if (!clientId) {
      return json({ error: 'Could not resolve tenant for account webhook.' }, { status: 404 })
    }
    envConfig = { ...envConfig, clientId }
  }

  const platform = normalizePlatform(payload.platform)
  const accountId = String(payload.accountId || payload.id || '').trim()
  const username = String(payload.username || payload.displayName || '').trim() || null

  if (!platform) {
    return json({ success: true, skipped: true, reason: 'Unsupported or missing platform.', event: eventName })
  }

  try {
    if (eventName === 'account.connected') {
      if (!accountId) {
        return json({ error: 'Missing accountId in account.connected payload.' }, { status: 400 })
      }

      await replaceSocialConnection(envConfig, { platform, accountId, username })
      return json({ success: true, event: eventName, platform, accountId, action: 'upserted' })
    }

    if (eventName === 'account.disconnected') {
      await removeSocialConnection(envConfig, { platform, accountId })
      return json({
        success: true,
        event: eventName,
        platform,
        accountId: accountId || null,
        disconnectionType: payload.disconnectionType || null,
        action: 'removed',
      })
    }
  } catch (error) {
    return json({ error: error.message || 'Webhook reconciliation failed.', event: eventName }, { status: 502 })
  }

  return json({ success: true, skipped: true, reason: 'Unhandled event.', event: eventName, platform })
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
  async fetch(request, env, ctx) {
    const canonicalRedirect = buildCanonicalRedirect(request, env)
    if (canonicalRedirect) {
      return canonicalRedirect
    }

    const sharedPortalTrailingSlashRedirect = buildSharedPortalTrailingSlashRedirect(request, env)
    if (sharedPortalTrailingSlashRedirect) {
      return sharedPortalTrailingSlashRedirect
    }

    const normalized = normalizeSharedPortalRequest(request, env)
    request = normalized.request
    const url = normalized.url

    if (url.pathname === '/api/n8n/zernio-connect-url') {
      return proxyN8nWebhook(request, env, 'zernio-connect-url')
    }

    if (url.pathname === '/api/n8n/zernio-sync-accounts') {
      return proxyN8nWebhook(request, env, 'zernio-sync-accounts')
    }

    if (url.pathname === '/api/social-connections/disconnect') {
      return handleSocialConnectionDisconnect(request, env)
    }

    if (url.pathname === '/api/post-boosts') {
      return handlePostBoosts(request, env)
    }

    const scheduledPostDeleteMatch = /^\/api\/posts\/([^/]+)\/delete$/.exec(url.pathname)
    if (scheduledPostDeleteMatch) {
      return handleScheduledPostDelete(request, env, decodeURIComponent(scheduledPostDeleteMatch[1]))
    }

    if (url.pathname === '/api/zernio/account-events') {
      return handleZernioAccountWebhook(request, env)
    }

    if (url.pathname === '/api/zernio/inbox-events') {
      return handleZernioInboxWebhook(request, env)
    }

    const chatwootMessageWebhookMatch = /^\/api\/chatwoot\/webhooks\/messages(?:\/[^/]+)?$/.exec(url.pathname)
    if (chatwootMessageWebhookMatch) {
      return handleChatwootMessageWebhook(request, env, ctx)
    }

    const contentPartnerReviewMatch = /^\/content-preview\/([^/]+)$/.exec(url.pathname)
    if (contentPartnerReviewMatch) {
      return handleContentPartnerReviewPage(request, env, decodeURIComponent(contentPartnerReviewMatch[1]))
    }

    const contentPartnerShortReviewMatch = /^\/r\/([^/]+)$/.exec(url.pathname)
    if (contentPartnerShortReviewMatch) {
      return handleContentPartnerShortReview(request, env, decodeURIComponent(contentPartnerShortReviewMatch[1]))
    }

    const contentPartnerQuickFixMatch = /^\/f\/([^/]+)\/([^/]+)$/.exec(url.pathname)
    if (contentPartnerQuickFixMatch) {
      return handleContentPartnerQuickFix(
        request,
        env,
        decodeURIComponent(contentPartnerQuickFixMatch[1]),
        decodeURIComponent(contentPartnerQuickFixMatch[2]),
      )
    }

    const contentPartnerApproveMatch = /^\/api\/content-partner\/reviews\/([^/]+)\/approve$/.exec(url.pathname)
    if (contentPartnerApproveMatch) {
      return handleContentPartnerReviewApprove(request, env, decodeURIComponent(contentPartnerApproveMatch[1]))
    }

    const contentPartnerPreviewMatch = /^\/api\/content-partner\/previews\/([^/]+)\.svg$/.exec(url.pathname)
    if (contentPartnerPreviewMatch) {
      return handleContentPartnerPreview(
        request,
        env,
        decodeURIComponent(contentPartnerPreviewMatch[1]),
      )
    }

    if (url.pathname === '/api/content-partner/conversation') {
      return handleContentPartnerConversation(request, env)
    }

    if (url.pathname.startsWith('/api/chatwoot/')) {
      return handleChatwootProxy(request, env)
    }

    if (url.pathname === '/api/website-chat/settings') {
      return handleWebsiteChatSettings(request, env)
    }

    if (url.pathname === '/api/website-chat/check-installation') {
      return handleWebsiteChatInstallCheck(request, env)
    }

    if (url.pathname === '/api/inbox/mobile-setup-email') {
      return handleChatwootMobileSetupEmail(request, env)
    }

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
