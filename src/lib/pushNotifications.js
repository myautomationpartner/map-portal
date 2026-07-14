import { portalPath } from './portalPath'
import { supabase } from './supabase'

function hasBrowserPushSupport() {
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

function isStandaloneApp() {
  if (typeof window === 'undefined') return false
  return window.navigator?.standalone === true
    || window.matchMedia?.('(display-mode: standalone)')?.matches
}

export function getPushNotificationStatus() {
  const supported = hasBrowserPushSupport()
  const permission = supported ? window.Notification.permission : 'unsupported'
  return {
    supported,
    permission,
    standalone: isStandaloneApp(),
    secure: typeof window !== 'undefined' ? window.isSecureContext : false,
  }
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }
  return output
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in again to manage phone notifications.')
  return token
}

async function portalPushFetch(path, options = {}) {
  const token = await getAccessToken()
  const response = await fetch(portalPath(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || `Notification request failed (${response.status}).`)
  }
  return payload
}

async function getPublicKey() {
  const payload = await portalPushFetch('/api/portal-push/public-key')
  const publicKey = String(payload?.publicKey || '').trim()
  if (!publicKey) throw new Error('Phone notifications are not configured yet.')
  return publicKey
}

export async function getCurrentPushSubscription() {
  if (!hasBrowserPushSupport()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function subscribeToPortalPush({ deviceLabel = '' } = {}) {
  const status = getPushNotificationStatus()
  if (!status.supported || !status.secure) {
    throw new Error('This browser does not support MAP phone notifications.')
  }

  let permission = window.Notification.permission
  if (permission === 'default') {
    permission = await window.Notification.requestPermission()
  }
  if (permission !== 'granted') {
    throw new Error('Notifications were not allowed on this device.')
  }

  const registration = await navigator.serviceWorker.ready
  const publicKey = await getPublicKey()
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey),
  })

  return portalPushFetch('/api/portal-push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceLabel,
      userAgent: window.navigator.userAgent || '',
    }),
  })
}

export async function unsubscribeFromPortalPush() {
  if (!hasBrowserPushSupport()) return { success: true, subscribed: false }

  const subscription = await getCurrentPushSubscription()
  const endpoint = subscription?.endpoint || ''
  if (endpoint) {
    await portalPushFetch('/api/portal-push/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    })
  }
  if (subscription) await subscription.unsubscribe().catch(() => false)

  return { success: true, subscribed: false }
}
