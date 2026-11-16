import 'server-only'
import path from 'node:path'
import { Font, StyleSheet, Text, View } from '@react-pdf/renderer'

// Noto Sans (SIL OFL): "latin" has the letters, "latin-ext" has the ₹ sign; react-pdf falls back glyph by glyph.
const dir = path.join(process.cwd(), 'assets/fonts')
let registered = false
export function registerFonts() {
  if (registered) return
  for (const [family, subset] of [['Noto', 'latin'], ['NotoExt', 'latin-ext']] as const) {
    Font.register({
      family,
      fonts: [
        { src: path.join(dir, `noto-sans-${subset}-400-normal.woff`), fontWeight: 400 },
        { src: path.join(dir, `noto-sans-${subset}-700-normal.woff`), fontWeight: 700 },
      ],
    })
  }
  Font.registerHyphenationCallback((w) => [w]) // never split words
  registered = true
}

export const INK = '#1b2325'
export const MUTED = '#5f6b6e'
export const RULE = '#d9dedf'

export const s = StyleSheet.create({
  page: { fontFamily: ['Noto', 'NotoExt'], fontSize: 9, color: INK, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, lineHeight: 1.4 },
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: RULE, paddingBottom: 10, marginBottom: 10 },
  company: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 13, fontWeight: 700, letterSpacing: 1, textAlign: 'right', marginBottom: 2 },
  label: { fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  muted: { color: MUTED },
  bold: { fontWeight: 700 },
  right: { textAlign: 'right' },
  th: { fontSize: 7.5, color: MUTED, fontWeight: 700, paddingVertical: 5, paddingRight: 6 },
  td: { paddingVertical: 5, paddingRight: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE },
  section: { marginTop: 12 },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, fontSize: 7, color: MUTED, flexDirection: 'row', justifyContent: 'space-between' },
})

export type Company = {
  name: string
  legal_name: string | null
  address_line1: string | null
  address_line2: string | null
  pincode: string | null
  mobile: string | null
  email: string | null
  gstin: string | null
  state: { name: string; gst_code: string | null } | null
}

export const COMPANY_COLS = 'name, legal_name, address_line1, address_line2, pincode, mobile, email, gstin, invoice_terms, states(name, gst_code)'

export function CompanyBlock({ c }: { c: Company }) {
  return (
    <View style={{ maxWidth: 300 }}>
      <Text style={s.company}>{c.legal_name || c.name}</Text>
      {(c.address_line1 || c.address_line2) && <Text>{[c.address_line1, c.address_line2].filter(Boolean).join(', ')}</Text>}
      {(c.state || c.pincode) && <Text>{[c.state?.name, c.pincode].filter(Boolean).join(' – ')}</Text>}
      {(c.mobile || c.email) && <Text>{[c.mobile, c.email].filter(Boolean).join(' · ')}</Text>}
      {c.gstin && <Text>GSTIN: {c.gstin}</Text>}
    </View>
  )
}

export function KV({ k, v, strong, top }: { k: string; v: string; strong?: boolean; top?: boolean }) {
  return (
    <View style={[s.between, { paddingVertical: 1.5 }, top ? { borderTopWidth: 1, borderTopColor: RULE, marginTop: 3, paddingTop: 4 } : {}]}>
      <Text style={strong ? [s.bold, { fontSize: 10.5 }] : undefined}>{k}</Text>
      <Text style={strong ? [s.bold, { fontSize: 10.5 }] : undefined}>{v}</Text>
    </View>
  )
}

export function PageFooter({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : '')} />
    </View>
  )
}

export const dateIN = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')

/** A safe file name piece, e.g. INV-0001 */
export const fileSafe = (v: string) => v.replace(/[^A-Za-z0-9_-]+/g, '-')
