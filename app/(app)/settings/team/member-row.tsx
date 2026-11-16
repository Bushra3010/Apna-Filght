'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { FormError, NativeSelect, SubmitButton } from '@/components/form'
import { updateMember } from './actions'

type M = { id: string; display_name: string; designation: string | null; mobile: string | null; role_id: string; reports_to: string | null; is_active: boolean }

export function MemberRow({ m, roles, members, isMe, canEdit }: { m: M; roles: { id: string; name: string }[]; members: { id: string; name: string }[]; isMe: boolean; canEdit: boolean }) {
  const [state, action] = useActionState(updateMember, undefined)
  return (
    <form action={action} className="grid gap-2 rounded-2xl bg-muted/60 p-4 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto_auto] lg:items-center">
      <input type="hidden" name="member_id" value={m.id} />
      <Input name="display_name" aria-label="Name" defaultValue={m.display_name} disabled={!canEdit} />
      <Input name="designation" aria-label="Designation" placeholder="Designation" defaultValue={m.designation ?? ''} disabled={!canEdit} />
      <Input name="mobile" aria-label="Mobile" placeholder="Mobile" defaultValue={m.mobile ?? ''} disabled={!canEdit} />
      <NativeSelect name="role_id" aria-label="Role" defaultValue={m.role_id} disabled={!canEdit}>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </NativeSelect>
      <NativeSelect name="reports_to" aria-label="Reports to" defaultValue={m.reports_to ?? ''} disabled={!canEdit}>
        <option value="">Reports to —</option>
        {members.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </NativeSelect>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" name="is_active" defaultChecked={m.is_active} disabled={!canEdit || isMe} className="size-4" /> Active
        {isMe && <input type="hidden" name="is_active" value="on" />}
      </label>
      {canEdit ? <SubmitButton>Save</SubmitButton> : <span />}
      <div className="lg:col-span-7"><FormError state={state} /></div>
    </form>
  )
}
