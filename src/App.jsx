import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  fetchInboxNotificationCounts,
  fetchProfile,
  fetchResearchProfile,
  fetchSocialConnections,
  getSessionClaims,
  refreshSocialConnections,
  startOpportunityRadar,
  startSocialConnection,
  updateClientPartnerProfile,
  upsertResearchProfile,
} from './lib/portalApi'
import { businessNameCandidates } from './lib/inboxClassification'
import { buildTenantConfig } from './lib/tenantConfig'
import { buildReadOnlyMessage, resolveBillingAccess } from './lib/portalBilling'
import { inferPathTenant, portalPath } from './lib/portalPath'
import { isInboxDemoCaptureEnabled } from './lib/inboxDemoCapture'
import Login from './pages/Login'
import Today from './pages/Today'
import { isMobilePartnerRolloutTenant } from './lib/mobilePartnerRollout'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Inbox from './pages/Inbox'
import Attention from './pages/Attention'
import Notifications from './pages/Notifications'
import CreatePost from './pages/CreatePost'
import PostHistory from './pages/PostHistory'
import ScheduledPosts from './pages/ScheduledPosts'
import PlatformStats from './pages/PlatformStats'
import Documents from './pages/Documents'
import PublicShare from './pages/PublicShare'
import SecureVaultRoom from './pages/SecureVaultRoom'
import ConnectReturn from './pages/ConnectReturn'
import OpportunityRadar from './pages/OpportunityRadar'
import ContentCalendar from './pages/ContentCalendar'
import CampaignPartner from './pages/CampaignPartner'
import BoostAds from './pages/BoostAds'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import PortalBillingBanner from './components/PortalBillingBanner'
import PortalPartner from './components/PortalPartner'
import { ArrowRight, CalendarDays, CheckCircle2, Link2, MessageSquare, RefreshCw, ShieldCheck, Sparkles, Loader2 } from 'lucide-react'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

const PORTAL_THEME_STORAGE_KEY = 'map.portal.theme'
const FIRST_LOGIN_SETUP_DISMISS_PREFIX = 'map:first-login-setup-v2-dismissed:'
const BILLING_BANNER_DISMISS_PREFIX = 'map:billing-banner-dismissed:'
const INBOX_NOTIFICATION_CACHE_PREFIX = 'map:inbox-notification-counts:'
const INBOX_NOTIFICATION_CACHE_TTL_MS = 5 * 60 * 1000
const PORTAL_PARTNER_ENABLED =
  import.meta.env.VITE_PORTAL_PARTNER_ENABLED !== 'false' &&
  import.meta.env.VITE_PORTAL_COPILOT_ENABLED !== 'false'

function normalizeInboxNotificationCounts(counts) {
  const messages = Number(counts?.messages || 0)
  const comments = Number(counts?.comments || 0)
  const total = Number.isFinite(Number(counts?.total)) ? Number(counts.total) : messages + comments
  return {
    messages: Number.isFinite(messages) ? messages : 0,
    comments: Number.isFinite(comments) ? comments : 0,
    total: Number.isFinite(total) ? total : 0,
  }
}

function readInboxNotificationCountCache(cacheKey) {
  if (!cacheKey || typeof window === 'undefined') return undefined
  try {
    const cached = JSON.parse(window.localStorage.getItem(cacheKey) || 'null')
    if (!cached?.counts || Date.now() - Number(cached.savedAt || 0) > INBOX_NOTIFICATION_CACHE_TTL_MS) {
      return undefined
    }
    return normalizeInboxNotificationCounts(cached.counts)
  } catch {
    return undefined
  }
}

function writeInboxNotificationCountCache(cacheKey, counts) {
  if (!cacheKey || typeof window === 'undefined' || !counts) return
  window.localStorage.setItem(cacheKey, JSON.stringify({
    counts: normalizeInboxNotificationCounts(counts),
    savedAt: Date.now(),
  }))
}

function todayDismissalStamp() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function readDailyDismissal(key) {
  if (!key || typeof window === 'undefined') return false
  return window.localStorage.getItem(key) === todayDismissalStamp()
}

function writeDailyDismissal(key) {
  if (!key || typeof window === 'undefined') return
  window.localStorage.setItem(key, todayDismissalStamp())
}

function normalizePermissions(profile) {
  const permissions = Array.isArray(profile?.portal_permissions) ? profile.portal_permissions : []
  if (profile?.role === 'admin' && !permissions.length) return ['full_admin']
  if (!permissions.length) return ['read_only']
  return permissions
}

function hasPortalPermission(profile, permission) {
  const permissions = normalizePermissions(profile)
  return permissions.includes('full_admin') ||
    permissions.includes(permission) ||
    (permission === 'create_post' && permissions.includes('publish_posts')) ||
    (permission === 'view_documents' && permissions.includes('manage_secure_sharing'))
}

function inferRequiredPermission(actionLabel) {
  const label = String(actionLabel || '').toLowerCase()

  if (label.includes('publish') || label.includes('schedule') || label.includes('boost')) return 'publish_posts'
  if (label.includes('post') || label.includes('draft') || label.includes('partner assist') || label.includes('format image')) return 'create_post'
  if (label.includes('secure access room') || label.includes('share link')) return 'manage_secure_sharing'
  if (label.includes('document') || label.includes('folder') || label.includes('vault')) return 'manage_secure_sharing'

  return 'full_admin'
}

