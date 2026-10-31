import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "tdc_session";

/**
 * Optimistic gate for the dashboard: no session cookie, no admin page. The real session
 * and role checks happen on the server in every admin page and server action.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login") && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
