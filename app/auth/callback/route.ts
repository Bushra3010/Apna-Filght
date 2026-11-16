import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/next-path'

// Email confirmation / magic links land here with ?code=...
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${safeNext(searchParams.get('next')) ?? '/dashboard'}`)
  }
  const next = safeNext(searchParams.get('next'))
  return NextResponse.redirect(`${origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`)
}
