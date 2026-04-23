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

function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    let active = true

    async function bootstrapSession() {
      const url = new URL(window.location.href)
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

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('billing') !== 'updated') return

    queryClient.invalidateQueries({ queryKey: ['profile'] })
    url.searchParams.delete('billing')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [queryClient])

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
      <div className="flex-1 flex flex-col min-h-screen md:ml-[280px]">
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
