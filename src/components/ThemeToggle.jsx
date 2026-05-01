import { Monitor, Moon, Sun } from 'lucide-react'

const labels = {
  light: 'Light',
  dark: 'Dark',
}

export default function ThemeToggle({ theme = 'dark', onToggle, compact = false }) {
  const isLight = theme === 'light'
  const Icon = isLight ? Sun : Moon
  const nextTheme = isLight ? 'dark' : 'light'

  return (
    <button
      type="button"
      onClick={() => onToggle?.(nextTheme)}
      className={`portal-theme-toggle ${compact ? 'portal-theme-toggle-compact' : ''}`}
      aria-label={`Switch to ${labels[nextTheme]} mode`}
      title={`Switch to ${labels[nextTheme]} mode`}
    >
      <span className="portal-theme-toggle-icon">
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="portal-theme-toggle-label">
          <span>{labels[theme] || 'Dark'}</span>
          <Monitor className="h-3.5 w-3.5" strokeWidth={2.1} />
        </span>
      )}
    </button>
  )
}
