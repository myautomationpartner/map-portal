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
    <div className="portal-shell relative flex min-h-screen items-center justify-center p-4">
      <div className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(85, 103, 255, 0.12) 0%, transparent 68%)' }} />

      <div className="w-full max-w-sm relative z-10">
        <div className="mb-10 text-center">
          <div className="mb-5 inline-block h-20 w-20 overflow-hidden rounded-[26px] border bg-white p-1 shadow-lg"
            style={{ borderColor: 'rgba(85, 103, 255, 0.15)' }}>
            <img
              src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
              alt="Dancescapes"
              className="w-full h-full object-cover"
              onError={e => {
                e.target.style.display = 'none'
                e.target.parentElement.style.display = 'flex'
                e.target.parentElement.style.alignItems = 'center'
                e.target.parentElement.style.justifyContent = 'center'
                e.target.parentElement.style.background = '#ffffff'
                e.target.parentElement.innerHTML = '<span style="color:#5567ff;font-size:32px;font-family:Fraunces,serif;font-weight:600">D</span>'
              }}
            />
          </div>
          <h1 className="font-display mb-1 text-3xl font-semibold" style={{ color: 'var(--portal-text)' }}>
            Dancescapes
          </h1>
          <p className="text-sm font-medium" style={{ color: 'var(--portal-text-muted)' }}>Partner Portal</p>
        </div>

        <div className="portal-surface rounded-[32px] p-8">
          <div className="mb-7">
            <span className="portal-chip inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
              Secure client access
            </span>
            <h2 className="font-display mt-4 text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>Welcome back</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>Sign in to your studio dashboard and documents workspace.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2"
                style={{ color: 'var(--portal-text-soft)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@studio.com"
                className="portal-input px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2"
                style={{ color: 'var(--portal-text-soft)' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="portal-input px-4 py-3 text-sm"
              />
            </div>

            {error && (
              <div className="portal-status-danger flex items-center gap-2 rounded-2xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="portal-button-primary flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: 'var(--portal-text-soft)' }}>
          Need access?{' '}
          <a
            href="mailto:billing@myautomationpartner.com"
            className="transition-colors hover:text-[var(--portal-primary)]"
            style={{ color: 'var(--portal-text-muted)' }}
          >
            Contact your account manager
          </a>
        </p>
      </div>
    </div>
  )
}
