import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import { createBillingCheckoutSession, createBillingPortalSession, fetchProfile, getSessionClaims } from './lib/portalApi'
import { buildTenantConfig } from './lib/tenantConfig'
import { buildReadOnlyMessage, resolveBillingAccess } from './lib/portalBilling'
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
import OpportunityRadar from './pages/OpportunityRadar'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import PortalBillingBanner from './components/PortalBillingBanner'
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

function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    let active = true

    async function bootstrapSession() {
      const url = new URL(window.location.href)
      const shouldClearLoginSession = url.pathname.endsWith('/login') && url.searchParams.get('setup') === 'complete'

      if (shouldClearLoginSession) {
        await supabase.auth.signOut()
        if (active) setSession(null)
        return
      }

      const hash = url.hash.startsWith('#') ? url.hash.slice(1) : ''
      const hashParams = new URLSearchParams(hash)
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (!error && data?.session && active) {
          setSession(data.session)
        }

        url.hash = ''
        window.history.replaceState({}, '', `${url.pathname}${url.search}`)
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (active) {
        setSession(session)
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

function ProtectedLayout({ session }) {
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
  const tenantHostMismatch = Boolean(
    session &&
    profile?.clients &&
    !isRelaxedHost(currentHost) &&
    expectedHost &&
    currentHost !== expectedHost,
  )

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('billing') !== 'updated') return

    queryClient.invalidateQueries({ queryKey: ['profile'] })
    url.searchParams.delete('billing')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [queryClient])

  useEffect(() => {
    if (!tenantHostMismatch) return

    queryClient.clear()
    void supabase.auth.signOut()
  }, [queryClient, tenantHostMismatch])

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

  if (tenantHostMismatch) {
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
            href="/login"
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
      />

      {/* Main content area */}
      <div className="flex min-h-screen w-full flex-col md:ml-[232px] md:w-[calc(100%-232px)]">
        <main className="flex-1 overflow-auto pb-24 md:pb-0">
          <PortalBillingBanner
            billingAccess={billingAccess}
            onAction={handleBillingAction}
            actionPending={billingActionPending}
          />
          <Outlet context={{ session, profile, tenant, billingAccess, requireWriteAccess }} />
        </main>

        {/* Mobile bottom nav */}
        <BottomNav
          billingAccess={billingAccess}
          onBillingAction={handleBillingAction}
          billingActionPending={billingActionPending}
        />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {(session) => (
            <Routes>
              <Route
                path="/login"
                element={session ? <Navigate to="/" replace /> : <Login />}
              />
              <Route path="/share" element={<PublicShare />} />
              <Route path="/share/:token" element={<PublicShare />} />
              <Route element={<ProtectedLayout session={session} />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/calendar" element={<Navigate to="/post" replace />} />
                <Route path="/documents" element={<Documents />} />
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
