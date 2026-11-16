'use client'

import { FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function JsonDownload({ data, filename, disabled }: { data: unknown; filename: string; disabled?: boolean }) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={() => {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = filename
        a.click()
        URL.revokeObjectURL(a.href)
      }}
    >
      <FileJson /> Download JSON
    </Button>
  )
}
