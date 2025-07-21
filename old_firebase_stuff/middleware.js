import { NextResponse } from 'next/server';

export function middleware(request) {
  // Get the pathname of the request
  const path = request.nextUrl.pathname;
  
  // ONLY check authentication for admin routes (excluding login)
  if (path.startsWith('/admin') && !path.includes('/admin/login')) {
    // Access cookies directly from the request object
    const sessionCookie = request.cookies.get('session');
    
    // If no session, redirect to login
    if (!sessionCookie) {
      const url = new URL('/admin/login', request.url);
      url.searchParams.set('from', path); // Save the original URL
      return NextResponse.redirect(url);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'], // ONLY match admin routes
};