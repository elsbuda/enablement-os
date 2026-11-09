"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, supabaseServer } from "@/lib/supabase/server";

const Schema = z.object({
  name: z.string().trim().min(2).max(120),
  sector: z.string().trim().max(80),
  staff_band: z.string().trim().max(40),
  turnover_band: z.string().trim().max(40),
  financial_year_end: z.coerce.number().int().min(1).max(12),
  sales_team_size: z.coerce.number().int().min(0).max(500),
  products: z.string().max(2000),
  customer_types: z.string().max(2000),
});

const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 10);

export async function saveCompanyContext(form: FormData) {
  const parsed = Schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/setup?error=${encodeURIComponent("Please check the form: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "))}`);
  const d = parsed.data;
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const supabase = await supabaseServer();

  let companyId = session.companyId;
  if (!companyId) {
    // Make sure the profile row exists (sign-up with email confirmation skips it).
    await supabase.from("users").upsert({ id: session.userId, email: session.email });
    const { data, error } = await supabase.rpc("create_company_with_owner", { p_name: d.name, p_package: "build", p_seats: 3 });
    if (error || !data) redirect(`/setup?error=${encodeURIComponent(error?.message ?? "Could not create the company")}`);
    companyId = data as string;
  }

  const { error: e1 } = await supabase.from("companies").update({
    name: d.name, sector: d.sector, staff_band: d.staff_band, turnover_band: d.turnover_band, financial_year_end: d.financial_year_end,
  }).eq("id", companyId);
  if (e1) redirect(`/setup?error=${encodeURIComponent(e1.message)}`);

  const { data: last } = await supabase.from("company_profile").select("version").eq("company_id", companyId).order("version", { ascending: false }).limit(1).maybeSingle();
  const { error: e2 } = await supabase.from("company_profile").insert({
    company_id: companyId, version: (last?.version ?? 0) + 1,
    products: lines(d.products), customer_types: lines(d.customer_types), sales_team_size: d.sales_team_size, updated_by: session.userId,
  });
  if (e2) redirect(`/setup?error=${encodeURIComponent(e2.message)}`);
  redirect("/setup?saved=1");
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
const LOGO_MAX = 1024 * 1024;

export async function uploadLogo(form: FormData) {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");
  if (session.role !== "owner" && session.role !== "admin") redirect(`/setup?error=${encodeURIComponent("Only owners and admins can change the logo.")}`);
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) redirect(`/setup?error=${encodeURIComponent("Choose a logo file first.")}`);
  const ext = LOGO_TYPES[file.type];
  if (!ext) redirect(`/setup?error=${encodeURIComponent("Use a PNG, JPG, WebP or SVG file.")}`);
  if (file.size > LOGO_MAX) redirect(`/setup?error=${encodeURIComponent("The logo must be 1 MB or smaller.")}`);
  const supabase = await supabaseServer();
  // A fresh file name per upload so browsers never show a stale logo; the old file is removed.
  const path = `${session.companyId}/logo-${Date.now()}.${ext}`;
  const { data: existing } = await supabase.storage.from("logos").list(session.companyId);
  if (existing?.length) await supabase.storage.from("logos").remove(existing.map((o) => `${session.companyId}/${o.name}`));
  const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) redirect(`/setup?error=${encodeURIComponent("Upload failed: " + error.message)}`);
  const { error: e2 } = await supabase.from("companies").update({ logo_path: path }).eq("id", session.companyId);
  if (e2) redirect(`/setup?error=${encodeURIComponent(e2.message)}`);
  redirect("/setup?saved=logo");
}

export async function removeLogo() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");
  if (session.role !== "owner" && session.role !== "admin") redirect(`/setup?error=${encodeURIComponent("Only owners and admins can change the logo.")}`);
  const supabase = await supabaseServer();
  const { data: existing } = await supabase.storage.from("logos").list(session.companyId);
  if (existing?.length) await supabase.storage.from("logos").remove(existing.map((o) => `${session.companyId}/${o.name}`));
  await supabase.from("companies").update({ logo_path: null }).eq("id", session.companyId);
  redirect("/setup?saved=logo-removed");
}
