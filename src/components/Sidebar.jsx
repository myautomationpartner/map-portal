import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, MessageSquare, Settings, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/post',     icon: Send,            label: 'Publisher'  },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function Sidebar({ session }) {
  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <aside className="hidden md:flex fixed top-0 left-0 h-full w-64 flex-col z-40"
      style={{ background: '#141109', borderRight: '1px solid #3d3420' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-7" style={{ borderBottom: '1px solid #3d3420' }}>
        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border"
          style={{ borderColor: '#3d3420' }}>
          <img
            src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
            alt="Dancescapes"
            className="w-full h-full object-cover"
            onError={e => {
              e.target.style.display = 'none'
              e.target.parentElement.innerHTML = '<span style="color:#d4a83a;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">D</span>'
            }}
          />
        </div>
        <div>
          <p className="font-display text-base font-semibold leading-tight" style={{ color: '#f8f2e4' }}>
            Dancescapes
          </p>
          <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: '#8a7858' }}>
            Partner Portal
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive ? 'active-nav' : 'inactive-nav'
              }`
            }
            style={({ isActive }) => isActive
              ? { background: 'rgba(212,168,58,0.10)', color: '#d4a83a', border: '1px solid rgba(212,168,58,0.22)' }
              : { color: '#8a7858', border: '1px solid transparent' }
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative flex items-center justify-center">
                  <Icon
                    className="w-4 h-4 transition-colors"
                    style={{ color: isActive ? '#d4a83a' : '#8a7858' }}
                    strokeWidth={2.2}
                  />
                  {to === '/inbox' && (
                    <span className="absolute -top-2 -right-2.5 flex items-center justify-center min-w-[17px] h-[17px] bg-rose-600 text-white text-[9px] font-black px-1 rounded-full border-2 z-10"
                      style={{ borderColor: '#141109' }}>
                      3
                    </span>
                  )}
                </div>
                {label}
                {isActive && (
                  <div className="ml-auto w-1 h-3 rounded-full bg-brand-gold" style={{ boxShadow: '0 0 8px rgba(212,168,58,0.5)' }} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-4 py-5" style={{ borderTop: '1px solid #3d3420' }}>
        <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl" style={{ background: '#1e1910', border: '1px solid #3d3420' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: '#d4a83a', color: '#0d0b08' }}>
            {session?.user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold truncate" style={{ color: '#f8f2e4' }}>{session?.user?.email}</p>
            <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: '#8a7858' }}>Verified Client</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group hover:text-rose-400"
          style={{ color: '#4e4228' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(196,85,110,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2} />
          Sign out
        </button>
      </div>

    </aside>
  )
}
