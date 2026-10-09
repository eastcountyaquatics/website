// Public, no login required: hands coach-registration.html a one-time
// signed upload URL for a W-9 or a lifeguard certificate (body.kind:
// "w9" | "lifeguard") in the private coach-documents bucket, or for the
// coach's headshot (body.kind: "photo") in the public site-images bucket.
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

    // Headshot: always the square JPEG the form's cropper produces. Public
    // bucket (it's shown on the Coaches page), so return its public URL.
    if (body.kind === "photo") {
      if (ext !== "jpg") return json({ error: "Please crop your photo on the form before submitting." }, 400);
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const photoPath = `coaches/registrations/${crypto.randomUUID()}.jpg`;
      const { data: slot, error: slotError } = await admin.storage.from("site-images").createSignedUploadUrl(photoPath);
      if (slotError || !slot) throw slotError || new Error("no signed upload url");
      const { data: pub } = admin.storage.from("site-images").getPublicUrl(photoPath);
      return json({ path: photoPath, token: slot.token, public_url: pub.publicUrl });
    }

    const kind = body.kind === "lifeguard" ? "lifeguard" : "w9";
    const docLabel = kind === "lifeguard" ? "lifeguard certificate" : "W-9";
    if (!EXTENSIONS.has(ext)) {
      return json({ error: `Please upload your ${docLabel} as a PDF or a photo (JPG, PNG, HEIC).` }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const path = `${kind}/${crypto.randomUUID()}/${kind}.${ext}`;
    const { data, error } = await supabase.storage.from("coach-documents").createSignedUploadUrl(path);
    if (error || !data) throw error || new Error("no signed upload url");

    return json({ path, token: data.token });
  } catch (err) {
    console.error(err);
    return json({ error: "Could not prepare the upload. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