function buildPermissionMessage(actionLabel, permission) {
  const names = {
    create_post: 'Create Post',
    publish_posts: 'Create and Publish Posts',
    view_documents: 'View Documents',
    manage_secure_sharing: 'Create shared document rooms and shared links',
    full_admin: 'Full Administrator',
  }
  return `Your portal access does not allow you to ${actionLabel}. Ask a Full Administrator to add ${names[permission] || 'the required'} access.`
}

function resolveInitialPortalTheme() {
  if (typeof window === 'undefined') return 'dark'

  const params = new URLSearchParams(window.location.search)
  const queryTheme = params.get('theme')

  if (queryTheme === 'light' || queryTheme === 'default') return 'light'
  if (queryTheme === 'dark' || queryTheme === 'map-dark') return 'dark'

  const savedTheme = window.localStorage.getItem(PORTAL_THEME_STORAGE_KEY)
  return savedTheme === 'light' ? 'light' : 'dark'
}

function isInboxDemoCaptureRoute() {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname.replace(/\/+$/, '')
  return path.endsWith('/inbox') && isInboxDemoCaptureEnabled(window.location.search)
}

function PortalTheme({ theme }) {
  useEffect(() => {
    const root = document.documentElement

    if (theme === 'light') {
      delete root.dataset.portalTheme
      return
    }

    root.dataset.portalTheme = 'map-dark'
  }, [theme])

  return null
}

function useMobileInboxRoute() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  ))

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const media = window.matchMedia('(max-width: 767px)')
    const handleChange = () => setIsMobile(media.matches)
    handleChange()
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}

function ResponsiveInboxRoute() {
  const location = useLocation()
  return useMobileInboxRoute() ? <Attention key={location.search} /> : <Inbox />
}

function countConnectedSocialAccounts(socialConnections = []) {
  return socialConnections.filter((connection) => connection?.zernio_account_id).length
}

function normalizeSetupPlatform(platform) {
  const value = String(platform || '').toLowerCase()
  if (value === 'x') return 'twitter'
  return value
}

function hasConnectedSetupPlatform(socialConnections = [], platform) {
  const normalizedPlatform = normalizeSetupPlatform(platform)
  return socialConnections.some((connection) => (
    normalizeSetupPlatform(connection?.platform) === normalizedPlatform &&
    connection?.zernio_account_id
  ))
}

function setupListToText(value) {
  return Array.isArray(value) ? value.filter(Boolean).join('\n') : ''
}

