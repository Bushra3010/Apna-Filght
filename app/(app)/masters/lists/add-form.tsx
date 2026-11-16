'use client'

import { useActionState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { FormError, SubmitButton } from '@/components/form'
import { addLookup } from './actions'

export function AddLookupForm({ kind, label }: { kind: string; label: string }) {
  const ref = useRef<HTMLFormElement>(null)
  const [state, action] = useActionState(async (s: Awaited<ReturnType<typeof addLookup>>, f: FormData) => {
    const r = await addLookup(s, f)
    if (!r?.error) ref.current?.reset()
    return r
  }, undefined)
  return (
    <form ref={ref} action={action} className="grid gap-2">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex max-w-md gap-2">
        <Input name="name" aria-label={`New ${label}`} placeholder={`Add to ${label.toLowerCase()}`} maxLength={80} required />
        <SubmitButton>Add</SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  )
}
