// Supabase Edge Function placeholder: triage
// Runs NLP triage on incoming complaint and updates cases table.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (_req) => {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "triage function scaffolded",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
