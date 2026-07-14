const CACHE_NAME = 'map-portal-shell-v1'
const SHELL_ASSETS = [
  '/',
  '/assets/map-option-b-mark.png',
  '/favicon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
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
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/functions/v1/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined)
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
  )
})

function resolveNotificationUrl(value) {
  try {
    return new URL(value || 'attention', self.registration.scope).href
  } catch {
    return new URL('attention', self.registration.scope).href
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
      data: { url },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = resolveNotificationUrl(event.notification?.data?.url)

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
