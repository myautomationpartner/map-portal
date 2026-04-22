import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, MessageSquare, Settings, LogOut, FolderOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getSessionClaims } from '../lib/portalApi'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FolderOpen,      label: 'Documents'  },
  { to: '/post',     icon: Send,            label: 'Publisher'  },
  { to: '/inbox',    icon: MessageSquare,   label: 'Inbox'      },
  { to: '/settings', icon: Settings,        label: 'Settings'   },
]

export default function Sidebar({ session }) {
  const claims = getSessionClaims(session)

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <aside className="portal-surface hidden fixed left-0 top-0 z-40 h-full w-64 flex-col border-r border-transparent md:flex">

      <div className="flex items-center gap-3 border-b px-6 py-7" style={{ borderColor: 'var(--portal-border)' }}>
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: 'rgba(85, 103, 255, 0.15)' }}>
          <img
            src="https://pub-ba8be99ab92a493c8f41012c737905d5.r2.dev/dancescapes%20logo.jpg"
            alt="Dancescapes"
            className="w-full h-full object-cover"
            onError={e => {
              e.target.style.display = 'none'
              e.target.parentElement.innerHTML = '<span style="color:#5567ff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">D</span>'
            }}
          />
        </div>
        <div>
          <p className="font-display text-lg font-semibold leading-tight" style={{ color: 'var(--portal-text)' }}>
            Dancescapes
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--portal-text-soft)' }}>
            Partner Portal
          </p>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="rounded-3xl px-4 py-4" style={{ background: 'linear-gradient(135deg, rgba(85, 103, 255, 0.13), rgba(34, 195, 238, 0.1))', border: '1px solid rgba(85, 103, 255, 0.14)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--portal-text-soft)' }}>
            Workspace
          </p>
          <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--portal-text)' }}>
            Documents, publishing, and client updates in one place.
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                isActive ? 'active-nav' : 'inactive-nav'
              }`
            }
            style={({ isActive }) => isActive
              ? { background: 'linear-gradient(135deg, rgba(85, 103, 255, 0.14), rgba(139, 92, 246, 0.1))', color: 'var(--portal-primary)', border: '1px solid rgba(85, 103, 255, 0.2)', boxShadow: '0 12px 26px rgba(85, 103, 255, 0.12)' }
              : { color: 'var(--portal-text-muted)', border: '1px solid transparent' }
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative flex items-center justify-center rounded-xl p-2" style={{ background: isActive ? 'rgba(255,255,255,0.75)' : 'rgba(238,242,255,0.65)' }}>
                  <Icon
                    className="h-4 w-4 transition-colors"
                    style={{ color: isActive ? 'var(--portal-primary)' : 'var(--portal-text-soft)' }}
                    strokeWidth={2.2}
                  />
                  {to === '/inbox' && (
                    <span className="absolute -right-2.5 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 bg-violet-600 px-1 text-[9px] font-black text-white shadow-sm"
                      style={{ borderColor: 'white' }}>
                      3
                    </span>
                  )}
                </div>
                {label}
                {isActive && (
                  <div className="ml-auto h-3 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, var(--portal-primary), var(--portal-secondary))', boxShadow: '0 0 12px rgba(85, 103, 255, 0.35)' }} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-5" style={{ borderTop: '1px solid var(--portal-border)' }}>
        <div className="mb-3 flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid var(--portal-border)' }}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--portal-primary), var(--portal-secondary))' }}>
            {session?.user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[11px] font-semibold" style={{ color: 'var(--portal-text)' }}>{session?.user?.email}</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--portal-text-soft)' }}>
              {claims.user_role || 'verified client'} · {claims.client_slug || 'tenant'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="portal-button-ghost group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200"
        >
          <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          Sign out
        </button>
      </div>

    </aside>
  )
}
