import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import { createBillingCheckoutSession, createBillingPortalSession, fetchProfile, getSessionClaims } from './lib/portalApi'
import { buildTenantConfig } from './lib/tenantConfig'
import { buildReadOnlyMessage, resolveBillingAccess } from './lib/portalBilling'
import { inferPathTenant } from './lib/portalPath'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Inbox from './pages/Inbox'
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
import { Loader2 } from 'lucide-react'
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
const PORTAL_PARTNER_ENABLED =
  import.meta.env.VITE_PORTAL_PARTNER_ENABLED !== 'false' &&
  import.meta.env.VITE_PORTAL_COPILOT_ENABLED !== 'false'

function resolveInitialPortalTheme() {
  if (typeof window === 'undefined') return 'dark'

  const params = new URLSearchParams(window.location.search)
  const queryTheme = params.get('theme')

  if (queryTheme === 'light' || queryTheme === 'default') return 'light'
  if (queryTheme === 'dark' || queryTheme === 'map-dark') return 'dark'

  const savedTheme = window.localStorage.getItem(PORTAL_THEME_STORAGE_KEY)
  return savedTheme === 'light' ? 'light' : 'dark'
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
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
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
  }, [])

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
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    enabled: !!session,
  })
  const [billingActionPending, setBillingActionPending] = useState(false)

  const claims = useMemo(() => getSessionClaims(session), [session])
  const tenant = useMemo(
    () => buildTenantConfig({ client: profile?.clients || null, claims }),
    [profile, claims],
  )
  const billingAccess = useMemo(() => resolveBillingAccess(tenant), [tenant])
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

  function requireWriteAccess(actionLabel = 'make changes') {
    if (!billingAccess.readOnly) return true
    window.alert(buildReadOnlyMessage(actionLabel))
    return false
  }

  async function handleBillingAction() {
    if (billingActionPending) return

    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.set('billing', 'updated')
    const billingReturnUrl = currentUrl.toString()
    const selectedPlan = tenant.selectedPlan || profile?.clients?.selected_plan || ''

    try {
      setBillingActionPending(true)

      if (billingAccess.mode === 'read_only' || billingAccess.mode === 'warning') {
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
      setBillingActionPending(false)
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
      />

      {/* Main content area */}
      <div className="flex min-h-screen w-full flex-col md:ml-[188px] md:w-[calc(100%-188px)]">
        <main className="flex-1 overflow-auto pb-24 md:pb-0">
          <PortalBillingBanner
            billingAccess={billingAccess}
            onAction={handleBillingAction}
            actionPending={billingActionPending}
          />
          <Outlet context={{ session, profile, tenant, billingAccess, requireWriteAccess }} />
          {PORTAL_PARTNER_ENABLED ? (
            <PortalPartner
              session={session}
              profile={profile}
              tenant={tenant}
              billingAccess={billingAccess}
              requireWriteAccess={requireWriteAccess}
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
                <Route path="/" element={<Dashboard />} />
                <Route path="/calendar" element={<ContentCalendar />} />
                <Route path="/campaigns" element={<CampaignPartner />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/secure-vault" element={<Navigate to="/documents" replace />} />
                <Route path="/opportunities" element={<OpportunityRadar />} />
                <Route path="/inbox" element={<Inbox />} />
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
