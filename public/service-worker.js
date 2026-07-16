const registrationScope = new URL(self.registration.scope)
const releaseToken = new URL(self.location.href).searchParams.get('release') || 'development'
const safeReleaseToken = releaseToken.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80)
const CACHE_NAME = `map-portal-shell-v5-${safeReleaseToken}`
const SHELL_ASSETS = [
  new URL('./', registrationScope).href,
  new URL('attention', registrationScope).href,
  new URL('assets/map-option-b-mark.png', registrationScope).href,
  new URL('favicon.svg', registrationScope).href,
]
const NAVIGATION_NETWORK_BUDGET_MS = 1_500

async function cacheSuccessfulResponse(cache, request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return response
  await cache.put(request, response.clone()).catch(() => undefined)
  return response
}

async function fetchWithBudget(request, timeoutMs = NAVIGATION_NETWORK_BUDGET_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(request, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function cachedPortalShell(cache, request) {
  return (
    await cache.match(request, { ignoreSearch: true }) ||
    await cache.match(new URL('attention', registrationScope).href, { ignoreSearch: true }) ||
    await cache.match(registrationScope.href, { ignoreSearch: true })
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))))
      .catch(() => undefined),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim())
      .catch(() => undefined),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/functions/v1/')) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      try {
        const response = await fetchWithBudget(request)
        return cacheSuccessfulResponse(cache, request, response)
      } catch {
        const cached = await cachedPortalShell(cache, request)
        if (cached) return cached
        return new Response('My Automation Partner is temporarily offline. Reopen the app when a connection is available.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    })())
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: false })
      if (cached) return cached
      try {
        const response = await fetch(request)
        return cacheSuccessfulResponse(cache, request, response)
      } catch {
        return caches.match(request)
      }
    }),
  )
})

function resolveNotificationUrl(value) {
  try {
    const scope = new URL(self.registration.scope)
    const target = new URL(value || 'inbox', self.registration.scope)
    if (target.origin !== scope.origin || !target.pathname.startsWith(scope.pathname)) {
      return new URL('inbox', self.registration.scope).href
    }
    return target.href
  } catch {
    return new URL('inbox', self.registration.scope).href
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {}
    try {
      payload = event.data ? event.data.json() : {}
    } catch {
      payload = {}
    }

    const url = resolveNotificationUrl(payload.url)
    await self.registration.showNotification(payload.title || 'MAP Inbox', {
      body: payload.body || 'New message or comment needs your attention.',
      icon: './assets/map-option-b-mark.png',
      badge: './assets/map-option-b-mark.png',
      tag: payload.tag || 'map-inbox',
      renotify: true,
      data: { url, eventKey: payload.eventKey || '' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(resolveNotificationUrl(event.notification?.data?.url))
  const eventKey = event.notification?.data?.eventKey
  if (eventKey) target.searchParams.set('pushEvent', eventKey)
  const targetUrl = target.href

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const target = new URL(targetUrl)
    const existing = clientList.find((client) => {
      try {
        const clientUrl = new URL(client.url)
        return clientUrl.origin === target.origin && clientUrl.pathname.startsWith(new URL(self.registration.scope).pathname)
      } catch {
        return false
      }
    })

    if (existing) {
      await existing.focus()
      return existing.navigate(targetUrl)
    }

    return self.clients.openWindow(targetUrl)
  })())
})
