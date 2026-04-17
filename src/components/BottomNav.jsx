import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, MessageSquare, Settings } from 'lucide-react'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/post',     icon: Send,            label: 'Post'       },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-zinc-900 shadow-2xl">
      <div className="flex items-center">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200 ${
                isActive ? 'text-brand-gold' : 'text-zinc-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`relative p-2 rounded-2xl transition-all duration-200 ${isActive ? 'bg-brand-gold/10' : ''}`}>
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  {to === '/inbox' && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[17px] h-[17px] bg-rose-600 text-white text-[9px] font-black px-1 rounded-full border-2 border-black z-10 shadow-lg">
                      3
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(194,160,83,0.5)]" />
                  )}
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest">
                  {label === 'Post' ? 'Publisher' : label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
