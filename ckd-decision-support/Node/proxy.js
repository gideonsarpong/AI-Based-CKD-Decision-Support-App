import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// These routes require login
const protectedPaths = ['/', '/dashboard', '/protocols', '/api/ai-recommendation'];

export default async function proxy(req) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  // Check if route is protected
  const isProtected = protectedPaths.some((route) => path.startsWith(route));
  if (!isProtected) return NextResponse.next();

  // Retrieve Supabase session token (stored in cookies by supabase-js)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${req.cookies.get('sb-access-token')?.value || ''}`,
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in, redirect to login page
  if (!user) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirectedFrom', path);
    return NextResponse.redirect(loginUrl);
  }

  // Otherwise continue
  return NextResponse.next();
}

// Specify which routes the proxy applies to
export const config = {
  matcher: ['/', '/dashboard/:path*', '/protocols/:path*', '/api/ai-recommendation'],
};