import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, MessageSquare, Settings, CreditCard, Radar } from 'lucide-react'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/opportunities', icon: Radar,       label: 'Radar'     },
  { to: '/post',     icon: Send,            label: 'Publisher'  },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function BottomNav({ billingAccess, onBillingAction, billingActionPending = false }) {
  return (
    <nav className="fixed bottom-3 left-3 right-3 z-50 rounded-[28px] border shadow-2xl md:hidden"
      style={{ background: 'rgba(10,10,10,0.94)', borderColor: 'rgba(201, 168, 76, 0.22)', backdropFilter: 'blur(20px)' }}>
      <div className="flex items-center">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200"
            style={({ isActive }) => ({ color: isActive ? 'var(--portal-primary)' : 'rgba(255,255,255,0.55)' })}
          >
            {({ isActive }) => (
              <>
                <div className="relative rounded-2xl p-2.5 transition-all duration-200"
                  style={{ background: isActive ? 'linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(232, 213, 160, 0.08))' : 'transparent' }}>
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  {to === '/inbox' && (
                    <span className="absolute -right-1 -top-1 z-10 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 px-1 text-[9px] font-black shadow-lg"
                      style={{ borderColor: 'white', background: 'var(--portal-primary)', color: 'var(--portal-dark)' }}>
                      3
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full"
                      style={{ background: 'linear-gradient(90deg, var(--portal-primary), #f0ddb0)', boxShadow: '0 0 12px rgba(201, 168, 76, 0.4)' }} />
                  )}
                </div>
                <span className="text-[9px] font-semibold uppercase tracking-[0.24em]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        {billingAccess?.showBanner && (billingAccess?.actionUrl || onBillingAction) ? (
          <button
            type="button"
            onClick={onBillingAction}
            disabled={billingActionPending}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200"
            style={{ color: 'var(--portal-primary)' }}
          >
            <div
              className="relative rounded-2xl p-2.5 transition-all duration-200"
              style={{ background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(232, 213, 160, 0.08))' }}
            >
              <CreditCard className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-[0.24em]">{billingActionPending ? '...' : 'Pay'}</span>
          </button>
        ) : null}
      </div>
    </nav>
  )
}
