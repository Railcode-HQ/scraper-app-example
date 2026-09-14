import { useEffect, useState } from 'react'
import { logoUrl } from './api'
import { THEMES, useTheme } from './theme'

/** One 16px stroke icon set, so nothing here pulls in an icon package. */
const PATHS: Record<string, string> = {
  search: 'M7.5 13a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM14 14l-2.6-2.6',
  x: 'M4 4l8 8M12 4l-8 8',
  check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
  chevron: 'M6 3.5 10.5 8 6 12.5',
  alert: 'M8 5.5v3.5M8 11.5h.01M6.8 2.4 1.6 11.3a1.4 1.4 0 0 0 1.2 2.1h10.4a1.4 1.4 0 0 0 1.2-2.1L9.2 2.4a1.4 1.4 0 0 0-2.4 0Z',
  empty: 'M2 5.5 8 2l6 3.5v5L8 14l-6-3.5v-5ZM2 5.5 8 9m0 0 6-3.5M8 9v5',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.6l-3.8 2 .7-4.2-3.1-3 4.3-.6L8 1.8Z',
  external: 'M9.5 2.5H13.5V6.5M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  filter: 'M2.5 4h11M4.5 8h7M6.5 12h3',
  list: 'M5.5 4.5h9M5.5 8h9M5.5 11.5h9M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01',
  layers: 'M8 1.8 14.2 5 8 8.2 1.8 5 8 1.8ZM1.8 8 8 11.2 14.2 8M1.8 11 8 14.2 14.2 11',
  activity: 'M1.8 8h3l2-5 2.5 10L11.5 8h2.7',
  play: 'M5 3.2v9.6l8-4.8-8-4.8Z',
  stop: 'M4.5 4.5h7v7h-7z',
  trash: 'M2.8 4.2h10.4M6.2 4.2V2.8h3.6v1.4M4.2 4.2l.6 9a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-9',
  arrow: 'M3 8h10M9 4l4 4-4 4',
  back: 'M13 8H3M7 4 3 8l4 4',
  link: 'M6.5 9.5a2.6 2.6 0 0 0 3.9.3l2-2a2.6 2.6 0 0 0-3.7-3.7l-1.1 1.1M9.5 6.5a2.6 2.6 0 0 0-3.9-.3l-2 2a2.6 2.6 0 0 0 3.7 3.7l1.1-1.1',
  download: 'M8 2.5v7.5m0 0 3.2-3.2M8 10 4.8 6.8M2.5 11.5v1.4a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.4',
  bookmark: 'M4 2.6h8a.5.5 0 0 1 .5.5v10.3l-4.5-3.2-4.5 3.2V3.1a.5.5 0 0 1 .5-.5Z',
  plus: 'M8 3.5v9M3.5 8h9',
  minus: 'M3.5 8h9',
  caretdown: 'M4 6.5 8 10.5 12 6.5',
  refresh: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3.5H10',
  sun: 'M8 2.1v1.5M8 12.4v1.5M2.1 8h1.5M12.4 8h1.5M3.8 3.8l1.1 1.1M11.1 11.1l1.1 1.1M12.2 3.8l-1.1 1.1M4.9 11.1l-1.1 1.1M8 5.1a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z',
  moon: 'M13.3 9.7A5.7 5.7 0 0 1 6.3 2.7a5.9 5.9 0 1 0 7 7Z',
  monitor: 'M2.6 3.4h10.8a1 1 0 0 1 1 1v6.1a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1ZM5.6 14h4.8M8 11.5V14',
  note: 'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM5.5 5.8h5M5.5 8.4h5M5.5 11h3',
}

export function Icon({ name, fill }: { name: keyof typeof PATHS | string; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}

/**
 * Three-way, because "follow the OS" is a real preference and not the same as
 * whichever of light/dark the OS happens to be showing right now.
 */
export function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  return (
    <div className="themeswitch" role="radiogroup" aria-label="Color theme">
      {THEMES.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={option.label}
          title={`${option.label} theme`}
          className={theme === option.value ? 'themetab on' : 'themetab'}
          onClick={() => setTheme(option.value)}
        >
          <Icon name={option.icon} />
        </button>
      ))}
    </div>
  )
}

const STATUS_TINT: Record<string, string> = {
  Active: 't-green',
  Public: 't-accent',
  Acquired: 't-violet',
  Inactive: 't-dim',
}

export function StatusBadge({ status }: { status: string }) {
  if (!status || status === 'Active') return null
  return <span className={`badge ${STATUS_TINT[status] ?? 't-dim'}`}>{status}</span>
}

export function Logo({
  src,
  name,
  className = 'logo',
}: {
  src: string | null
  name: string
  className?: string
}) {
  const url = logoUrl(src)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])

  // A dead logo URL should read as a quiet initial, not a broken-image glyph.
  if (!url || failed) {
    return (
      <div className={`${className} ph`} aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </div>
    )
  }
  return (
    <img
      className={className}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

export const fmt = new Intl.NumberFormat('en-US')

/** Run costs are cents-scale, so don't round them away to "$0.00". */
export function money(usd: number): string {
  if (!usd) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}
