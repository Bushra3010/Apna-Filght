import { AuthForm } from '../auth-form'
import { signUp } from '../actions'

export const metadata = { title: 'Create account' }

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-5 text-sm text-muted-foreground">You’ll set up your company on the next step.</p>
      <AuthForm action={signUp} mode="signup" />
    </>
  )
}