function setupTextToList(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildGuidedSetupForm(client, researchProfile) {
  return {
    websiteUrl: client?.website_url || '',
    serviceArea: researchProfile?.service_area || '',
    audienceSummary: researchProfile?.audience_summary || '',
    offerFocusText: setupListToText(researchProfile?.offer_focus_json),
    blockedTopicsText: setupListToText(researchProfile?.blocked_topics_json),
    researchNotes: researchProfile?.research_notes || '',
  }
}

function hasGuidedSetupProfileBasics(form) {
  return Boolean(
    String(form?.audienceSummary || '').trim() &&
    setupTextToList(form?.offerFocusText).length > 0 &&
    setupTextToList(form?.blockedTopicsText).length > 0,
  )
}

function formatSetupPlatformLabel(platform) {
  const value = String(platform || '').toLowerCase()
  if (value === 'instagram') return 'Instagram'
  if (value === 'facebook') return 'Facebook'
  if (value === 'linkedin') return 'LinkedIn'
  if (value === 'twitter' || value === 'x') return 'X / Twitter'
  if (value === 'tiktok') return 'TikTok'
  return value ? value.replace(/\b\w/g, (character) => character.toUpperCase()) : 'Social account'
}

function FirstLoginSetupWalkthrough({
  client,
  profile,
  socialConnections = [],
  researchProfile,
  onDefer,
  onRefreshSetup,
  onOpenPublisher,
  onOpenInbox,
}) {
  const queryClient = useQueryClient()
  const [activeStepId, setActiveStepId] = useState('profile')
  const [form, setForm] = useState(() => buildGuidedSetupForm(client, researchProfile))
  const [status, setStatus] = useState(null)
  const [connectingPlatform, setConnectingPlatform] = useState('')
  const [showSocialAccountHelp, setShowSocialAccountHelp] = useState(false)
  const connectionCheckStartedAtRef = useRef(null)
  const connectedSocialCount = countConnectedSocialAccounts(socialConnections)
  const profileReady = Boolean(researchProfile?.partner_training_verified_at)
  const profileBasicsReady = hasGuidedSetupProfileBasics(form)
  const businessName = client?.business_name || client?.name || 'your business'
  const connectedPlatforms = useMemo(
    () => new Set(socialConnections.map((connection) => normalizeSetupPlatform(connection?.platform))),
    [socialConnections],
  )
  const socialReady = connectedSocialCount > 0
  const setupReady = socialReady && profileReady

  useEffect(() => {
    setForm(buildGuidedSetupForm(client, researchProfile))
  }, [client, researchProfile])

  useEffect(() => {
    if (!profileReady) {
      setActiveStepId('profile')
      return
    }
    if (!socialReady) {
      setActiveStepId('social')
      return
    }
    setActiveStepId('ready')
  }, [profileReady, socialReady])

  const reconcileSocialConnections = useCallback(async ({ platform = '', manual = false } = {}) => {
    if (!profile?.client_id) return { found: false, connectedCount: 0 }
    const normalizedPlatform = normalizeSetupPlatform(platform)
    if (manual) {
      setStatus({ type: 'info', message: 'Checking connected accounts...' })
    }

    try {
      await refreshSocialConnections(normalizedPlatform || undefined)
      const latestConnections = await queryClient.fetchQuery({
        queryKey: ['social_connections', profile.client_id],
        queryFn: () => fetchSocialConnections(profile.client_id),
        staleTime: 0,
      })
      await queryClient.invalidateQueries({ queryKey: ['social_connections', profile.client_id] })

      const connectedCount = countConnectedSocialAccounts(latestConnections)
      const found = normalizedPlatform
        ? hasConnectedSetupPlatform(latestConnections, normalizedPlatform)
        : connectedCount > 0

      if (found) {
        const label = normalizedPlatform ? formatSetupPlatformLabel(normalizedPlatform) : 'Social account'
        setStatus({
          type: 'success',
          message: `${label} is connected. ${profileReady ? 'Continue to First content plan.' : 'Verify the business profile next.'}`,
        })
        setConnectingPlatform('')
        setActiveStepId(profileReady ? 'ready' : 'social')
        onRefreshSetup?.()
      } else if (manual) {
        setStatus({
          type: 'info',
          message: normalizedPlatform
            ? `${formatSetupPlatformLabel(normalizedPlatform)} is not connected yet. Finish the Zernio window, then press Check connections or try Connect again.`
            : 'No connected accounts were found yet. Finish the provider window, then press Check connections.',
        })
      }

      return { found, connectedCount }
    } catch (error) {
      if (manual) {
        setStatus({ type: 'error', message: error?.message || 'Could not refresh social accounts.' })
      }
      return { found: false, connectedCount: 0, error }
    }
  }, [onRefreshSetup, profile?.client_id, profileReady, queryClient])

  useEffect(() => {
    if (!connectingPlatform) {
      connectionCheckStartedAtRef.current = null
      return undefined
    }

    if (hasConnectedSetupPlatform(socialConnections, connectingPlatform)) {
      const label = formatSetupPlatformLabel(connectingPlatform)
      setStatus({
        type: 'success',
        message: `${label} is connected. ${profileReady ? 'Continue to First content plan.' : 'Verify the business profile next.'}`,
      })
      setConnectingPlatform('')
      setActiveStepId(profileReady ? 'ready' : 'social')
      onRefreshSetup?.()
      return undefined
    }

    connectionCheckStartedAtRef.current = Date.now()
    let cancelled = false

    const checkConnection = async () => {
      const result = await reconcileSocialConnections({ platform: connectingPlatform, manual: false })
      if (!cancelled && result?.found) {
        setConnectingPlatform('')
      }
    }

    const handleReturnToPage = () => {
      if (document.visibilityState === 'hidden') return
      void checkConnection()
    }

    const intervalId = window.setInterval(checkConnection, 4000)
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return
      const label = formatSetupPlatformLabel(connectingPlatform)
      setConnectingPlatform('')
      setStatus({
        type: 'info',
        message: `${label} did not finish connecting yet. If the provider window is complete, press Check connections. Otherwise try Connect again.`,
      })
    }, 90000)

    window.addEventListener('focus', handleReturnToPage)
    window.addEventListener('pageshow', handleReturnToPage)
    document.addEventListener('visibilitychange', handleReturnToPage)
    void checkConnection()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
      window.removeEventListener('focus', handleReturnToPage)
      window.removeEventListener('pageshow', handleReturnToPage)
      document.removeEventListener('visibilitychange', handleReturnToPage)
    }
  }, [connectingPlatform, onRefreshSetup, profileReady, reconcileSocialConnections, socialConnections])

  const setupSteps = [
    {
      id: 'profile',
      label: 'Business profile',
      body: profileReady
        ? 'Verified. MAP can use this to write and recommend posts.'
        : 'Fill this in here. No separate page hunting.',
      complete: profileReady || profileBasicsReady,
      Icon: ShieldCheck,
    },
    {
      id: 'social',
      label: 'Social accounts',
      body: connectedSocialCount > 0
        ? `${connectedSocialCount} channel${connectedSocialCount === 1 ? '' : 's'} connected.`
        : 'Connect existing accounts or choose help if the business still needs them created.',
      complete: socialReady,
      Icon: Link2,
    },
    {
      id: 'ready',
      label: 'First content plan',
      body: setupReady ? 'Ready to review Publisher.' : 'Build first ideas after the profile is verified.',
      complete: setupReady,
      Icon: CalendarDays,
    },
    {
      id: 'inbox',
      label: 'Inbox and My Partner',
      body: 'Use this if you want help from MAP while setup is in progress.',
      complete: setupReady,
      Icon: MessageSquare,
    },
  ]
  const activeStep = setupSteps.find((step) => step.id === activeStepId) || setupSteps[0]

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const saveProfile = useMutation({
    mutationFn: async ({ verify = false } = {}) => {
      if (!profile?.client_id) throw new Error('Client profile is still loading.')
      if (verify && !hasGuidedSetupProfileBasics(form)) {
        throw new Error('Add the audience, what to promote, and what to avoid before verifying the profile.')
      }

      await updateClientPartnerProfile(profile.client_id, {
        website_url: form.websiteUrl,
      })

      return upsertResearchProfile({
        clientId: profile.client_id,
        serviceArea: form.serviceArea,
        audienceSummary: form.audienceSummary,
        offerFocus: setupTextToList(form.offerFocusText),
        blockedTopics: setupTextToList(form.blockedTopicsText),
        researchNotes: form.researchNotes,
        cadence: researchProfile?.cadence || 'weekly',
        partnerTrainingVerifiedAt: verify ? new Date().toISOString() : undefined,
        partnerTrainingVerifiedBy: verify ? profile?.id : undefined,
      })
    },
    onSuccess: async (_saved, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['research-profile', profile?.client_id] }),
      ])
      setStatus({
        type: 'success',
        message: variables?.verify
          ? 'Business profile verified. MAP can now build recommendations from this setup.'
          : 'Business profile saved. You can keep editing or verify it when ready.',
      })
      if (variables?.verify) setActiveStepId(socialReady ? 'ready' : 'social')
      onRefreshSetup?.()
    },
    onError: (error) => {
      setStatus({ type: 'error', message: error?.message || 'Could not save the business profile.' })
    },
  })

  const buildRecommendations = useMutation({
    mutationFn: async () => {
      if (!profile?.client_id) throw new Error('Client profile is still loading.')
      if (!profileReady) {
        await saveProfile.mutateAsync({ verify: true })
      }
      return startOpportunityRadar({
        client_id: profile.client_id,
        mode: 'monthly_foundation',
        max_results: 5,
        firecrawl_limit: 2,
        trigger: 'first_login_setup_helper',
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['opportunity-radar', profile?.client_id] })
      setStatus({ type: 'success', message: 'MAP is building first recommendations. Open Publisher in a moment to review them.' })
      setActiveStepId('ready')
      onRefreshSetup?.()
    },
    onError: (error) => {
      const alreadyRunning = error?.status === 409 || /already in progress/i.test(error?.message || '')
      setStatus({
        type: alreadyRunning ? 'info' : 'error',
        message: alreadyRunning
          ? 'MAP is already building recommendations. Open Publisher in a moment.'
          : error?.message || 'Could not start recommendations yet.',
      })
    },
  })

  async function handleConnectPlatform(platform) {
    if (!profile?.client_id) return
    const normalizedPlatform = normalizeSetupPlatform(platform)
    const popup = window.open('', '_blank', 'width=600,height=720')
    if (popup && !popup.closed) {
      popup.document.write(`<title>Opening ${formatSetupPlatformLabel(normalizedPlatform)}</title><body style="font-family:system-ui;background:#111827;color:white;display:grid;place-items:center;min-height:100vh;margin:0;"><main style="max-width:360px;padding:24px;"><strong>Opening ${formatSetupPlatformLabel(normalizedPlatform)} setup...</strong><p>Finish the connection, then return to MAP.</p></main></body>`)
    }

    setConnectingPlatform(normalizedPlatform)
    setStatus({ type: 'info', message: `Opening ${formatSetupPlatformLabel(normalizedPlatform)} connection. Finish in the Zernio window, then return here. MAP will check automatically.` })
    try {
      const redirectUrl = new URL(portalPath('/connect-return'), window.location.origin)
      redirectUrl.searchParams.set('connected', normalizedPlatform)
      redirectUrl.searchParams.set('cid', profile.client_id)
      redirectUrl.searchParams.set('source', 'first-login-setup')
      redirectUrl.searchParams.set('returnTo', portalPath('/'))
      const result = await startSocialConnection({
        clientId: profile.client_id,
        platform: normalizedPlatform,
        redirectUrl: redirectUrl.toString(),
      })
      if (!result?.authUrl) throw new Error('MAP did not receive a connection link.')
      if (popup && !popup.closed) {
        popup.opener = null
        popup.location.href = result.authUrl
        popup.focus()
      } else {
        window.location.assign(result.authUrl)
      }
      window.setTimeout(() => {
        void reconcileSocialConnections({ platform: normalizedPlatform, manual: false })
      }, 3000)
    } catch (error) {
      if (popup && !popup.closed) popup.close()
      setStatus({ type: 'error', message: error?.message || 'Could not start social account connection.' })
      setConnectingPlatform('')
    }
  }

  async function handleRefreshConnections() {
    const platform = connectingPlatform
    const result = await reconcileSocialConnections({ platform, manual: true })
    if (result?.found || result?.connectedCount > 0) setConnectingPlatform('')
  }

  return createPortal(
    <div className="portal-first-login-overlay" role="presentation">
      <section
        className="portal-first-login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-first-login-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="portal-first-login-hero">
          <div className="portal-first-login-icon" aria-hidden="true">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="assistant-training-kicker">Welcome to MAP</p>
          <h2 id="portal-first-login-title">Let MAP set up {businessName} with you.</h2>
          <p>
            This window stays with you until the portal is ready. Fill in the profile here, connect social accounts, then MAP will build the first recommendations.
          </p>
        </div>

        <div className="portal-first-login-next">
          <span>Current step</span>
          <strong>{activeStep.label}</strong>
          <small>{activeStep.body}</small>
        </div>

        <div className="portal-first-login-steps" aria-label="Portal setup steps">
          {setupSteps.map((step) => {
            const Icon = step.Icon
            return (
              <button
                type="button"
                key={step.id}
                className="portal-first-login-step"
                data-active={step.id === activeStepId}
                data-complete={step.complete}
                onClick={() => setActiveStepId(step.id)}
              >
                <span className="portal-first-login-step-icon" aria-hidden="true">
                  {step.complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span>
                  <strong>{step.label}</strong>
                  <small>{step.body}</small>
                </span>
              </button>
            )
          })}
        </div>

        <div className="portal-first-login-workspace">
          {activeStepId === 'profile' ? (
            <form
              className="portal-first-login-form"
              onSubmit={(event) => {
                event.preventDefault()
                saveProfile.mutate({ verify: true })
              }}
            >
              <div className="portal-first-login-form-grid">
                <label>
                  <span>Who should MAP write for?</span>
                  <textarea value={form.audienceSummary} onChange={(event) => updateForm('audienceSummary', event.target.value)} placeholder="Current students, parents, adults looking for classes..." />
                </label>
                <label>
                  <span>What area do you serve?</span>
                  <input value={form.serviceArea} onChange={(event) => updateForm('serviceArea', event.target.value)} placeholder="Town, county, region, or online" />
                </label>
                <label>
                  <span>What should MAP promote?</span>
                  <textarea value={form.offerFocusText} onChange={(event) => updateForm('offerFocusText', event.target.value)} placeholder="Summer classes&#10;Private lessons&#10;Birthday parties" />
                </label>
                <label>
                  <span>What should MAP avoid?</span>
                  <textarea value={form.blockedTopicsText} onChange={(event) => updateForm('blockedTopicsText', event.target.value)} placeholder="Unsupported guarantees&#10;Sold-out classes&#10;Discounts unless approved" />
                </label>
                <label>
                  <span>Website or schedule link</span>
                  <input value={form.websiteUrl} onChange={(event) => updateForm('websiteUrl', event.target.value)} placeholder="https://example.com/schedule" />
                </label>
                <label>
                  <span>Extra notes for MAP</span>
                  <textarea value={form.researchNotes} onChange={(event) => updateForm('researchNotes', event.target.value)} placeholder="Tone, seasonal focus, source links, or anything MAP should know." />
                </label>
              </div>
              <div className="portal-first-login-form-actions">
                <button type="button" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={() => saveProfile.mutate({ verify: false })} disabled={saveProfile.isPending}>
                  Save progress
                </button>
                <button type="submit" className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" disabled={saveProfile.isPending || !profileBasicsReady}>
                  {saveProfile.isPending ? 'Saving...' : 'Verify profile'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          ) : null}

          {activeStepId === 'social' ? (
            <div className="portal-first-login-social-help">
              <div>
                <p className="assistant-training-kicker">Social accounts</p>
                <h3>Connect the channels customers will use.</h3>
                <p>
                  Connect existing accounts here. If the business does not have a Facebook Page or Instagram professional account yet, ask My Partner for setup help instead of guessing.
                </p>
              </div>
              <div className="portal-first-login-platforms">
                {['facebook', 'instagram'].map((platform) => {
                  const connected = connectedPlatforms.has(platform)
                  return (
                    <div key={platform} className="portal-first-login-platform" data-connected={connected}>
                      <span>
                        <strong>{formatSetupPlatformLabel(platform)}</strong>
                        <small>{connected ? 'Connected and ready' : 'Needed for publishing and Inbox visibility'}</small>
                      </span>
                      <button
                        type="button"
                        className={connected ? 'portal-button-secondary' : 'portal-button-primary'}
                        onClick={() => handleConnectPlatform(platform)}
                        disabled={connectingPlatform === platform}
                      >
                        {connected ? 'Reconnect' : connectingPlatform === platform ? 'Opening...' : 'Connect'}
                      </button>
                    </div>
                  )
                })}
              </div>
              <ul>
                <li>Use the business owner's personal login only to grant access. Customers will not see that personal login.</li>
                <li>Create or claim the Facebook Page before connecting Facebook publishing.</li>
                <li>Switch Instagram to a professional account before connecting Instagram publishing.</li>
              </ul>
              {showSocialAccountHelp ? (
                <div className="portal-first-login-guidance">
                  <strong>If you do not have social accounts ready yet</strong>
                  <ol>
                    <li>Create or claim the Facebook Page for the business.</li>
                    <li>Make sure Instagram is a professional account and is connected to that Facebook Page.</li>
                    <li>Come back here and press Connect for each channel MAP should manage.</li>
                  </ol>
                  <p>
                    If you want MAP to help with the account setup, open My Partner and ask for social account setup help. This setup window will still be here when you come back.
                  </p>
                </div>
              ) : null}
              <div className="portal-first-login-social-actions">
                <button type="button" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={handleRefreshConnections}>
                  <RefreshCw className="h-4 w-4" />
                  Check connections
                </button>
                <button type="button" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={onOpenInbox}>
                  Help me set them up
                </button>
                <button type="button" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={() => setShowSocialAccountHelp((current) => !current)}>
                  {showSocialAccountHelp ? 'Hide account checklist' : 'I do not have accounts yet'}
                </button>
              </div>
            </div>
          ) : null}

          {activeStepId === 'ready' ? (
            <div className="portal-first-login-social-help">
              <div>
                <p className="assistant-training-kicker">First content plan</p>
                <h3>{setupReady ? 'Your portal is ready to use.' : 'Build the first recommendations.'}</h3>
                <p>
                  MAP uses the verified profile to create Partner Ideas. Nothing publishes automatically; the customer reviews everything in Publisher first.
                </p>
              </div>
              <div className="portal-first-login-social-actions">
                <button type="button" className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={() => buildRecommendations.mutate()} disabled={buildRecommendations.isPending || !profileBasicsReady}>
                  {buildRecommendations.isPending ? 'Building...' : 'Build first recommendations'}
                </button>
                <button type="button" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={onOpenPublisher}>
                  Open Publisher
                </button>
              </div>
            </div>
          ) : null}

          {activeStepId === 'inbox' ? (
            <div className="portal-first-login-social-help">
              <div>
                <p className="assistant-training-kicker">Inbox and help</p>
                <h3>Use My Partner while setup is underway.</h3>
                <p>
                  Inbox is where social comments, regular DMs, and MAP help show up. If account creation or setup is confusing, ask My Partner and keep the setup window available for the next step.
                </p>
              </div>
              <div className="portal-first-login-social-actions">
                <button type="button" className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={onOpenInbox}>
                  Open My Partner
                </button>
                <button type="button" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={() => setActiveStepId('profile')}>
                  Back to setup
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {status?.message ? (
          <div className="portal-first-login-status" data-type={status.type}>
            {status.message}
          </div>
        ) : null}

        <div className="portal-first-login-actions">
          <button type="button" className="portal-first-login-later" onClick={onDefer}>
            Set up later for this session
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .split(':')[0]
}

function isRelaxedHost(value) {
  const host = normalizeHost(value)
  return !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.workers.dev') ||
    host.endsWith('.pages.dev')
}

function resolveExpectedHost(profile) {
  const client = profile?.clients
  const portalDomain = normalizeHost(client?.portal_domain)
  if (portalDomain) return portalDomain

  const slug = String(client?.slug || '').trim().toLowerCase()
  return slug ? `${slug}.myautomationpartner.com` : ''
}

function resolvePathTenantMismatch(profile) {
  const clientSlug = String(profile?.clients?.slug || '').trim().toLowerCase()
  const pathTenant = inferPathTenant()

  if (!clientSlug || !pathTenant.clientSlug) return false
  return pathTenant.clientSlug !== clientSlug
}

function withAuthTimeout(promise, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out.`))
    }, 5000)
  })

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timer)
  })
}

function AuthProvider({ children }) {
  const demoCaptureRoute = isInboxDemoCaptureRoute()
  const [session, setSession] = useState(() => (
    demoCaptureRoute
      ? { access_token: '', user: { id: 'launch-assets-demo', email: 'owner@myautomationpartner.com' } }
      : undefined
  )) // undefined = loading

  useEffect(() => {
    if (demoCaptureRoute) return undefined

    let active = true

    async function bootstrapSession() {
      try {
        const url = new URL(window.location.href)
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : ''
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          const { data, error } = await withAuthTimeout(
            supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
            'Supabase session restore',
          )

          if (error) throw error
          if (data?.session && active) {
            setSession(data.session)
          }

          url.hash = ''
          window.history.replaceState({}, '', `${url.pathname}${url.search}`)
        }

        const { data: { session }, error } = await withAuthTimeout(
          supabase.auth.getSession(),
          'Supabase session check',
        )
        if (error) throw error

        if (active) {
          setSession(session)
        }
      } catch (error) {
        console.warn('MAP portal auth bootstrap cleared a stale session.', error)
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        if (active) {
          setSession(null)
        }
      }
    }

    bootstrapSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [demoCaptureRoute])

  if (session === undefined) {
    return (
      <div className="portal-shell flex min-h-screen items-center justify-center">
        <div className="portal-surface rounded-[28px] p-6">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--portal-primary)]" />
        </div>
      </div>
    )
  }

  return children(session)
}

function ProtectedLayout({ session, portalTheme, onPortalThemeChange }) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const demoCaptureRoute = isInboxDemoCaptureRoute()
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    enabled: !!session && !demoCaptureRoute,
  })
  const [billingActionPending, setBillingActionPending] = useState('')
  const [billingBannerDismissedToday, setBillingBannerDismissedToday] = useState(false)
  const [firstLoginSetupDismissed, setFirstLoginSetupDismissed] = useState(false)
  const [firstLoginSetupReady, setFirstLoginSetupReady] = useState(false)

  const claims = useMemo(() => getSessionClaims(session), [session])
  const tenant = useMemo(
    () => buildTenantConfig({ client: profile?.clients || null, claims }),
    [profile, claims],
  )
  const inboxBusinessNames = useMemo(
    () => businessNameCandidates({ clients: profile?.clients, displayName: tenant.displayName }),
    [profile?.clients, tenant.displayName],
  )
  const clientId = profile?.client_id
  const inboxNotificationCacheKey = clientId
    ? `${INBOX_NOTIFICATION_CACHE_PREFIX}${clientId}`
    : `${INBOX_NOTIFICATION_CACHE_PREFIX}${inboxBusinessNames.join('|')}`
  const { data: inboxNotificationCounts } = useQuery({
    queryKey: ['inbox-notification-counts', inboxBusinessNames.join('|')],
    queryFn: () => fetchInboxNotificationCounts({ businessNames: inboxBusinessNames }),
    enabled: !!session && !demoCaptureRoute && Boolean(profile?.clients),
    initialData: () => readInboxNotificationCountCache(inboxNotificationCacheKey),
    staleTime: 0,
    refetchInterval: 25_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  useEffect(() => {
    writeInboxNotificationCountCache(inboxNotificationCacheKey, inboxNotificationCounts)
  }, [inboxNotificationCacheKey, inboxNotificationCounts])
  const billingAccess = useMemo(() => resolveBillingAccess(tenant), [tenant])
  const billingBannerDismissKey = clientId && billingAccess?.billingStatus
    ? `${BILLING_BANNER_DISMISS_PREFIX}${clientId}:${billingAccess.billingStatus}`
    : ''
  const billingBannerDismissible = billingAccess?.mode === 'trial' || billingAccess?.mode === 'warning'
  const firstLoginSetupDismissKey = clientId ? `${FIRST_LOGIN_SETUP_DISMISS_PREFIX}${clientId}` : ''
  const { data: socialConnections = [], isLoading: socialConnectionsLoading } = useQuery({
    queryKey: ['social_connections', clientId],
    queryFn: () => fetchSocialConnections(clientId),
    enabled: !!session && !demoCaptureRoute && !!clientId,
  })
  const { data: researchProfile = null, isLoading: researchProfileLoading } = useQuery({
    queryKey: ['research-profile', clientId],
    queryFn: () => fetchResearchProfile(clientId),
    enabled: !!session && !demoCaptureRoute && !!clientId,
  })
  const connectedSocialCount = countConnectedSocialAccounts(socialConnections)
  const portalSetupComplete = connectedSocialCount > 0 && Boolean(researchProfile?.partner_training_verified_at)
  const currentHost = typeof window === 'undefined' ? '' : normalizeHost(window.location.hostname)
  const expectedHost = useMemo(() => resolveExpectedHost(profile), [profile])
  const pathTenantMismatch = useMemo(() => resolvePathTenantMismatch(profile), [profile])
  const tenantHostMismatch = Boolean(
    session &&
    profile?.clients &&
    !isRelaxedHost(currentHost) &&
    expectedHost &&
    currentHost !== expectedHost &&
    !pathTenantMismatch,
  )
  const tenantRouteMismatch = Boolean(session && profile?.clients && pathTenantMismatch)
  const showBillingBanner =
    (!billingBannerDismissible || !billingBannerDismissedToday) &&
    location.pathname !== '/' &&
    !location.pathname.startsWith('/stats/') &&
    !location.pathname.startsWith('/documents') &&
    location.pathname !== '/calendar' &&
    location.pathname !== '/post' &&
    location.pathname !== '/inbox' &&
    location.pathname !== '/attention'
  const mobilePartnerRollout = isMobilePartnerRolloutTenant(tenant)
  const suppressPartnerLauncher = (
    (location.pathname === '/' && isMobilePartnerRolloutTenant(tenant)) ||
    ['/inbox', '/attention', '/notifications', '/post'].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
  )

  useEffect(() => {
    setBillingBannerDismissedToday(readDailyDismissal(billingBannerDismissKey))
  }, [billingBannerDismissKey])

  useEffect(() => {
    if (!firstLoginSetupDismissKey || typeof window === 'undefined') {
      setFirstLoginSetupReady(Boolean(!firstLoginSetupDismissKey))
      return
    }

    setFirstLoginSetupDismissed(false)
    setFirstLoginSetupReady(true)
  }, [firstLoginSetupDismissKey])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('billing') !== 'updated') return

    queryClient.invalidateQueries({ queryKey: ['profile'] })
    url.searchParams.delete('billing')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [queryClient])

  useEffect(() => {
    if (!tenantHostMismatch && !tenantRouteMismatch) return

    queryClient.clear()
    void supabase.auth.signOut()
  }, [queryClient, tenantHostMismatch, tenantRouteMismatch])

  useEffect(() => {
    const clearBillingActionPending = () => setBillingActionPending('')
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') clearBillingActionPending()
    }

    window.addEventListener('pageshow', clearBillingActionPending)
    window.addEventListener('focus', clearBillingActionPending)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pageshow', clearBillingActionPending)
      window.removeEventListener('focus', clearBillingActionPending)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  function requireWriteAccess(actionLabel = 'make changes') {
    if (!billingAccess.readOnly) return true
    window.alert(buildReadOnlyMessage(actionLabel))
    return false
  }

  function requirePortalAccess(actionLabel = 'make changes', permission = null) {
    if (!requireWriteAccess(actionLabel)) return false
    const requiredPermission = permission || inferRequiredPermission(actionLabel)
    if (hasPortalPermission(profile, requiredPermission)) return true
    window.alert(buildPermissionMessage(actionLabel, requiredPermission))
    return false
  }

  function dismissFirstLoginSetup() {
    setFirstLoginSetupDismissed(true)
  }

  function dismissBillingBannerForToday() {
    writeDailyDismissal(billingBannerDismissKey)
    setBillingBannerDismissedToday(true)
  }

  function handleSetupNavigate(path) {
    navigate(path)
  }

  async function handleBillingAction(actionOverride) {
    if (billingActionPending) return
    const requestedAction = typeof actionOverride === 'string'
      ? actionOverride
      : typeof actionOverride?.actionType === 'string'
      ? actionOverride.actionType
      : billingAccess.actionType
    const pendingActionKey = typeof actionOverride?.actionKey === 'string'
      ? actionOverride.actionKey
      : requestedAction

    if (!requestedAction || requestedAction === 'none') return

    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.set('billing', 'updated')
    const billingReturnUrl = currentUrl.toString()
    const selectedPlan = tenant.selectedPlan || profile?.clients?.selected_plan || ''

    try {
      setBillingActionPending(pendingActionKey)

      if (requestedAction === 'checkout') {
        const result = await createBillingCheckoutSession({
          ...(selectedPlan ? { selected_plan: selectedPlan } : {}),
          success_url: billingReturnUrl,
          cancel_url: billingReturnUrl,
        })
        if (!result?.checkoutUrl) {
          throw new Error('Billing checkout session did not return a checkout URL.')
        }
        window.location.assign(result.checkoutUrl)
        return
      }

      if (tenant.billingPortalUrl && /^https?:/i.test(tenant.billingPortalUrl)) {
        window.location.assign(tenant.billingPortalUrl)
        return
      }

      const result = await createBillingPortalSession({
        return_url: billingReturnUrl,
        ...(selectedPlan ? { selected_plan: selectedPlan } : {}),
      })
      if (!result?.portalUrl) {
        throw new Error('Billing portal session did not return a portal URL.')
      }
      window.location.assign(result.portalUrl)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to open billing right now.')
      setBillingActionPending('')
    }
  }

  if (!session) return <Navigate to="/login" replace />

  if (tenantHostMismatch || tenantRouteMismatch) {
    const loginPath = `${inferPathTenant().basename || ''}/login`

    return (
      <div className="portal-shell flex min-h-screen items-center justify-center p-6">
        <div className="portal-surface max-w-md rounded-[28px] p-6 text-center">
          <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>
            This login belongs to another workspace.
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
            We signed out the stale browser session so this portal can load with the right customer account.
          </p>
          <a
            href={loginPath}
            className="portal-button-primary mt-5 inline-flex rounded-2xl px-5 py-3 text-sm font-semibold"
          >
            Continue to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={`portal-shell flex ${mobilePartnerRollout ? 'portal-shell-mobile-partner' : ''}`}>
      {/* Desktop sidebar */}
      <Sidebar
        session={session}
        tenant={tenant}
        billingAccess={billingAccess}
        onBillingAction={handleBillingAction}
        billingActionPending={billingActionPending}
        portalTheme={portalTheme}
        onPortalThemeChange={onPortalThemeChange}
        inboxNotificationCount={inboxNotificationCounts?.total || 0}
      />

      {/* Main content area */}
      <div className="flex min-h-screen w-full flex-col md:ml-[188px] md:w-[calc(100%-188px)]">
        <main className={`flex-1 overflow-auto md:pb-0 ${mobilePartnerRollout ? 'pb-0' : 'pb-24'}`}>
          {showBillingBanner ? (
            <PortalBillingBanner
              billingAccess={billingAccess}
              onAction={handleBillingAction}
              actionPending={billingActionPending}
              onDismiss={billingBannerDismissible ? dismissBillingBannerForToday : undefined}
            />
          ) : null}
          <Outlet
            context={{
              session,
              profile,
              tenant,
              billingAccess,
              onBillingAction: handleBillingAction,
              billingActionPending,
              inboxNotificationCount: inboxNotificationCounts?.total || 0,
              requireWriteAccess: requirePortalAccess,
              hasPortalPermission: (permission) => hasPortalPermission(profile, permission),
            }}
          />
          {PORTAL_PARTNER_ENABLED ? (
            <PortalPartner
              session={session}
              profile={profile}
              tenant={tenant}
              billingAccess={billingAccess}
              requireWriteAccess={requirePortalAccess}
              suppressMobileLauncher={suppressPartnerLauncher}
            />
          ) : null}
          {session &&
          profile?.clients &&
          firstLoginSetupReady &&
          !firstLoginSetupDismissed &&
          !portalSetupComplete &&
          !profileLoading &&
          !socialConnectionsLoading &&
          !researchProfileLoading ? (
            <FirstLoginSetupWalkthrough
              client={profile.clients}
              profile={profile}
              socialConnections={socialConnections}
              researchProfile={researchProfile}
              onDefer={dismissFirstLoginSetup}
              onRefreshSetup={() => {
                queryClient.invalidateQueries({ queryKey: ['profile'] })
                queryClient.invalidateQueries({ queryKey: ['social_connections', clientId] })
                queryClient.invalidateQueries({ queryKey: ['research-profile', clientId] })
              }}
              onOpenPublisher={() => handleSetupNavigate('/calendar?setup=partner')}
              onOpenInbox={() => handleSetupNavigate('/inbox')}
            />
          ) : null}
        </main>

        {/* Mobile bottom nav */}
        <BottomNav
          tenant={tenant}
          billingAccess={billingAccess}
          onBillingAction={handleBillingAction}
          billingActionPending={billingActionPending}
          portalTheme={portalTheme}
          onPortalThemeChange={onPortalThemeChange}
          inboxNotificationCount={inboxNotificationCounts?.total || 0}
        />
      </div>
    </div>
  )
}

export default function App() {
  const pathTenant = inferPathTenant()
  const [portalTheme, setPortalTheme] = useState(resolveInitialPortalTheme)

  function handlePortalThemeChange(nextTheme) {
    const normalizedTheme = nextTheme === 'light' ? 'light' : 'dark'
    window.localStorage.setItem(PORTAL_THEME_STORAGE_KEY, normalizedTheme)
    setPortalTheme(normalizedTheme)
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PortalTheme theme={portalTheme} />
      <BrowserRouter basename={pathTenant.basename || undefined}>
        <AuthProvider>
          {(session) => (
            <Routes>
              <Route
                path="/login"
                element={session ? <Navigate to="/" replace /> : <Login />}
              />
              <Route path="/share" element={<PublicShare />} />
              <Route path="/share/:token" element={<PublicShare />} />
              <Route path="/vault/:token" element={<SecureVaultRoom />} />
              <Route path="/connect-return" element={<ConnectReturn />} />
              <Route
                element={(
                  <ProtectedLayout
                    session={session}
                    portalTheme={portalTheme}
                    onPortalThemeChange={handlePortalThemeChange}
                  />
                )}
              >
                <Route path="/" element={<Today />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/calendar" element={<ContentCalendar />} />
                <Route path="/ads" element={<BoostAds />} />
                <Route path="/campaigns" element={<CampaignPartner />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/secure-vault" element={<Navigate to="/documents" replace />} />
                <Route path="/opportunities" element={<OpportunityRadar />} />
                <Route path="/attention" element={<Attention />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/inbox" element={<ResponsiveInboxRoute />} />
                <Route path="/post" element={<CreatePost />} />
                <Route path="/post/scheduled" element={<ScheduledPosts />} />
                <Route path="/post/history" element={<PostHistory />} />
                <Route path="/stats/:platform" element={<PlatformStats />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
