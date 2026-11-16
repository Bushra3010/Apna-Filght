'use client'

import { useEffect, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { InvoiceData } from '@/lib/pdf/invoice'
import type { VoucherData } from '@/lib/pdf/voucher'
import type { QuotationData } from '@/lib/pdf/quotation'

export type PdfDoc =
  | { kind: 'invoices'; docs: InvoiceData[] }
  | { kind: 'voucher'; doc: VoucherData }
  | { kind: 'quotation'; doc: QuotationData }

/**
 * Draws the PDF in the browser (react-pdf) and shows it with Download / Print.
 * Cloudflare Workers can't run react-pdf's layout engine (it compiles WebAssembly at runtime),
 * and keeping it off the server keeps the Worker small.
 */
export function PdfView({ doc, title, filename, download }: { doc: PdfDoc; title: string; filename: string; download?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let revoked = false
    let made: string | null = null
    ;(async () => {
      const [{ pdf, Document }, kit, inv, vou, quo] = await Promise.all([
        import('@react-pdf/renderer'), import('@/lib/pdf/kit'), import('@/lib/pdf/invoice'), import('@/lib/pdf/voucher'), import('@/lib/pdf/quotation'),
      ])
      kit.registerFonts(window.location.origin)
      const pages =
        doc.kind === 'invoices' ? doc.docs.map((d) => <inv.InvoicePage key={d.inv.id} d={d} />)
          : doc.kind === 'voucher' ? [<vou.VoucherPage key="v" d={doc.doc} />]
            : [<quo.QuotationPage key="q" d={doc.doc} />]
      const blob = await pdf(<Document title={title} creator="Apna Flight" producer="Apna Flight">{pages}</Document>).toBlob()
      if (revoked) return
      made = URL.createObjectURL(blob)
      setUrl(made)
      if (download) save(made, filename)
    })().catch((e) => setError(e instanceof Error ? e.message : 'Could not make the PDF'))
    return () => { revoked = true; if (made) URL.revokeObjectURL(made) }
  }, [doc, title, filename, download])

  if (error) return <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
  if (!url) return <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground">Preparing the PDF…</p>
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save(url, filename)}><Download /> Download {filename}</Button>
        <Button variant="outline" onClick={() => { const w = window.open(url); w?.addEventListener('load', () => w.print()) }}><Printer /> Print</Button>
      </div>
      <iframe src={url} title={title} className="h-[80svh] w-full rounded-3xl border border-border bg-white" />
    </div>
  )
}

function save(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
