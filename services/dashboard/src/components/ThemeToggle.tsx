'use client'

import { Sun, Moon } from '@/components/icons'
import { useTheme } from './ThemeProvider'

/**
 * Light/dark theme switch. Shows the icon for the theme you'd switch TO.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      className={`text-fg-subtle hover:text-fg transition-colors p-1 ${className}`}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
