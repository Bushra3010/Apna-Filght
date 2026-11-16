import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plane } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { acceptInvite } from './actions'

export const metadata = { title: 'Join a company' }

type Info = { org_name: string; role_name: string; email: string; expired: boolean; accepted: boolean; email_matches: boolean }

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
  const { data } = await supabase.rpc('invite_info', { p_token: token })
  const info = ((data ?? []) as Info[])[0]

  let body: React.ReactNode
  if (!info) body = <p className="text-sm text-muted-foreground">This invite link isn’t valid. Ask for a new one.</p>
  else if (info.accepted) body = <p className="text-sm text-muted-foreground">This invite has already been used. <Link href="/dashboard" className="text-primary underline">Go to your dashboard</Link>.</p>
  else if (info.expired) body = <p className="text-sm text-muted-foreground">This invite has expired. Ask {info.org_name} to send a new one.</p>
  else if (!info.email_matches)
    body = (
      <p className="text-sm text-muted-foreground">
        This invite is for <span className="font-medium text-foreground">{info.email}</span>, but you’re signed in as {user.email}. Sign out and sign in (or create an account) with {info.email}.
      </p>
    )
  else
    body = (
      <form action={acceptInvite} className="grid gap-4">
        <input type="hidden" name="token" value={token} />
        <p className="text-sm">You’ve been invited to join <span className="font-semibold">{info.org_name}</span> as <span className="font-semibold">{info.role_name}</span>.</p>
        <Button type="submit" size="lg">Join {info.org_name}</Button>
      </form>
    )

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-card p-8">
        <div className="mb-5 flex items-center gap-3 text-2xl font-bold tracking-tight">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Plane className="size-5" /></span>
          Join a company
        </div>
        {error && <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>}
        {body}
      </div>
    </main>
  )
}
