import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from '@/lib/supabase/env'

const PUBLIC_PATHS = ['/login', '/signup', '/auth']

// Refreshes the Supabase session cookie on every request and sends
// signed-out visitors to /login. Real authorisation happens in the
// database (RLS) and in each server action.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, key } = supabaseEnv()

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v))
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const signedIn = !!data?.claims
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))

  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone()
    to.pathname = '/login'
    to.search = ''
    if (path !== '/' && path !== '/dashboard') to.searchParams.set('next', path + request.nextUrl.search)
    return NextResponse.redirect(to)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
