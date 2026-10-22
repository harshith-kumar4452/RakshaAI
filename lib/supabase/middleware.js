import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

function getEnvVar(primaryName, fallbackName) {
  return process.env[primaryName] ?? process.env[fallbackName];
}

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabaseUrl = getEnvVar("NEXT_PUBLIC_SUPABASE_URL", "API_URL");
  const supabaseAnonKey = getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon_public");

  // Fail safely in middleware if env is missing, instead of crashing the app at runtime.
  if (!supabaseUrl || !supabaseAnonKey) {
    return { response, user: null, supabase: null };
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}
