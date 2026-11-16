'use client'

import { useActionState, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { inviteMember } from './actions'

export function InviteForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [state, action] = useActionState(inviteMember, undefined)
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <Field label="Email" htmlFor="invite-email" required><Input id="invite-email" name="email" type="email" required /></Field>
        <Field label="Role" htmlFor="invite-role">
          <NativeSelect id="invite-role" name="role_id" defaultValue={roles.find((r) => r.name === 'Sales')?.id ?? roles[0]?.id}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </Field>
        <SubmitButton>Create invite link</SubmitButton>
      </form>
      <FormError state={state} />
      {state?.link && (
        <div className="grid gap-2 rounded-2xl bg-primary/10 p-4 text-sm">
          <p className="font-medium text-primary">Invite link ready. Send it to them on WhatsApp or email; it works once, for that email, within 7 days.</p>
          <div className="flex gap-2">
            <Input readOnly value={state.link} aria-label="Invite link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(state.link!); setCopied(true) }}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
