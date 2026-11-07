import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/auth", "/api/cron", "/manifest.webmanifest", "/icons"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated users to /login. (Role checks happen in layouts.)
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not run code between createServerClient and the claims check: it may
  // cause random logouts (see Supabase SSR docs).
  //
  // getClaims() verifies the JWT locally against the project's asymmetric
  // signing keys instead of calling the Auth server, and still refreshes the
  // session cookie when the token is close to expiring. That keeps this proxy
  // — which runs on *every* request — off the network in the common case.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const user = claimsError ? null : (claimsData?.claims ?? null);

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
