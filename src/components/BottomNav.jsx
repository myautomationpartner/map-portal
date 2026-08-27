import { NavLink, useLocation } from 'react-router-dom'
import { FolderOpen, MessageSquare } from 'lucide-react'
import { PlusCircle } from '@phosphor-icons/react'
import { isMobilePartnerRolloutTenant } from '../lib/mobilePartnerRollout'

const navItems = [
  { to: '/inbox', icon: MessageSquare, label: 'Inbox' },
  { to: '/post', icon: PlusCircle, label: 'Post' },
  { to: '/documents', icon: FolderOpen, label: 'Files' },
]

export default function BottomNav({
  tenant,
  inboxNotificationCount = 0,
}) {
  const location = useLocation()
  const partnerRollout = isMobilePartnerRolloutTenant(tenant)

  function isCurrentNavItem(to) {
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  function handleNavClick(to, label) {
    if (typeof window === 'undefined' || !isCurrentNavItem(to)) return
    window.dispatchEvent(new CustomEvent('map:mobile-nav-active-tap', { detail: { to, label } }))
  }

  return (
    <nav className={`portal-bottom-nav ${partnerRollout ? 'mobile-partner-bottom-nav' : ''} fixed inset-x-0 bottom-0 z-50 md:hidden`}
      style={{ background: 'var(--portal-nav)', borderColor: 'var(--portal-border)' }}>
      <div className="portal-bottom-nav-inner flex items-center">
        {navItems.map(({ to, icon: Icon, label }) => {
          const notificationCount = label === 'Inbox' ? Number(inboxNotificationCount || 0) : 0
          return (
          <NavLink
            key={to}
            to={to}
            end={to === '/inbox'}
            onClick={() => handleNavClick(to, label)}
            className="portal-bottom-nav-link flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200"
            style={({ isActive }) => ({ color: isActive ? '#C9A84C' : '#5E554D' })}
          >
            {({ isActive }) => (
              <>
                <div className="portal-bottom-nav-icon relative rounded-2xl p-2.5 transition-all duration-200"
                  style={{ background: 'transparent' }}>
                  {label === 'Post' ? (
                    <Icon className="h-5 w-5" weight={isActive ? 'fill' : 'regular'} />
                  ) : (
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  )}
                  {notificationCount > 0 ? (
                    <span
                      className="portal-notification-badge portal-bottom-notification-badge absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 py-0.5 text-[9px] font-black tabular-nums"
                      aria-label={`${notificationCount} inbox items need you now`}
                      style={{
                        background: '#12262B',
                        color: '#ffffff',
                      }}
                    >
                      {notificationCount > 9 ? '9+' : notificationCount}
                    </span>
                  ) : null}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full"
                      style={{ background: '#C9A84C' }} />
                  )}
                </div>
                <span className="portal-bottom-nav-label text-[11px] font-semibold tracking-tight">{label}</span>
              </>
            )}
          </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
