import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { buildTenantConfig } from '../lib/tenantConfig'

function formatPlatformLabel(platform) {
  const value = String(platform || '').trim().toLowerCase()
  if (value === 'twitter' || value === 'x') return 'X / Twitter'
  if (value === 'linkedin') return 'LinkedIn'
  if (value === 'tiktok') return 'TikTok'
  if (!value) return 'Social account'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function ConnectReturn() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const tenant = useMemo(() => buildTenantConfig(), [])
  const platform = params.get('connected') || params.get('platform') || ''
  const clientId = params.get('cid') || ''
  const [closeState, setCloseState] = useState('closing')

  useEffect(() => {
    const payload = {
      type: 'map:social-connected',
      platform,
      clientId,
    }

    try {
      window.opener?.postMessage(payload, window.location.origin)
    } catch {
      // The opener may be intentionally hidden by the auth popup for security.
    }

    const closeTimer = window.setTimeout(() => {
      setCloseState('fallback')
      window.close()
    }, 1200)

    const fallbackTimer = window.setTimeout(() => {
      setCloseState('manual')
    }, 2500)

    return () => {
      window.clearTimeout(closeTimer)
      window.clearTimeout(fallbackTimer)
    }
  }, [clientId, platform])

  return (
    <div className="portal-shell flex min-h-screen items-center justify-center p-5">
      <main className="portal-surface w-full max-w-[520px] rounded-[28px] p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[22px] border" style={{ borderColor: 'var(--portal-border)', background: 'rgba(255,255,255,0.08)' }}>
            <img
              src={tenant.logoUrl}
              alt={tenant.displayName}
              className="h-full w-full object-contain p-2"
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--portal-primary)' }}>
              Secure connection
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold" style={{ color: 'var(--portal-text)' }}>
              Connection complete
            </h1>
          </div>
        </div>

        <div className="portal-status-success mt-6 flex items-start gap-3 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{formatPlatformLabel(platform)} is connected.</p>
            <p className="mt-1 text-sm opacity-85">
              Return to your portal tab. Settings will confirm the account as soon as the sync finishes.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => window.close()}
            className="portal-button-primary inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold"
          >
            <X className="h-4 w-4" />
            Close window
          </button>
        </div>

        <p className="mt-5 flex items-center gap-2 text-sm" style={{ color: 'var(--portal-text-muted)' }}>
          {closeState === 'manual' ? (
            'If this window stays open, close it and continue in the portal tab.'
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Closing this secure window...
            </>
          )}
        </p>
      </main>
    </div>
  )
}
