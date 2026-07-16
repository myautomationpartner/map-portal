import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
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
  const [showPassword, setShowPassword] = useState(false)
  const loginSupportEmail = 'support@myautomationpartner.com'

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
    <div className="relative min-h-[100svh] overflow-x-hidden bg-[#05070c] text-[#f7f9ff]">
      <div
        className="pointer-events-none absolute inset-0 hidden sm:block"
        style={{
          background:
            'radial-gradient(circle at 56% 20%, rgba(29,155,240,0.13), transparent 32%), radial-gradient(circle at 88% 30%, rgba(185,255,104,0.12), transparent 26%), linear-gradient(180deg, #071018 0%, #05070c 50%, #05070c 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden opacity-[0.18] sm:block"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), transparent 72%)',
        }}
      />

      <header className="relative border-b border-white/10 bg-[#05070c]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] w-full max-w-[1380px] items-center justify-between px-4 sm:h-[92px] sm:px-8 lg:px-10">
          <a href="https://myautomationpartner.com/" className="flex min-w-0 items-center gap-3 no-underline">
            <div className="flex h-[34px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-white/12 bg-white/[0.03] p-1 sm:h-12 sm:w-16 sm:rounded-2xl sm:p-1.5">
              <img
                src={tenant.logoUrl}
                alt={`${tenant.displayName} logo`}
                className="h-full w-full object-contain"
                onError={handleLogoError}
              />
            </div>
            <div className="min-w-0">
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.32em] text-[#8b98a5] sm:block">
                Secure portal access
              </p>
              <p className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-white sm:text-lg">
                {tenant.displayName}
              </p>
            </div>
          </a>
          <a
            href="https://myautomationpartner.com/"
            className="hidden rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-bold text-[#d7dde7] no-underline transition hover:bg-white/[0.1] sm:inline-flex"
          >
            Back to homepage
          </a>
        </div>
      </header>

      <main className="relative mx-auto grid min-h-[calc(100svh-68px)] w-full max-w-[1380px] grid-cols-1 items-start gap-10 overflow-x-hidden px-4 py-9 sm:min-h-[calc(100svh-92px)] sm:items-center sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(520px,0.78fr)] lg:px-10 lg:py-14">
        <section className="hidden w-full max-w-full min-w-0 lg:block" style={{ maxWidth: 'calc(100vw - 40px)' }}>
          <h1 className="text-[clamp(3rem,12.5vw,7.7rem)] font-black leading-[0.92] tracking-[-0.055em] text-white">
            <span className="block">One front</span>
            <span className="block">door for</span>
            <span className="block">every</span>
            <span className="block pt-5 text-[clamp(2.55rem,11vw,7.2rem)] text-[#c6ff72]" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, letterSpacing: '-0.065em' }}>
              conversation.
            </span>
          </h1>
          <p className="mt-9 max-w-full text-lg font-medium leading-[1.65] tracking-[-0.01em] text-[#c7cfdd] sm:max-w-[680px] sm:text-xl">
            Sign in to review drafts, answer customers, approve posts, and keep the moving parts of your business from scattering across every channel.
          </p>
        </section>

        <section className="w-full max-w-full justify-self-center sm:max-w-[580px] lg:justify-self-end" style={{ maxWidth: 'min(580px, calc(100vw - 32px))' }}>
          <div className="p-0 sm:rounded-[30px] sm:border sm:border-white/10 sm:bg-[#1d2026]/80 sm:p-9 sm:shadow-[0_28px_80px_rgba(0,0,0,0.35)] sm:backdrop-blur-xl">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#c6ff72] sm:hidden">
              Secure client portal
            </p>
            <h2 className="max-w-[11ch] text-[clamp(2.4rem,11vw,2.95rem)] font-black leading-[0.96] tracking-[-0.065em] text-white sm:max-w-none lg:whitespace-nowrap">
              Open your workspace.
            </h2>
            <p className="mt-3 text-[15px] font-medium leading-relaxed text-[#a8b3c2] sm:mt-5 sm:text-base">
              Sign in and pick up right where you left off.
            </p>

          <form onSubmit={handleLogin} className="relative z-10 mt-7 space-y-5 sm:mt-8">
            {setupMessage && (
              <div className="rounded-2xl border border-[#00ba7c]/30 bg-[#00ba7c]/12 px-4 py-3 text-sm font-medium text-[#dff9ec]">
                {setupMessage}
              </div>
            )}

            <div>
              <label htmlFor="portal-login-email" className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-[#c7cfdd]">
                Email
              </label>
              <input
                id="portal-login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@yourbusiness.com"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="relative z-10 h-[58px] w-full touch-manipulation select-text rounded-[18px] border border-white/10 bg-white/[0.08] px-5 text-base font-medium text-white outline-none transition placeholder:text-[#8b98a5] focus:border-[#76d7ee]/60 focus:bg-white/[0.1] focus:ring-4 focus:ring-[#76d7ee]/15"
              />
            </div>

            <div>
              <label htmlFor="portal-login-password" className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-[#c7cfdd]">
                Password
              </label>
              <div className="relative">
                <input
                  id="portal-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="relative z-10 h-[58px] w-full touch-manipulation select-text rounded-[18px] border border-white/10 bg-white/[0.08] px-5 pr-13 text-base font-medium text-white outline-none transition placeholder:text-[#8b98a5] focus:border-[#76d7ee]/60 focus:bg-white/[0.1] focus:ring-4 focus:ring-[#76d7ee]/15"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(value => !value)}
                  className="absolute right-4 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#9ca8b6] transition hover:bg-white/[0.08] hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-[#f4212e]/35 bg-[#f4212e]/12 px-4 py-3 text-sm font-medium text-[#ffd4d8]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-[58px] w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-[linear-gradient(100deg,#c6ff72_0%,#86e8f5_100%)] px-5 text-base font-black text-[#071018] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in to portal'
              )}
            </button>
          </form>

            <p className="mt-6 text-sm font-medium text-[#9ca8b6]">
              Need help getting in? Contact{' '}
              <a
                href={`mailto:${loginSupportEmail}`}
                className="font-extrabold text-[#86e8f5] no-underline transition hover:text-white"
              >
                {loginSupportEmail}
              </a>
              .
            </p>
          </div>
        </section>
      </main>
      <footer className="pointer-events-none absolute bottom-6 left-0 right-0 hidden px-10 text-sm font-medium text-[#8b98a5] lg:block">
        <div className="mx-auto flex max-w-[1380px] justify-between">
          <span>© 2026 My Automation Partner</span>
          <span>Secure login powered by Supabase.</span>
        </div>
      </footer>
    </div>
  )
}
