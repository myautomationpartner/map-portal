import { NavLink, useLocation } from 'react-router-dom'
import { CalendarDays, FolderOpen, ListChecks, MessageSquare, Settings, CreditCard } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { to: '/',         icon: ListChecks,      label: 'Today'     },
  { to: '/documents', icon: FolderOpen,     label: 'Files'     },
  { to: '/calendar', icon: CalendarDays,     label: 'Publisher' },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function BottomNav({
  billingAccess,
  onBillingAction,
  billingActionPending = false,
  portalTheme = 'dark',
  onPortalThemeChange,
}) {
  const location = useLocation()

  function isCurrentNavItem(to) {
    if (to === '/') return location.pathname === '/'
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  function handleNavClick(to, label) {
    if (typeof window === 'undefined' || !isCurrentNavItem(to)) return
    window.dispatchEvent(new CustomEvent('map:mobile-nav-active-tap', { detail: { to, label } }))
  }

  return (
    <nav className="portal-bottom-nav fixed bottom-3 left-3 right-3 z-50 rounded-[28px] border shadow-2xl md:hidden"
      style={{ background: 'var(--portal-nav)', borderColor: 'var(--portal-border)', backdropFilter: 'blur(20px)' }}>
      <div className="portal-bottom-nav-inner flex items-center">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => handleNavClick(to, label)}
            className="portal-bottom-nav-link flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200"
            style={({ isActive }) => ({ color: isActive ? 'var(--portal-primary)' : 'var(--portal-nav-text-muted)' })}
          >
            {({ isActive }) => (
              <>
                <div className="portal-bottom-nav-icon relative rounded-2xl p-2.5 transition-all duration-200"
                  style={{ background: isActive ? 'linear-gradient(135deg, color-mix(in srgb, var(--portal-primary) 18%, transparent), color-mix(in srgb, var(--portal-cyan) 10%, transparent))' : 'transparent' }}>
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full"
                      style={{ background: 'linear-gradient(90deg, var(--portal-primary), var(--portal-cyan))', boxShadow: '0 0 12px color-mix(in srgb, var(--portal-cyan) 40%, transparent)' }} />
                  )}
                </div>
                <span className="portal-bottom-nav-label text-[8px] font-semibold uppercase tracking-[0.08em]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        {billingAccess?.showBanner && billingAccess?.actionType !== 'none' && billingAccess?.ctaLabel && (billingAccess?.actionUrl || onBillingAction) ? (
          <button
            type="button"
            onClick={onBillingAction}
            disabled={billingActionPending}
            className="portal-bottom-nav-link flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200"
            style={{ color: 'var(--portal-primary)' }}
          >
            <div
              className="portal-bottom-nav-icon relative rounded-2xl p-2.5 transition-all duration-200"
              style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--portal-primary) 18%, transparent), color-mix(in srgb, var(--portal-cyan) 10%, transparent))' }}
            >
              <CreditCard className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <span className="portal-bottom-nav-label text-[8px] font-semibold uppercase tracking-[0.08em]">{billingActionPending ? '...' : 'Billing'}</span>
          </button>
        ) : null}
        <div className="flex flex-1 items-center justify-center py-3">
          <ThemeToggle theme={portalTheme} onToggle={onPortalThemeChange} compact />
        </div>
      </div>
    </nav>
  )
}
