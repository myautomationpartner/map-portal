import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'
import { buildTenantConfig } from '../lib/tenantConfig'

export default function Login() {
  const tenant = useMemo(() => buildTenantConfig(), [])
  const handleLogoError = (event) => {
    const image = event.currentTarget

    if (!image.dataset.fallbackApplied && tenant.fallbackLogoUrl && image.src !== tenant.fallbackLogoUrl) {
      image.dataset.fallbackApplied = 'true'
      image.src = tenant.fallbackLogoUrl
      return
    }

    image.style.display = 'none'
    image.parentElement.style.display = 'flex'
    image.parentElement.style.alignItems = 'center'
    image.parentElement.style.justifyContent = 'center'
    image.parentElement.textContent = tenant.logoInitials
    image.parentElement.style.color = 'var(--portal-primary)'
    image.parentElement.style.fontSize = '28px'
    image.parentElement.style.fontFamily = 'Sora,Georgia,serif'
    image.parentElement.style.fontWeight = '600'
  }
  const loginContext = useMemo(() => {
    if (typeof window === 'undefined') {
      return { email: '', setupMessage: '' }
    }

    const params = new URLSearchParams(window.location.search)
    const seededEmail = params.get('email') || ''
    const setupMessage = params.get('setup') === 'complete'
      ? 'Your portal is ready. Sign in with the password you just created.'
      : ''

    return { email: seededEmail, setupMessage }
  }, [])
  const [email, setEmail] = useState(loginContext.email)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [setupMessage] = useState(loginContext.setupMessage)

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
        style={{ background: 'radial-gradient(ellipse 80% 55% at 50% 0%, color-mix(in srgb, var(--portal-cyan) 18%, transparent) 0%, transparent 68%)' }} />

      <div className="relative z-10 grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_430px] lg:items-center">
        <div className="hidden lg:block">
          <div className="portal-panel rounded-[40px] p-8">
            <div className="mb-8 flex items-center gap-4">
              <div className="inline-flex h-20 w-28 items-center justify-center overflow-hidden rounded-[28px] border bg-black/20 p-2 shadow-sm"
                style={{ borderColor: 'color-mix(in srgb, var(--portal-cyan) 22%, transparent)' }}>
                <img
                  src={tenant.logoUrl}
                  alt={tenant.displayName}
                  className="h-full w-full object-contain"
                  onError={handleLogoError}
                />
              </div>
              <div>
                <p className="font-display text-3xl font-semibold" style={{ color: 'var(--portal-text)' }}>{tenant.displayName}</p>
                <p className="mt-1 text-sm font-medium" style={{ color: 'var(--portal-text-muted)' }}>{tenant.portalLabel}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="portal-stat-card rounded-[24px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Documents</p>
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>OneDrive-style file browsing</p>
              </div>
              <div className="portal-stat-card rounded-[24px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Sharing</p>
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Signed previews and secure links</p>
              </div>
              <div className="portal-stat-card rounded-[24px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--portal-text-soft)' }}>Daily Work</p>
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>Dashboard tools in one place</p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-sm justify-self-center lg:max-w-none">
          <div className="mb-10 text-center lg:hidden">
          <div className="mb-5 inline-block h-20 w-28 overflow-hidden rounded-[26px] border bg-black/20 p-2 shadow-lg"
            style={{ borderColor: 'color-mix(in srgb, var(--portal-cyan) 22%, transparent)' }}>
            <img
              src={tenant.logoUrl}
              alt={tenant.displayName}
              className="w-full h-full object-contain"
              onError={handleLogoError}
            />
          </div>
          <h1 className="font-display mb-1 text-3xl font-semibold" style={{ color: 'var(--portal-text)' }}>
            {tenant.displayName}
          </h1>
          <p className="text-sm font-medium" style={{ color: 'var(--portal-text-muted)' }}>{tenant.portalLabel}</p>
        </div>

        <div className="portal-surface rounded-[32px] p-8">
          <div className="mb-7">
            <span className="portal-chip inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
              Secure client access
            </span>
            <h2 className="font-display mt-4 text-2xl font-semibold" style={{ color: 'var(--portal-text)' }}>Welcome back</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>Sign in to your portal dashboard and documents workspace.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {setupMessage && (
              <div className="rounded-2xl px-4 py-3 text-sm" style={{
                color: 'var(--portal-text)',
                background: 'rgba(99, 214, 175, 0.14)',
                border: '1px solid rgba(99, 214, 175, 0.28)',
              }}>
                {setupMessage}
              </div>
            )}

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
            href={`mailto:${tenant.supportEmail}`}
            className="transition-colors hover:text-[var(--portal-primary)]"
            style={{ color: 'var(--portal-text-muted)' }}
          >
            Contact support
          </a>
        </p>
        </div>
      </div>
    </div>
  )
}
