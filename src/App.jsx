import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  fetchInboxNotificationCounts,
  fetchProfile,
  fetchResearchProfile,
  fetchSocialConnections,
  getSessionClaims,
} from './lib/portalApi'
import { businessNameCandidates } from './lib/inboxClassification'
import { buildTenantConfig } from './lib/tenantConfig'
import { buildReadOnlyMessage, resolveBillingAccess } from './lib/portalBilling'
import { inferPathTenant } from './lib/portalPath'
import { isInboxDemoCaptureEnabled } from './lib/inboxDemoCapture'
import Login from './pages/Login'
import Today from './pages/Today'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Inbox from './pages/Inbox'
import Attention from './pages/Attention'
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
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import PortalBillingBanner from './components/PortalBillingBanner'
import PortalPartner from './components/PortalPartner'
import { ArrowRight, CalendarDays, CheckCircle2, Link2, MessageSquare, ShieldCheck, Sparkles, X, Loader2 } from 'lucide-react'
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
const FIRST_LOGIN_SETUP_DISMISS_PREFIX = 'map:first-login-setup-dismissed:'
const PORTAL_PARTNER_ENABLED =
  import.meta.env.VITE_PORTAL_PARTNER_ENABLED !== 'false' &&
  import.meta.env.VITE_PORTAL_COPILOT_ENABLED !== 'false'

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
  return socialConnections.filter((connection) => connection?.zernio_account_id || connection?.zernio_profile_id).length
}

function FirstLoginSetupWalkthrough({
  client,
  socialConnections = [],
  researchProfile,
  onDismiss,
  onConnectAccounts,
  onOpenPublisher,
  onOpenInbox,
}) {
  const connectedSocialCount = countConnectedSocialAccounts(socialConnections)
  const profileReady = Boolean(researchProfile?.partner_training_verified_at)
  const businessName = client?.business_name || client?.name || 'your business'
  const setupSteps = [
    {
      id: 'accounts',
      label: 'Connect social accounts',
      body: connectedSocialCount > 0
        ? `${connectedSocialCount} channel${connectedSocialCount === 1 ? '' : 's'} connected.`
        : 'Connect Facebook, Instagram, and any other channel before publishing or replying.',
      complete: connectedSocialCount > 0,
      Icon: Link2,
    },
    {
      id: 'profile',
      label: 'Confirm the business profile',
      body: profileReady
        ? 'MAP has a verified business profile for posts and suggestions.'
        : 'Tell MAP what to promote, who you serve, and what to avoid.',
      complete: profileReady,
      Icon: ShieldCheck,
    },
    {
      id: 'publisher',
      label: 'Review the content plan',
      body: 'Use Publisher to turn Partner ideas into drafts, scheduled posts, and approvals.',
      complete: false,
      Icon: CalendarDays,
    },
    {
      id: 'inbox',
      label: 'Watch customer replies',
      body: 'Inbox is where social comments, DMs, and My Partner help show up for daily follow-up.',
      complete: false,
      Icon: MessageSquare,
    },
  ]

  return createPortal(
    <div className="portal-first-login-overlay" role="presentation" onMouseDown={onDismiss}>
      <section
        className="portal-first-login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-first-login-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="portal-first-login-close" onClick={onDismiss} aria-label="Close setup walkthrough">
          <X className="h-4 w-4" />
        </button>
        <div className="portal-first-login-hero">
          <div className="portal-first-login-icon" aria-hidden="true">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="assistant-training-kicker">Welcome to MAP</p>
          <h2 id="portal-first-login-title">Set up {businessName} in a few steps.</h2>
          <p>
            Start with social accounts and the business profile. After that, Publisher, Inbox, and My Partner have the context they need to work cleanly.
          </p>
        </div>

        <div className="portal-first-login-steps" aria-label="Portal setup steps">
          {setupSteps.map((step) => {
            const Icon = step.Icon
            return (
              <div key={step.id} className="portal-first-login-step" data-complete={step.complete}>
                <span className="portal-first-login-step-icon" aria-hidden="true">
                  {step.complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span>
                  <strong>{step.label}</strong>
                  <small>{step.body}</small>
                </span>
              </div>
            )
          })}
        </div>

        <div className="portal-first-login-actions">
          <button type="button" className="portal-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={onConnectAccounts}>
            Connect accounts
            <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={onOpenPublisher}>
            Open Publisher setup
          </button>
          <button type="button" className="portal-button-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={onOpenInbox}>
            View Inbox
          </button>
          <button type="button" className="portal-first-login-later" onClick={onDismiss}>
            Set up later
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
  const { data: inboxNotificationCounts } = useQuery({
    queryKey: ['inbox-notification-counts', inboxBusinessNames.join('|')],
    queryFn: () => fetchInboxNotificationCounts({ businessNames: inboxBusinessNames }),
    enabled: !!session && !demoCaptureRoute && Boolean(profile?.clients),
    staleTime: 0,
    refetchInterval: 25_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
  const billingAccess = useMemo(() => resolveBillingAccess(tenant), [tenant])
  const clientId = profile?.client_id
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
    location.pathname !== '/' &&
    !location.pathname.startsWith('/stats/') &&
    !location.pathname.startsWith('/documents') &&
    location.pathname !== '/calendar' &&
    location.pathname !== '/post' &&
    location.pathname !== '/inbox' &&
    location.pathname !== '/attention'
  const suppressPartnerLauncher = ['/inbox', '/attention', '/post'].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))

  useEffect(() => {
    if (!firstLoginSetupDismissKey || typeof window === 'undefined') {
      setFirstLoginSetupReady(Boolean(!firstLoginSetupDismissKey))
      return
    }

    setFirstLoginSetupDismissed(window.localStorage.getItem(firstLoginSetupDismissKey) === '1')
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
    if (firstLoginSetupDismissKey && typeof window !== 'undefined') {
      window.localStorage.setItem(firstLoginSetupDismissKey, '1')
    }
    setFirstLoginSetupDismissed(true)
  }

  function handleSetupNavigate(path) {
    dismissFirstLoginSetup()
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
    <div className="portal-shell flex">
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
        <main className="flex-1 overflow-auto pb-24 md:pb-0">
          {showBillingBanner ? (
            <PortalBillingBanner
              billingAccess={billingAccess}
              onAction={handleBillingAction}
              actionPending={billingActionPending}
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
              socialConnections={socialConnections}
              researchProfile={researchProfile}
              onDismiss={dismissFirstLoginSetup}
              onConnectAccounts={() => handleSetupNavigate('/settings')}
              onOpenPublisher={() => handleSetupNavigate('/calendar')}
              onOpenInbox={() => handleSetupNavigate('/inbox')}
            />
          ) : null}
        </main>

        {/* Mobile bottom nav */}
        <BottomNav
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
                <Route path="/campaigns" element={<CampaignPartner />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/secure-vault" element={<Navigate to="/documents" replace />} />
                <Route path="/opportunities" element={<OpportunityRadar />} />
                <Route path="/attention" element={<Attention />} />
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
