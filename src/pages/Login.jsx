import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success, App.jsx auth listener redirects automatically
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0d0b08' }}>

      {/* Subtle warm vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,168,58,0.04) 0%, transparent 70%)' }} />

      <div className="w-full max-w-sm relative z-10">

        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-block w-20 h-20 rounded-2xl overflow-hidden mb-5 border"
            style={{ borderColor: '#3d3420' }}>
            <img
              src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
              alt="Dancescapes"
              className="w-full h-full object-cover"
              onError={e => {
                e.target.style.display = 'none'
                e.target.parentElement.style.display = 'flex'
                e.target.parentElement.style.alignItems = 'center'
                e.target.parentElement.style.justifyContent = 'center'
                e.target.parentElement.style.background = '#1e1910'
                e.target.parentElement.innerHTML = '<span style="color:#d4a83a;font-size:32px;font-family:Cormorant Garamond,serif;font-weight:600">D</span>'
              }}
            />
          </div>
          <h1 className="font-display text-3xl font-semibold mb-1" style={{ color: '#f8f2e4' }}>
            Dancescapes
          </h1>
          <p className="text-sm" style={{ color: '#8a7858' }}>Partner Portal</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
          <h2 className="font-display text-xl font-semibold mb-1" style={{ color: '#f8f2e4' }}>Welcome back</h2>
          <p className="text-sm mb-7" style={{ color: '#8a7858' }}>Sign in to your studio dashboard</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2"
                style={{ color: '#8a7858' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@studio.com"
                className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200 focus:outline-none"
                style={{
                  background: '#252015',
                  border: '1px solid #3d3420',
                  color: '#f8f2e4',
                }}
                onFocus={e => e.target.style.borderColor = '#d4a83a'}
                onBlur={e => e.target.style.borderColor = '#3d3420'}
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2"
                style={{ color: '#8a7858' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200 focus:outline-none"
                style={{
                  background: '#252015',
                  border: '1px solid #3d3420',
                  color: '#f8f2e4',
                }}
                onFocus={e => e.target.style.borderColor = '#d4a83a'}
                onBlur={e => e.target.style.borderColor = '#3d3420'}
              />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
                style={{ background: 'rgba(196,85,110,0.10)', border: '1px solid rgba(196,85,110,0.25)', color: '#e8899a' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-px active:translate-y-0"
              style={{ background: '#d4a83a', color: '#0d0b08' }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#4e4228' }}>
          Need access?{' '}
          <a
            href="mailto:billing@myautomationpartner.com"
            className="transition-colors hover:text-brand-gold"
            style={{ color: '#8a7858' }}
          >
            Contact your account manager
          </a>
        </p>
      </div>
    </div>
  )
}
