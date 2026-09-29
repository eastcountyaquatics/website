// Public, no login required: hands coach-registration.html a one-time
// signed upload URL for a W-9 in the private coach-documents bucket.
//
// Why not a plain anonymous upload: Storage reads the new object back after
// inserting it, which needs a SELECT policy -- and a SELECT policy anon can
// pass would let anyone read other coaches' W-9s (they carry SSNs). A
// signed upload URL lets the browser write exactly one new file at a path
// the server chose, with no read access at all. The bucket's own 10MB /
// PDF-or-image limits still apply.
//
// Deploy: supabase functions deploy coach-w9-upload-url --no-verify-jwt
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "heic", "heif", "webp"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ext = String(body.ext || "").toLowerCase();
    if (!EXTENSIONS.has(ext)) {
      return json({ error: "Please upload your W-9 as a PDF or a photo (JPG, PNG, HEIC)." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const path = `w9/${crypto.randomUUID()}/w9.${ext}`;
    const { data, error } = await supabase.storage.from("coach-documents").createSignedUploadUrl(path);
    if (error || !data) throw error || new Error("no signed upload url");

    return json({ path, token: data.token });
  } catch (err) {
    console.error(err);
    return json({ error: "Could not prepare the W-9 upload. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
