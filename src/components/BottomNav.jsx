import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, MessageSquare, Settings, FolderOpen } from 'lucide-react'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FolderOpen,      label: 'Docs'      },
  { to: '/post',     icon: Send,            label: 'Publisher'  },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-3 left-3 right-3 z-50 rounded-[28px] border shadow-2xl md:hidden"
      style={{ background: 'rgba(255,255,255,0.96)', borderColor: 'var(--portal-border)', backdropFilter: 'blur(20px)' }}>
      <div className="flex items-center">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200"
            style={({ isActive }) => ({ color: isActive ? 'var(--portal-primary)' : 'var(--portal-text-soft)' })}
          >
            {({ isActive }) => (
              <>
                <div className="relative rounded-2xl p-2.5 transition-all duration-200"
                  style={{ background: isActive ? 'linear-gradient(135deg, rgba(79, 107, 255, 0.12), rgba(135, 92, 245, 0.08))' : 'transparent' }}>
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  {to === '/inbox' && (
                    <span className="absolute -right-1 -top-1 z-10 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 bg-violet-600 px-1 text-[9px] font-black text-white shadow-lg"
                      style={{ borderColor: 'white' }}>
                      3
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full"
                      style={{ background: 'linear-gradient(90deg, var(--portal-primary), var(--portal-secondary))', boxShadow: '0 0 12px rgba(85, 103, 255, 0.4)' }} />
                  )}
                </div>
                <span className="text-[9px] font-semibold uppercase tracking-[0.24em]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
