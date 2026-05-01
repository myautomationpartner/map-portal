import { NavLink } from 'react-router-dom'
import { CalendarDays, LayoutDashboard, Megaphone, MessageSquare, Settings, LogOut, FolderOpen, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getSessionClaims } from '../lib/portalApi'
import { buildTenantConfig } from '../lib/tenantConfig'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FolderOpen,      label: 'Documents'  },
  { to: '/calendar', icon: CalendarDays,     label: 'Publisher'  },
  { to: '/campaigns', icon: Megaphone,       label: 'Campaign Partner' },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function Sidebar({
  session,
  tenant: providedTenant,
  billingAccess,
  onBillingAction,
  billingActionPending = false,
  portalTheme = 'dark',
  onPortalThemeChange,
}) {
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
    image.parentElement.innerHTML = `<span style="color:var(--portal-primary);font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">${tenant.logoInitials}</span>`
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <aside
      className="hidden fixed left-0 top-0 z-40 h-full w-[188px] flex-col border-r md:flex"
      style={{ background: 'linear-gradient(180deg, var(--portal-nav) 0%, var(--portal-nav-strong) 100%)', borderColor: 'var(--portal-border)' }}
    >
      <div className="flex items-center gap-2.5 border-b px-3.5 py-5" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="h-9 w-11 shrink-0 overflow-hidden rounded-xl border bg-black/20 p-0.5 shadow-sm" style={{ borderColor: 'rgba(112, 228, 255, 0.24)' }}>
          <img
            src={tenant.logoUrl}
            alt={tenant.displayName}
            className="w-full h-full object-contain"
            onError={handleLogoError}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold leading-tight" style={{ color: 'var(--portal-nav-text-strong)' }}>
            {tenant.displayName}
          </p>
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--portal-primary)' }}>
            {tenant.portalLabel}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 px-2.5 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-[13px] font-semibold transition-all duration-200 ${
                isActive ? 'active-nav' : 'inactive-nav'
              }`
            }
            style={({ isActive }) => isActive
              ? { background: 'linear-gradient(135deg, color-mix(in srgb, var(--portal-primary) 18%, transparent), color-mix(in srgb, var(--portal-cyan) 10%, transparent))', color: 'var(--portal-nav-text-strong)', border: '1px solid color-mix(in srgb, var(--portal-primary) 24%, transparent)', boxShadow: '0 12px 24px rgba(0, 0, 0, 0.18)' }
              : { color: 'var(--portal-nav-text)', border: '1px solid transparent' }
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative flex items-center justify-center rounded-xl p-1.5" style={{ background: isActive ? 'var(--portal-nav-icon-active-bg)' : 'var(--portal-nav-icon-bg)' }}>
                  <Icon
                    className="h-4 w-4 transition-colors"
                    style={{ color: isActive ? 'var(--portal-primary)' : 'var(--portal-nav-text-muted)' }}
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
                  <div className="ml-auto h-2.5 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, var(--portal-primary), var(--portal-cyan))', boxShadow: '0 0 12px color-mix(in srgb, var(--portal-cyan) 35%, transparent)' }} />
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
            className="mt-3 flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--portal-primary) 18%, transparent), color-mix(in srgb, var(--portal-cyan) 10%, transparent))',
              color: 'var(--portal-nav-text-strong)',
              border: '1px solid color-mix(in srgb, var(--portal-primary) 24%, transparent)',
              boxShadow: '0 12px 24px rgba(0, 0, 0, 0.18)',
            }}
          >
            <div className="relative flex items-center justify-center rounded-xl p-1.5" style={{ background: 'var(--portal-nav-icon-active-bg)' }}>
              <CreditCard className="h-4 w-4" style={{ color: 'var(--portal-primary)' }} strokeWidth={2.2} />
            </div>
            {billingActionPending ? 'Opening billing...' : (billingAccess.ctaLabel || 'Manage billing')}
          </button>
        ) : null}
      </nav>

      <div className="px-2.5 py-4" style={{ borderTop: '1px solid var(--portal-border)' }}>
        <div className="mb-2.5">
          <ThemeToggle theme={portalTheme} onToggle={onPortalThemeChange} />
        </div>
        <div className="mb-2.5 flex items-center gap-2.5 rounded-[18px] px-2.5 py-2.5" style={{ background: 'var(--portal-theme-toggle-bg)', border: '1px solid var(--portal-border)' }}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--portal-primary), var(--portal-cyan))', color: 'var(--portal-dark)' }}>
            {session?.user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[11px] font-semibold" style={{ color: 'var(--portal-nav-text-strong)' }}>{session?.user?.email}</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--portal-nav-text-muted)' }}>
              {claims.user_role || 'verified client'} · {claims.client_slug || 'tenant'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="portal-button-ghost group flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200"
        >
          <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          Sign out
        </button>
      </div>

    </aside>
  )
}
