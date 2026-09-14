import { useCallback, useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const KEY = 'scrape.theme'

export const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
]

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Private-mode storage throws on read. Falling back to system is correct.
  }
  return 'system'
}

/**
 * "system" is the absence of the attribute, not a third value: the stylesheet's
 * `color-scheme: light dark` already follows the OS, and light-dark() resolves
 * against it. Pinning a theme just narrows that to `only light` / `only dark`.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, set] = useState<Theme>(readTheme)

  useEffect(() => applyTheme(theme), [theme])

  // Two tabs open on the same app shouldn't disagree about the theme.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) set(readTheme())
    }
    addEventListener('storage', onStorage)
    return () => removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    set(next)
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      // Storage is a nice-to-have; the theme still applies for this session.
    }
  }, [])

  return [theme, setTheme]
}
