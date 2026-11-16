// Turn database errors into messages a user can act on.
export function friendlyError(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.'
  if (message.includes('duplicate key') && message.includes('ledgers_org_id_name')) return 'A ledger with this name already exists.'
  if (message.includes('duplicate key')) return 'That record already exists.'
  if (message.includes('row-level security')) return 'You do not have access to this company’s data.'
  if (message.includes('invoice_lines_check')) return 'A line’s amounts do not add up. Please re-check the figures.'
  if (message.includes('gstin')) return 'GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5.'
  return message.replace(/^.*?ERROR:\s*/, '')
}
