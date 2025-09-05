import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protegge tutto tranne statiche, /api e /login
export const config = {
  matcher: ["/((?!_next|api|favicon.ico|images|fonts).*)"],
};

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();

  const access = req.cookies.get("sb-access-token")?.value;
  const refresh = req.cookies.get("sb-refresh-token")?.value;
  const hasSession = Boolean(access && refresh);

  if (!hasSession && url.pathname !== "/login") {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSession && url.pathname === "/login") {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
