import { NavLink } from 'react-router-dom'
import { BarChart3, CalendarDays, LayoutDashboard, ListChecks, Megaphone, MessageSquare, Settings, LogOut, FolderOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getSessionClaims } from '../lib/portalApi'
import { buildTenantConfig } from '../lib/tenantConfig'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { to: '/',         icon: ListChecks,      label: 'Today'     },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FolderOpen,      label: 'Documents'  },
  { to: '/calendar', icon: CalendarDays,     label: 'Publisher'  },
  { to: '/ads',      icon: BarChart3,        label: 'Ads'        },
  { to: '/campaigns', icon: Megaphone,       label: 'Campaign Partner' },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

function resolveSubscriptionStatus(billingAccess) {
  if (billingAccess?.readOnly || billingAccess?.mode === 'blocked' || billingAccess?.mode === 'inactive') {
    return {
      label: 'Subscription inactive',
      compactLabel: 'Inactive',
      color: 'var(--map-brand-magenta)',
      background: 'rgba(255,122,184,0.13)',
      border: 'rgba(255,122,184,0.34)',
    }
  }

  if (billingAccess?.mode === 'trial') {
    return {
      label: 'Manual trial active',
      compactLabel: 'Manual trial',
      color: 'var(--portal-success)',
      background: 'rgba(133,247,169,0.12)',
      border: 'rgba(133,247,169,0.30)',
    }
  }

  if (billingAccess?.mode === 'warning') {
    return {
      label: 'Manual trial review',
      compactLabel: 'Manual trial',
      color: 'var(--portal-success)',
      background: 'rgba(133,247,169,0.12)',
      border: 'rgba(133,247,169,0.30)',
    }
  }

  return {
    label: 'Subscription active',
    compactLabel: 'Active',
    color: 'var(--portal-success)',
    background: 'rgba(133,247,169,0.12)',
    border: 'rgba(133,247,169,0.30)',
  }
}

export default function Sidebar({
  session,
  tenant: providedTenant,
  billingAccess,
  portalTheme = 'dark',
  onPortalThemeChange,
  inboxNotificationCount = 0,
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

  const subscriptionStatus = resolveSubscriptionStatus(billingAccess)

  return (
    <aside
      className="hidden fixed left-0 top-0 z-40 h-full w-[188px] flex-col border-r md:flex"
      style={{ background: 'linear-gradient(180deg, var(--portal-nav) 0%, var(--portal-nav-strong) 100%)', borderColor: 'var(--portal-border)' }}
    >
      <div className="flex items-center gap-2.5 border-b px-3.5 py-4" style={{ borderColor: 'var(--portal-border)' }}>
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
          <div
            className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em]"
            title={subscriptionStatus.label}
            style={{
              background: subscriptionStatus.background,
              color: subscriptionStatus.color,
              border: `1px solid ${subscriptionStatus.border}`,
            }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: subscriptionStatus.color }} />
            <span className="truncate">{subscriptionStatus.compactLabel}</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 px-2.5 py-4">
        {navItems.map(({ to, icon: Icon, label }) => {
          const notificationCount = label === 'Inbox' ? Number(inboxNotificationCount || 0) : 0
          return (
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
                </div>
                {label}
                {notificationCount > 0 ? (
                  <span
                    className="portal-notification-badge portal-sidebar-notification-badge ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums"
                    aria-label={`${notificationCount} inbox items need a reply`}
                    style={{
                      background: 'linear-gradient(135deg, var(--portal-primary), var(--portal-cyan))',
                      color: '#001018',
                      boxShadow: '0 0 14px color-mix(in srgb, var(--portal-cyan) 34%, transparent)',
                    }}
                  >
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                ) : isActive && (
                  <div className="ml-auto h-2.5 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, var(--portal-primary), var(--portal-cyan))', boxShadow: '0 0 12px color-mix(in srgb, var(--portal-cyan) 35%, transparent)' }} />
                )}
              </>
            )}
          </NavLink>
          )
        })}
      </nav>

      <div className="px-2.5 py-4" style={{ borderTop: '1px solid var(--portal-border)' }}>
        <div className="mb-2.5">
          <ThemeToggle theme={portalTheme} onToggle={onPortalThemeChange} />
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
