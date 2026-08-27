import { Bell } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'

export default function MobilePartnerTopBar({ notificationCount = 0, inboxUnreadCount = 0 }) {
  const navigate = useNavigate()
  const count = Math.max(0, Number(notificationCount || 0))
  const unreadCount = Math.max(0, Number(inboxUnreadCount || 0))
  const alertCount = Math.max(count, unreadCount)

  return (
    <header className="mobile-partner-topbar">
      <div className="mobile-partner-topbar-row">
        <button
          type="button"
          className="mobile-partner-topbar-brand"
          onClick={() => navigate('/settings')}
          aria-label="Open Settings"
        >
          <img src="/assets/map-option-b-mark.png" alt="My Automation Partner" />
          <div>
            <span className="mobile-partner-topbar-title">My Partner</span>
            <span className="mobile-partner-live"><i aria-hidden="true" />Live</span>
          </div>
        </button>

        <button
          type="button"
          className="mobile-partner-alerts"
          onClick={() => navigate('/notifications')}
          aria-label={alertCount ? `${alertCount} items need attention. Open notifications.` : 'Open notifications'}
        >
          <Bell size={23} weight="regular" />
          {alertCount ? <span>{alertCount > 9 ? '9+' : alertCount}</span> : null}
        </button>
      </div>
    </header>
  )
}
