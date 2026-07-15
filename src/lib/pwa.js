import { inferPathTenant } from './portalPath'
import { markPortalPushOpened, refreshPortalPushSubscription } from './pushNotifications'

const PORTAL_RELEASE = String(import.meta.env.VITE_PORTAL_RELEASE || 'development')

function absolutePortalUrl(pathname) {
  const origin = window.location.origin
  return `${origin}${pathname}`
}

function buildManifest() {
  const tenant = inferPathTenant()
  const base = tenant.basename || ''
  const scope = `${base || '/'}`.replace(/\/?$/, '/')
  const startUrl = `${base}/attention`

  return {
    id: scope,
    name: 'My Automation Partner',
    short_name: 'MAP',
    description: 'Mobile portal for customer attention, publishing, and MAP Partner help.',
    start_url: startUrl || '/attention',
    scope,
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#000000',
    theme_color: '#000000',
    orientation: 'portrait-primary',
    icons: [
      {
        src: absolutePortalUrl(`${base}/assets/map-option-b-mark.png`),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: absolutePortalUrl(`${base}/assets/map-option-b-mark.png`),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }
}

function upsertMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', name)
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', content)
}

export function registerPortalPwa() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const tenant = inferPathTenant()
  const base = tenant.basename || ''
  const manifest = buildManifest()
  const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })
  const manifestUrl = URL.createObjectURL(manifestBlob)

  const currentReleaseUrl = new URL(window.location.href)
  if (currentReleaseUrl.searchParams.has('pwaRelease')) {
    currentReleaseUrl.searchParams.delete('pwaRelease')
    window.history.replaceState(window.history.state, '', `${currentReleaseUrl.pathname}${currentReleaseUrl.search}${currentReleaseUrl.hash}`)
  }

  let link = document.querySelector('link[rel="manifest"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'manifest')
    document.head.appendChild(link)
  }
  link.setAttribute('href', manifestUrl)

  upsertMeta('application-name', manifest.short_name)
  upsertMeta('apple-mobile-web-app-title', manifest.short_name)
  upsertMeta('apple-mobile-web-app-capable', 'yes')
  upsertMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
  upsertMeta('theme-color', manifest.theme_color)

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      let reloadingForNewVersion = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingForNewVersion) return
        if (/\/login\/?$/.test(window.location.pathname)) return
        reloadingForNewVersion = true
        window.location.reload()
      })

      navigator.serviceWorker.register(
        `${base}/service-worker.js?release=${encodeURIComponent(PORTAL_RELEASE)}`,
        {
          scope: manifest.scope,
          updateViaCache: 'none',
        },
      ).then(async (registration) => {
        await registration.update()
        await refreshPortalPushSubscription().catch(() => undefined)
        const currentUrl = new URL(window.location.href)
        const pushEvent = currentUrl.searchParams.get('pushEvent')
        if (pushEvent) {
          const marked = await markPortalPushOpened(pushEvent).then(() => true).catch(() => false)
          if (marked) {
            currentUrl.searchParams.delete('pushEvent')
            window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
          }
        }
      }).catch((error) => {
        console.warn('MAP portal service worker registration skipped.', error)
      })
    }, { once: true })
  }
}
