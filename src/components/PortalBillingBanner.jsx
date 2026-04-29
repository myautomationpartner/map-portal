import { AlertTriangle, ArrowUpRight, Loader2, Lock } from 'lucide-react'

export default function PortalBillingBanner({ billingAccess, onAction, actionPending = false }) {
  if (!billingAccess?.showBanner) return null

  const Icon = billingAccess.mode === 'blocked' || billingAccess.mode === 'warning' ? AlertTriangle : Lock

  return (
    <section
      className="mb-5 w-full max-w-none rounded-[28px] border px-5 py-4 md:px-6"
      style={{
        background: 'linear-gradient(135deg, rgba(201,168,76,0.18), rgba(232,213,160,0.08))',
        borderColor: 'rgba(201,168,76,0.28)',
        boxShadow: '0 18px 40px rgba(26,24,20,0.08)',
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(26,24,20,0.08)', color: 'var(--portal-primary)' }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-text-soft)' }}>
              Billing Hold
            </p>
            <h2 className="mt-1 text-base font-semibold" style={{ color: 'var(--portal-text)' }}>
              {billingAccess.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--portal-text-muted)' }}>
              {billingAccess.message}
            </p>
          </div>
        </div>

        {billingAccess.actionUrl || onAction ? (
          <button
            type="button"
            onClick={onAction}
            disabled={actionPending}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, var(--portal-primary), #ddc275)', color: 'var(--portal-dark)' }}
          >
            {actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {billingAccess.ctaLabel || 'Open billing'}
            {actionPending ? null : <ArrowUpRight className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </section>
  )
}
