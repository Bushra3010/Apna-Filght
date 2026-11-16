'use client'

import { useActionState, useRef } from 'react'
import { FormError, type FormState } from '@/components/form'

/** A form bound to a server action that shows its error and resets after success. */
export function ActionForm({
  action,
  className,
  children,
  resetOnSuccess = true,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>
  className?: string
  children: React.ReactNode
  resetOnSuccess?: boolean
}) {
  const ref = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState(async (s: FormState, f: FormData) => {
    const r = await action(s, f)
    if (!r?.error && resetOnSuccess) ref.current?.reset()
    return r
  }, undefined)
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="col-span-full"><FormError state={state} /></div>
    </form>
  )
}
