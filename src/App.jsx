import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Inbox from './pages/Inbox'
import CreatePost from './pages/CreatePost'
import PostHistory from './pages/PostHistory'
import PlatformStats from './pages/PlatformStats'
import Documents from './pages/Documents'
import PublicShare from './pages/PublicShare'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
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
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="portal-shell flex">
      {/* Desktop sidebar */}
      <Sidebar session={session} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-[280px]">
        <main className="flex-1 overflow-auto pb-24 md:pb-0">
          <Outlet context={{ session }} />
        </main>

        {/* Mobile bottom nav */}
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
