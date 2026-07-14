import { Bell, CalendarBlank, ChatCircleDots, PaperPlaneTilt } from '@phosphor-icons/react'
import { NavLink, useNavigate } from 'react-router-dom'

const MODES = [
  { id: 'inbox', label: 'Inbox', to: '/inbox', Icon: ChatCircleDots },
  { id: 'post', label: 'Post', to: '/', Icon: PaperPlaneTilt },
  { id: 'scheduled', label: 'Scheduled', to: '/post/scheduled', Icon: CalendarBlank },
]

export default function MobilePartnerTopBar({ activeMode, notificationCount = 0 }) {
  const navigate = useNavigate()
  const count = Math.max(0, Number(notificationCount || 0))

  function resetWorkspaceScroll() {
    document.querySelector('.portal-shell-mobile-partner > div > main')?.scrollTo({ top: 0, behavior: 'auto' })
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  return (
    <header className="mobile-partner-topbar">
      <div className="mobile-partner-topbar-row">
        <div className="mobile-partner-topbar-brand">
          <img src="/assets/map-option-b-mark.png" alt="My Automation Partner" />
          <div>
            <span className="mobile-partner-topbar-title">My Partner</span>
            <span className="mobile-partner-live"><i aria-hidden="true" />Live</span>
          </div>
        </div>

        <button
          type="button"
          className="mobile-partner-alerts"
          onClick={() => navigate('/settings')}
          aria-label={count ? `${count} notifications. Open mobile notification settings.` : 'Open mobile notification settings'}
        >
          <Bell size={23} weight="regular" />
          {count ? <span>{count > 9 ? '9+' : count}</span> : null}
        </button>
      </div>

      <nav className="mobile-partner-mode-nav" aria-label="My Partner workspaces">
        {MODES.map(({ id, label, to, Icon }) => (
          <NavLink
            key={id}
            to={to}
            end={id === 'post'}
            className="mobile-partner-mode-link"
            data-active={activeMode === id ? 'true' : undefined}
            aria-current={activeMode === id ? 'page' : undefined}
            onClick={resetWorkspaceScroll}
          >
            <Icon size={17} weight={activeMode === id ? 'fill' : 'regular'} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
