import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getEnvVar(primaryName, fallbackName) {
  return process.env[primaryName] ?? process.env[fallbackName];
}

function requiredEnvVar(primaryName, fallbackName) {
  const value = getEnvVar(primaryName, fallbackName);

  if (!value) {
    throw new Error(
      `Missing Supabase environment variable: ${primaryName} (or ${fallbackName})`
    );
  }

  return value;
}

export async function createSupabaseServerClient() {
  const supabaseUrl = requiredEnvVar("API_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requiredEnvVar(
    "anon_public",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export function createSupabaseServiceRoleClient() {
  const supabaseUrl = requiredEnvVar("API_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey =
    process.env.service_role ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variable: service_role (or SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_SERVICE_KEY)"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
