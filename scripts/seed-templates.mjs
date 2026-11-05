// Seeds the template catalogue through the service role (staff action, bypasses RLS).
// Health Check v1 is ORIGINAL and publishes. Priorities and Targets v1 is toolkit-derived
// and stays in 'review' with permission_status 'requires_confirmation' until the licence
// text is filed — the database guard refuses to publish it before then.
// Run: node scripts/seed-templates.mjs   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const hc = JSON.parse(readFileSync(new URL("../lib/templates/health-check-v1.json", import.meta.url), "utf8"));
const pt = JSON.parse(readFileSync(new URL("../lib/templates/priorities-and-targets-v1.json", import.meta.url), "utf8"));

for (const t of [hc, pt]) {
  const { error } = await sb.from("templates").upsert({
    tool_key: t.tool_key, version: t.version, kind: t.kind, category: t.category, title: t.title,
    body: t.body, source_references: t.source_references, permission_status: t.permission_status,
    licence_reference: t.licence_reference ?? null, publication_status: t.publication_status,
    downloadable_source: false, published_at: t.publication_status === "published" ? new Date().toISOString() : null,
  }, { onConflict: "tool_key,version" });
  console.log(t.tool_key, "v" + t.version, error ? "FAILED: " + error.message : `${t.publication_status} (${t.permission_status})`);
}
