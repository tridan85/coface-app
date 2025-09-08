// middleware.ts (in root)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export const config = {
  // includi tutto tranne asset/static/api
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|images/|fonts/|api/).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const url = req.nextUrl.clone();
  const isLogin = url.pathname === "/login";

  // Non loggato → manda a /login
  if (!session && !isLogin) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Già loggato ma su /login → manda a home
  if (session && isLogin) {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Importante: ritorna res per mantenere i cookie aggiornati
  return res;
}
