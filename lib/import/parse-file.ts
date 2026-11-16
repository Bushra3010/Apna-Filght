'use client'
// Reads .xlsx / .csv in the browser so files never need to be uploaded whole.

export type Sheet = { headers: string[]; rows: Record<string, string>[] }

function csvRows(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const delim = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); out.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); out.push(row) }
  return out.filter((r) => r.some((x) => x.trim()))
}

function toSheet(grid: string[][]): Sheet {
  // header row = first row with at least 2 non-empty cells (skips report titles above the table)
  const hi = grid.findIndex((r) => r.filter((x) => String(x).trim()).length >= 2)
  if (hi < 0) return { headers: [], rows: [] }
  const seen = new Map<string, number>()
  const headers = grid[hi].map((h, i) => {
    const base = String(h ?? '').trim() || `Column ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n > 1 ? `${base} (${n})` : base
  })
  const rows = grid
    .slice(hi + 1)
    .filter((r) => r.some((x) => String(x ?? '').trim()))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()])))
  return { headers, rows }
}

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: string; richText?: { text: string }[] }
    if (o.result !== undefined) return cellText(o.result)
    if (o.richText) return o.richText.map((t) => t.text).join('')
    if (o.text) return o.text
  }
  return String(v)
}

export async function parseFile(file: File): Promise<Sheet> {
  if (file.size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB')
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) return toSheet(csvRows(await file.text()))
  if (name.endsWith('.xls')) throw new Error('Old .xls files are not supported. Open it in Excel and save as .xlsx or .csv.')
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets.find((w) => w.actualRowCount > 1) ?? wb.worksheets[0]
  if (!ws) return { headers: [], rows: [] }
  const grid: string[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as unknown[] // 1-based
    grid.push(vals.slice(1).map(cellText))
  })
  return toSheet(grid)
}

/** A sample file with the standard headers, so people can start from a template. */
export function downloadCsv(filename: string, headers: string[], rows: string[][] = []) {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const text = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
