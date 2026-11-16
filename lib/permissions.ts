// Modules and actions for roles. The database checks these with app.can(org, module, action).
export const MODULES = [
  { key: 'lead', label: 'Leads & follow-ups', actions: ['view', 'create', 'edit'] },
  { key: 'quotation', label: 'Quotations & itineraries', actions: ['view', 'create', 'edit'] },
  { key: 'invoice', label: 'Invoices, proformas, credit notes', actions: ['view', 'create', 'edit', 'post'] },
  { key: 'purchase', label: 'Purchase bills & groups', actions: ['view', 'create', 'edit', 'post'] },
  { key: 'voucher', label: 'Receipts, payments, journals', actions: ['view', 'create', 'edit', 'post'] },
  { key: 'reports', label: 'Reports & GST', actions: ['view'] },
  { key: 'accounts', label: 'Year-end & opening balances', actions: ['admin'] },
  { key: 'users', label: 'Team & roles', actions: ['edit'] },
  { key: 'org', label: 'Company settings', actions: ['edit'] },
] as const

export const ACTION_LABEL: Record<string, string> = { view: 'View', create: 'Create', edit: 'Edit', post: 'Post', admin: 'Manage' }

export type Permissions = Record<string, string[]>

export function can(role: { is_owner: boolean; permissions: Permissions } | null | undefined, module: string, action: string) {
  if (!role) return false
  return role.is_owner || (role.permissions?.[module] ?? []).includes(action)
}
