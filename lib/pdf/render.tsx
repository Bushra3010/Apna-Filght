import 'server-only'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { registerFonts } from './kit'

/** Render pages into one PDF and send it (inline = open in the browser, else download). */
export async function pdfResponse(pages: React.ReactElement[], title: string, filename: string, download = false) {
  registerFonts()
  const buf = await renderToBuffer(<Document title={title} creator="Apna Flight" producer="Apna Flight">{pages}</Document>)
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
