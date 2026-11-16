'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { FormError, SubmitButton } from '@/components/form'
import { ACTION_LABEL, MODULES, type Permissions } from '@/lib/permissions'
import { saveRole } from './actions'

export function RoleForm({ role, canEdit }: { role: { id?: string; name: string; is_owner?: boolean; permissions: Permissions }; canEdit: boolean }) {
  const [state, action] = useActionState(saveRole, undefined)
  const locked = !canEdit || role.is_owner
  return (
    <form action={action} className="grid gap-3 rounded-3xl bg-card p-5">
      <input type="hidden" name="id" value={role.id ?? ''} />
      <div className="flex items-center gap-3">
        <Input name="name" aria-label="Role name" defaultValue={role.name} placeholder="New role name" disabled={locked} className="max-w-xs font-semibold" required />
        {role.is_owner && <span className="text-xs text-muted-foreground">Owner always has every permission</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {MODULES.map((m) => (
              <tr key={m.key} className="border-b border-border last:border-0">
                <td className="py-2 pr-4 text-muted-foreground">{m.label}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-3">
                    {m.actions.map((a) => (
                      <label key={a} className="flex items-center gap-1.5">
                        <input type="checkbox" name={`${m.key}:${a}`} className="size-4" disabled={locked}
                          defaultChecked={role.is_owner || (role.permissions?.[m.key] ?? []).includes(a)} />
                        {ACTION_LABEL[a]}
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormError state={state} />
      {!locked && <div><SubmitButton>{role.id ? 'Save role' : 'Add role'}</SubmitButton></div>}
    </form>
  )
}
