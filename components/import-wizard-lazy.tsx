'use client'

import dynamic from 'next/dynamic'

/**
 * The import wizard only runs in the browser (it reads the file there). Loading it with ssr: false
 * keeps the Excel reader (exceljs, ~1 MB) out of the server bundle, which must stay small on Cloudflare.
 */
export const ImportWizard = dynamic(() => import('./import-wizard').then((m) => m.ImportWizard), {
  ssr: false,
  loading: () => <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground">Loading the importer…</p>,
})
