import { AuthForm } from '../auth-form'
import { signUp } from '../actions'
import { safeNext } from '@/lib/next-path'

export const metadata = { title: 'Create account' }

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-muted-foreground">{next?.startsWith('/invite/') ? 'Use the email address your invite was sent to.' : 'You’ll set up your company on the next step.'}</p>
      <AuthForm action={signUp} mode="signup" next={safeNext(next) ?? undefined} />
    </>
  )
}
