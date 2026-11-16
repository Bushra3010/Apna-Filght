import { AuthForm } from '../auth-form'
import { signIn } from '../actions'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ 'check-email'?: string }> }) {
  const sp = await searchParams
  return (
    <>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">Leads, billing and accounts for your travel business.</p>
      {sp['check-email'] && (
        <p className="mb-4 rounded-2xl bg-primary/10 px-3 py-2 text-sm">
          Check your inbox to confirm your email, then sign in.
        </p>
      )}
      <AuthForm action={signIn} mode="login" />
    </>
  )
}
