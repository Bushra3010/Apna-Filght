'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Downloads the table with the given id as CSV (what you see is what you get). */
export function CsvButton({ tableId, filename }: { tableId: string; filename: string }) {
  function download() {
    const table = document.getElementById(tableId)
    if (!table) return
    const rows = [...table.querySelectorAll('tr')].map((tr) =>
      [...tr.querySelectorAll('th,td')]
        .map((c) => {
          const t = (c.textContent ?? '').replace(/\s+/g, ' ').trim()
          return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
        })
        .join(','),
    )
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <Button type="button" variant="outline" onClick={download}>
      <Download /> CSV
    </Button>
  )
}
