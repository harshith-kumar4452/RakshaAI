import { createBrowserClient } from "@supabase/ssr";

function getEnvVar(primaryName, fallbackName) {
  return process.env[primaryName] ?? process.env[fallbackName];
}

export function createSupabaseBrowserClient() {
  const supabaseUrl = getEnvVar("NEXT_PUBLIC_SUPABASE_URL", "API_URL");
  const supabaseAnonKey = getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon_public");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase URL/anon key. Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (or API_URL + anon_public)."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
