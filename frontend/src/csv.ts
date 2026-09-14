/** CSV export. Rows are built by the view, so what you download is what you see. */

/**
 * Spreadsheets treat a leading =, +, or @ as a formula, and these values come
 * from pages we don't control — so neutralise them rather than hand someone a
 * sheet that executes on open.
 */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
}

export function download(filename: string, csv: string): void {
  // The BOM is what makes Excel read it as UTF-8 — several vendor names here
  // are non-Latin, and without it they arrive as mojibake.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const stamp = () => new Date().toISOString().slice(0, 10)
