'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Field, FormError, SubmitButton, type FormState } from '@/components/form'

export function AuthForm({
  action,
  mode,
  next,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>
  mode: 'login' | 'signup'
  next?: string
}) {
  const [state, formAction] = useActionState(action, undefined)
  return (
    <form action={formAction} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={8}
          required
        />
      </Field>
      <FormError state={state} />
      <SubmitButton className="w-full">{mode === 'login' ? 'Sign in' : 'Create account'}</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        {mode === 'login' ? (
          <>
            New to Apna Flight? <Link className="text-primary underline-offset-4 hover:underline" href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}>Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link className="text-primary underline-offset-4 hover:underline" href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>Sign in</Link>
          </>
        )}
      </p>
    </form>
  )
}
