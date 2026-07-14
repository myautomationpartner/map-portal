import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Inbox from './pages/Inbox'
import CreatePost from './pages/CreatePost'
import PartnerPublisher from './pages/PartnerPublisher'
import PostHistory from './pages/PostHistory'
import PlatformStats from './pages/PlatformStats'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import { Loader2 } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#0d0b08] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
      </div>
    )
  }

  return children(session)
}

function ProtectedLayout({ session }) {
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace />

  const dedicatedPartnerView = location.pathname === '/post'

  if (dedicatedPartnerView) {
    return (
      <div className="min-h-screen bg-[#f3f8f9]">
        <main className="min-h-screen overflow-auto">
          <Outlet context={{ session }} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d0b08] flex">
      <Sidebar session={session} />
      <div className="flex-1 flex flex-col md:ml-64 min-h-screen">
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet context={{ session }} />
        </main>
        <BottomNav />
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
              <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
              <Route element={<ProtectedLayout session={session} />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/post" element={<PartnerPublisher />} />
                <Route path="/post/legacy" element={<CreatePost />} />
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
