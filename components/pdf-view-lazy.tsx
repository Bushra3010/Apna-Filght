'use client'

import dynamic from 'next/dynamic'

/** Browser-only: keeps react-pdf (and its WebAssembly layout engine) out of the server bundle. */
export const PdfView = dynamic(() => import('./pdf-view').then((m) => m.PdfView), {
  ssr: false,
  loading: () => <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground">Preparing the PDF…</p>,
})
