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
    <aside className="hidden md:flex fixed top-0 left-0 h-full w-64 flex-col bg-zinc-950 border-r border-zinc-900/50 z-40">

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-8 border-b border-zinc-900/50">
        <div className="w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center overflow-hidden">
          <img
            src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
            alt="Dancescapes"
            className="w-7 h-7 object-contain"
            onError={e => {
              e.target.style.display = 'none'
              e.target.parentElement.innerHTML = '<span class="text-brand-gold font-bold text-xl">D</span>'
            }}
          />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight uppercase tracking-tighter">Dancescapes</p>
          <p className="text-[10px] text-brand-gold/60 leading-tight font-medium uppercase tracking-widest">Partner Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group ${
                isActive
                  ? 'bg-brand-gold/10 text-brand-gold border border-brand-gold/20'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-900/50'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative flex items-center justify-center">
                  <Icon
                    className={`w-4.5 h-4.5 transition-colors ${isActive ? 'text-brand-gold' : 'text-zinc-500 group-hover:text-zinc-300'}`}
                    strokeWidth={2.2}
                  />
                  {to === '/inbox' && (
                    <span className="absolute -top-2 -right-2.5 flex items-center justify-center min-w-[17px] h-[17px] bg-rose-600 text-white text-[9px] font-black px-1 rounded-full border-2 border-zinc-950 shadow-lg z-10">
                      3
                    </span>
                  )}
                </div>
                {label}
                {isActive && (
                  <div className="ml-auto w-1 h-3 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(194,160,83,0.5)]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-4 py-6 border-t border-zinc-900/50">
        <div className="flex items-center gap-3 px-3 py-2.5 mb-2 bg-zinc-900/30 rounded-2xl border border-zinc-800/20">
          <div className="w-8 h-8 rounded-full bg-brand-gold flex items-center justify-center text-zinc-950 text-xs font-black shrink-0">
            {session?.user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-white truncate">{session?.user?.email}</p>
            <p className="text-[9px] text-brand-gold uppercase font-bold tracking-tighter opacity-80">Verified Client</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-zinc-600 hover:text-rose-400 hover:bg-rose-500/5 transition-all duration-200 group"
        >
          <LogOut className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
          Sign out
        </button>
      </div>

    </aside>
  )
}
