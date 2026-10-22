// Supabase Edge Function placeholder: token-auth
// Validates token_public + token_secret against token_secret_hash.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (_req) => {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "token-auth function scaffolded",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
