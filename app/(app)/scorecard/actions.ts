"use server";
import { redirect } from "next/navigation";
import { getSession, supabaseServer } from "@/lib/supabase/server";

function back(msg?: string, key: "error" | "saved" = "error"): never {
  redirect(`/scorecard${msg ? `?${key}=${encodeURIComponent(msg)}` : ""}`);
}

/** Save one month's actuals for every KPI (blank = leave unchanged / not entered). */
export async function saveActuals(form: FormData) {
  const s = await getSession();
  if (!s?.companyId) redirect("/setup");
  if (s.role === "viewer") back("Viewers can read the scorecard but not enter actuals.");
  const supabase = await supabaseServer();
  const month = String(form.get("month") ?? "");
  if (!/^\d{4}-\d{2}-01$/.test(month)) back("Pick a month.");
  const ids = form.getAll("kpi_id").map(String);
  const rows = [];
  for (const id of ids) {
    const raw = String(form.get(`actual_${id}`) ?? "").trim();
    if (raw === "") continue;
    const v = Number(raw.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(v)) back("Actuals must be numbers.");
    rows.push({ kpi_id: id, company_id: s.companyId, period_month: month, actual_value: v, entered_by: s.userId, entered_at: new Date().toISOString() });
  }
  if (!rows.length) back("Enter at least one actual.");
  const { error } = await supabase.from("kpi_actuals").upsert(rows, { onConflict: "kpi_id,period_month" });
  if (error) back(error.message);
  back(`${rows.length} actual(s) saved for ${month.slice(0, 7)}.`, "saved");
}

export async function updateKpiTarget(form: FormData) {
  const s = await getSession();
  if (!s?.companyId) redirect("/setup");
  if (s.role === "viewer") back("Viewers cannot change targets.");
  const supabase = await supabaseServer();
  const id = String(form.get("kpi_id")); const t = Number(form.get("target_value"));
  if (!Number.isFinite(t)) back("Monthly target must be a number.");
  const { error } = await supabase.from("kpis").update({ target_value: t }).eq("id", id).eq("company_id", s.companyId);
  if (error) back(error.message);
  back("Monthly target updated.", "saved");
}
