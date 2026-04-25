import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, MessageSquare, Settings, LogOut, FolderOpen, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getSessionClaims } from '../lib/portalApi'
import { buildTenantConfig } from '../lib/tenantConfig'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FolderOpen,      label: 'Documents'  },
  { to: '/post',     icon: Send,            label: 'Publisher'  },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function Sidebar({ session, tenant: providedTenant, billingAccess, onBillingAction, billingActionPending = false }) {
  const claims = getSessionClaims(session)
  const tenant = providedTenant || buildTenantConfig({ claims })
  const handleLogoError = (event) => {
    const image = event.currentTarget

    if (!image.dataset.fallbackApplied && tenant.fallbackLogoUrl && image.src !== tenant.fallbackLogoUrl) {
      image.dataset.fallbackApplied = 'true'
      image.src = tenant.fallbackLogoUrl
      return
    }

    image.style.display = 'none'
    image.parentElement.innerHTML = `<span style="color:#c9a84c;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">${tenant.logoInitials}</span>`
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <aside
      className="hidden fixed left-0 top-0 z-40 h-full w-[280px] flex-col border-r md:flex"
      style={{ background: 'linear-gradient(180deg, var(--portal-nav) 0%, var(--portal-nav-strong) 100%)', borderColor: 'rgba(201, 168, 76, 0.18)' }}
    >
      <div className="flex items-center gap-3 border-b px-7 py-8" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: 'rgba(201, 168, 76, 0.24)' }}>
          <img
            src={tenant.logoUrl}
            alt={tenant.displayName}
            className="w-full h-full object-cover"
            onError={handleLogoError}
          />
        </div>
        <div>
          <p className="font-display text-lg font-semibold leading-tight" style={{ color: '#ffffff' }}>
            {tenant.displayName}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'rgba(201, 168, 76, 0.9)' }}>
            {tenant.portalLabel}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                isActive ? 'active-nav' : 'inactive-nav'
              }`
            }
            style={({ isActive }) => isActive
              ? { background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(232, 213, 160, 0.1))', color: '#fff', border: '1px solid rgba(201, 168, 76, 0.24)', boxShadow: '0 12px 24px rgba(0, 0, 0, 0.18)' }
              : { color: 'rgba(255,255,255,0.72)', border: '1px solid transparent' }
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative flex items-center justify-center rounded-xl p-2" style={{ background: isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)' }}>
                  <Icon
                    className="h-4 w-4 transition-colors"
                    style={{ color: isActive ? 'var(--portal-primary)' : 'rgba(255,255,255,0.62)' }}
                    strokeWidth={2.2}
                  />
                  {to === '/inbox' && (
                    <span className="absolute -right-2.5 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 px-1 text-[9px] font-black text-[var(--portal-dark)] shadow-sm"
                      style={{ borderColor: 'white', background: 'var(--portal-primary)' }}>
                      3
                    </span>
                  )}
                </div>
                {label}
                {isActive && (
                  <div className="ml-auto h-3 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, var(--portal-primary), #f0ddb0)', boxShadow: '0 0 12px rgba(201, 168, 76, 0.35)' }} />
                )}
              </>
            )}
          </NavLink>
        ))}

        {billingAccess?.showBanner && (billingAccess?.actionUrl || onBillingAction) ? (
          <button
            type="button"
            onClick={onBillingAction}
            disabled={billingActionPending}
            className="mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(232, 213, 160, 0.1))',
              color: '#fff',
              border: '1px solid rgba(201, 168, 76, 0.24)',
              boxShadow: '0 12px 24px rgba(0, 0, 0, 0.18)',
            }}
          >
            <div className="relative flex items-center justify-center rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <CreditCard className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} strokeWidth={2.2} />
            </div>
            {billingActionPending ? 'Opening billing...' : (billingAccess.ctaLabel || 'Manage billing')}
          </button>
        ) : null}
      </nav>

      <div className="px-4 py-5" style={{ borderTop: '1px solid rgba(201, 168, 76, 0.15)' }}>
        <div className="mb-3 flex items-center gap-3 rounded-[22px] px-3 py-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201, 168, 76, 0.16)' }}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--portal-primary), #e8d5a0)', color: 'var(--portal-dark)' }}>
            {session?.user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[11px] font-semibold" style={{ color: '#fff' }}>{session?.user?.email}</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {claims.user_role || 'verified client'} · {claims.client_slug || 'tenant'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="portal-button-ghost group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200"
        >
          <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          Sign out
        </button>
      </div>

    </aside>
  )
}
