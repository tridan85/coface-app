import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

/**
 * Protegge tutto tranne asset statici, /api e /login.
 * Usa le auth-helpers per leggere/refreshare la sessione dai cookie,
 * così gli accessi funzionano anche lato server.
 */
export const config = {
  matcher: ["/((?!_next|api|favicon.ico|images|fonts).*)"],
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const url = req.nextUrl.clone();

  // Non loggato -> manda a /login
  if (!session && url.pathname !== "/login") {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Già loggato ma su /login -> manda a home
  if (session && url.pathname === "/login") {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return res; // importante ritornare 'res' per mantenere i cookie aggiornati
}
