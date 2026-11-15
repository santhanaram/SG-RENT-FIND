import { NextResponse, type NextRequest } from "next/server";
import { missingEnv } from "@/lib/supabase/config";

// No login: the only gate is a setup page while Supabase isn't configured.
export function middleware(request: NextRequest) {
  const needsSetup = missingEnv().length > 0;
  const onSetup = request.nextUrl.pathname === "/setup";

  if (needsSetup && !onSetup) {
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
