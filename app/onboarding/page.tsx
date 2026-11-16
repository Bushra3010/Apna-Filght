import { redirect } from 'next/navigation'
import { Plane } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CompanyForm } from './company-form'

export const metadata = { title: 'Set up your company' }

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { count } = await supabase.from('org_members').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  if (count) redirect('/dashboard')

  const { data: states } = await supabase.from('states').select('gst_code, name').not('gst_code', 'is', null).order('name')

  // Indian financial year: 1 April
  const now = new Date()
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="size-4" />
          </span>
          Set up your company
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          We’ll create your chart of accounts, tax ledgers and document numbering. You can add GSTIN, address and bank
          details later in Settings.
        </p>
        <CompanyForm states={(states ?? []) as { gst_code: string; name: string }[]} fyStart={`${y}-04-01`} />
      </div>
    </main>
  )
}
