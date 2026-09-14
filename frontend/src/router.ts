import { useCallback, useEffect, useState } from 'react'

export interface Loc {
  pathname: string
  search: string
}

/**
 * Everything that decides what you're looking at lives in the URL — the section,
 * the open company, the filter set. These pages get pasted into Slack, and a
 * link has to reopen exactly what the sender saw. Small enough not to warrant a
 * router dependency.
 */
export function useLocation(): [Loc, (to: string, replace?: boolean) => void] {
  const [loc, setLoc] = useState<Loc>(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))

  useEffect(() => {
    const onPop = () =>
      setLoc({ pathname: window.location.pathname, search: window.location.search })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, replace = false) => {
    const url = new URL(to, window.location.origin)
    const next = url.pathname + url.search
    if (next === window.location.pathname + window.location.search) return
    window.history[replace ? 'replaceState' : 'pushState'](null, '', next)
    setLoc({ pathname: url.pathname, search: url.search })
  }, [])

  return [loc, navigate]
}

export type Route =
  | { name: 'yc'; slug: string | null }
  | { name: 'collections' }
  | { name: 'collection'; collection: string }
  | { name: 'runs'; id: string | null }
  | { name: 'lists'; id: string | null }
  | { name: 'custom' }

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (parts[0] === 'collections') {
    return parts[1] ? { name: 'collection', collection: parts[1] } : { name: 'collections' }
  }
  if (parts[0] === 'runs') return { name: 'runs', id: parts[1] ?? null }
  if (parts[0] === 'lists') return { name: 'lists', id: parts[1] ?? null }
  if (parts[0] === 'custom') return { name: 'custom' }
  // Anything else is the YC source — it's the app's front door.
  return { name: 'yc', slug: parts[0] === 'yc' && parts[1] ? parts[1] : null }
}
