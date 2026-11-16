// WhatsApp message templates: shared by server pages and the settings form (no 'use client').

export type MessageDoc = 'invoice' | 'reminder' | 'receipt' | 'quotation'

export const MESSAGE_DOCS: { key: MessageDoc; label: string; vars: string[]; body: string }[] = [
  {
    key: 'invoice',
    label: 'Invoice',
    vars: ['client', 'doc_no', 'date', 'amount', 'balance', 'travel', 'company'],
    body: 'Dear {client},\n\nThank you for booking with {company}. Your invoice {doc_no} dated {date} for {amount} is attached.\n{travel}\n\nRegards,\n{company}',
  },
  {
    key: 'reminder',
    label: 'Payment reminder',
    vars: ['client', 'doc_no', 'date', 'amount', 'balance', 'due_date', 'company'],
    body: 'Dear {client},\n\nA gentle reminder that {balance} is pending against invoice {doc_no} dated {date}{due_date}. Please arrange the payment at the earliest.\n\nRegards,\n{company}',
  },
  {
    key: 'receipt',
    label: 'Payment receipt',
    vars: ['client', 'doc_no', 'date', 'amount', 'company'],
    body: 'Dear {client},\n\nWe have received {amount} on {date} (receipt {doc_no}). Thank you!\n\nRegards,\n{company}',
  },
  {
    key: 'quotation',
    label: 'Quotation',
    vars: ['client', 'doc_no', 'package', 'amount', 'valid_until', 'company'],
    body: 'Dear {client},\n\nPlease find our quotation {doc_no} for {package}: {amount} in total{valid_until}. The detailed plan is attached; happy to customise it for you.\n\nRegards,\n{company}',
  },
]

/** Replace {name} placeholders; unknown names are left as they are. Blank lines left by empty values are tidied. */
export function fillTemplate(body: string, vars: Record<string, string | null | undefined>): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (vars[k] ?? '') : m))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Indian mobile → wa.me digits (10 digits get 91 in front). Null when it doesn't look like a phone number. */
export function waNumber(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (d.length === 10) return `91${d}`
  if (d.length >= 11 && d.length <= 15) return d
  return null
}

/** A wa.me link; without a number WhatsApp asks which chat to send to. */
export function waLink(phone: string | null | undefined, text: string): string {
  const n = waNumber(phone)
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`
}

/** The saved body for a document type, or the default. */
export function templateFor(saved: { doc_type: string; body: string }[] | null | undefined, key: MessageDoc): string {
  return saved?.find((t) => t.doc_type === key)?.body ?? MESSAGE_DOCS.find((d) => d.key === key)!.body
}
