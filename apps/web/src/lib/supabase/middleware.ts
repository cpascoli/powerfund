import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@powerfund/db";

import { isAgentApiPath, isPublicCatalogPath } from "@/lib/api/paths";

import { getSupabaseEnv } from "./env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Public catalog is anonymous. Agent routes authenticate with Bearer tokens
  // inside the route handlers — do not bounce them to /login.
  if (isPublicCatalogPath(pathname) || isAgentApiPath(pathname)) {
    return NextResponse.next({ request });
  }

  const env = getSupabaseEnv();
  // Fail closed: without Supabase config there is no way to authenticate, so a
  // misconfigured deploy must not serve the app unauthenticated.
  if (!env) {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.next({ request });
    }
    return new NextResponse("Supabase is not configured.", { status: 503 });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = pathname === "/login";

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/docs/goals";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
