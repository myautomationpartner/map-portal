import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, MessageSquare, Settings } from 'lucide-react'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/post',     icon: Send,            label: 'Publisher'  },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 shadow-2xl"
      style={{ background: '#0d0b08', borderTop: '1px solid #3d3420' }}>
      <div className="flex items-center">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200"
            style={({ isActive }) => ({ color: isActive ? '#d4a83a' : '#4e4228' })}
          >
            {({ isActive }) => (
              <>
                <div className="relative p-2 rounded-xl transition-all duration-200"
                  style={{ background: isActive ? 'rgba(212,168,58,0.10)' : 'transparent' }}>
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  {to === '/inbox' && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[17px] h-[17px] bg-rose-600 text-white text-[9px] font-black px-1 rounded-full border-2 z-10 shadow-lg"
                      style={{ borderColor: '#0d0b08' }}>
                      3
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-brand-gold"
                      style={{ boxShadow: '0 0 8px rgba(212,168,58,0.5)' }} />
                  )}
                </div>
                <span className="text-[9px] font-semibold uppercase tracking-widest">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
