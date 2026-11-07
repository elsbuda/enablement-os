"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, supabaseServer } from "@/lib/supabase/server";
import { KPI_LIBRARY } from "@/lib/templates/kpi-library";

function back(year: number, msg?: string, key: "error" | "saved" = "error"): never {
  redirect(`/plan?year=${year}${msg ? `&${key}=${encodeURIComponent(msg)}` : ""}`);
}

async function ctx() {
  const s = await getSession();
  if (!s?.companyId) redirect("/setup");
  if (s.role === "viewer") redirect("/plan?error=" + encodeURIComponent("Viewers can read the plan but not change it."));
  return { s, supabase: await supabaseServer(), companyId: s.companyId };
}

const PrioritySchema = z.object({
  plan_year: z.coerce.number().int().min(2026).max(2035),
  title: z.string().trim().min(5).max(80),
  objective: z.string().trim().min(10).max(200),
  source_area_key: z.string().trim().max(40).optional().or(z.literal("")),
  assessment_id: z.string().uuid().optional().or(z.literal("")),
});

/** Accept several suggested priorities at once (from the Health Check results). */
export async function acceptSuggestions(form: FormData) {
  const { supabase, companyId } = await ctx();
  const year = Number(form.get("plan_year"));
  const assessmentId = String(form.get("assessment_id") ?? "");
  const { count } = await supabase.from("priorities").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("plan_year", year).eq("status", "active");
  let rank = (count ?? 0) + 1;
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 5; i++) {
    if (form.get(`keep_${i}`) !== "on") continue;
    const parsed = PrioritySchema.safeParse({ plan_year: year, title: form.get(`title_${i}`), objective: form.get(`objective_${i}`), source_area_key: form.get(`area_${i}`), assessment_id: assessmentId });
    if (!parsed.success) back(year, `Priority ${i + 1}: title needs 5 to 80 characters and the objective 10 to 200.`);
    const d = parsed.data;
    rows.push({ company_id: companyId, plan_year: year, title: d.title, objective: d.objective, rank: rank++, source_area_key: d.source_area_key || null, assessment_id: d.assessment_id || null });
  }
  if (!rows.length) back(year, "Tick at least one priority to keep.");
  if (rank - 1 > 5) back(year, "A plan holds at most five priorities.");
  const { error } = await supabase.from("priorities").insert(rows);
  if (error) back(year, error.message);
  back(year, `${rows.length} priorit${rows.length === 1 ? "y" : "ies"} added. Now set a target for each.`, "saved");
}

export async function addPriority(form: FormData) {
  const { supabase, companyId } = await ctx();
  const parsed = PrioritySchema.safeParse(Object.fromEntries(form));
  const year = Number(form.get("plan_year")) || new Date().getFullYear();
  if (!parsed.success) back(year, "Title needs 5 to 80 characters and the objective 10 to 200.");
  const d = parsed.data;
  const { count } = await supabase.from("priorities").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("plan_year", d.plan_year).eq("status", "active");
  if ((count ?? 0) >= 5) back(year, "A plan holds at most five priorities. Retire one first.");
  const { error } = await supabase.from("priorities").insert({ company_id: companyId, plan_year: d.plan_year, title: d.title, objective: d.objective, rank: (count ?? 0) + 1, source_area_key: d.source_area_key || null });
  if (error) back(year, error.message);
  back(year, "Priority added.", "saved");
}

export async function updatePriority(form: FormData) {
  const { supabase, companyId } = await ctx();
  const id = String(form.get("id")); const year = Number(form.get("plan_year"));
  const parsed = PrioritySchema.pick({ title: true, objective: true }).safeParse(Object.fromEntries(form));
  if (!parsed.success) back(year, "Title needs 5 to 80 characters and the objective 10 to 200.");
  const { error } = await supabase.from("priorities").update(parsed.data).eq("id", id).eq("company_id", companyId);
  if (error) back(year, error.message);
  back(year, "Priority updated.", "saved");
}

export async function retirePriority(form: FormData) {
  const { s, supabase, companyId } = await ctx();
  const year = Number(form.get("plan_year"));
  if (s.role !== "owner" && s.role !== "admin") back(year, "Only the owner or an admin can retire a priority.");
  const { error } = await supabase.from("priorities").update({ status: "retired" }).eq("id", String(form.get("id"))).eq("company_id", companyId);
  if (error) back(year, error.message);
  back(year, "Priority retired. Its targets and actions are kept in history.", "saved");
}

const TargetSchema = z.object({
  priority_id: z.string().uuid(),
  plan_year: z.coerce.number().int(),
  kpi_key: z.string().trim().max(60).optional().or(z.literal("")),
  measure: z.string().trim().max(80).optional().or(z.literal("")),
  target_value: z.coerce.number().refine((n) => n !== 0, "Target cannot be zero"),
  unit: z.enum(["R", "%", "count", "days"]),
  direction: z.enum(["higher_better", "lower_better"]),
  owner_user_id: z.string().uuid(),
  due_quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
});

/** Add a target; if it uses a library KPI, create (or reuse) the company's KPI row so the scorecard can track it. */
export async function addTarget(form: FormData) {
  const { supabase, companyId } = await ctx();
  const parsed = TargetSchema.safeParse(Object.fromEntries(form));
  const year = Number(form.get("plan_year"));
  if (!parsed.success) back(year, "Target: " + parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
  const d = parsed.data;
  const { count } = await supabase.from("targets").select("id", { count: "exact", head: true }).eq("priority_id", d.priority_id);
  if ((count ?? 0) >= 3) back(year, "A priority holds at most three targets.");

  let kpiId: string | null = null; let measure = d.measure || ""; let unit = d.unit; let direction = d.direction;
  const lib = d.kpi_key ? KPI_LIBRARY.find((k) => k.key === d.kpi_key) : undefined;
  if (lib) {
    measure = lib.name; unit = lib.unit; direction = lib.direction;
    const { data: existing } = await supabase.from("kpis").select("id").eq("company_id", companyId).eq("name", lib.name).maybeSingle();
    if (existing) kpiId = existing.id;
    else {
      const { data: k, error } = await supabase.from("kpis").insert({ company_id: companyId, name: lib.name, unit: lib.unit, direction: lib.direction, target_value: d.target_value, perspective: lib.perspective, owner_user_id: d.owner_user_id }).select("id").single();
      if (error) back(year, error.message);
      kpiId = k.id;
    }
  }
  if (!measure || measure.length < 2) back(year, "Pick a measure from the list or type your own (2 to 80 characters).");
  const { error } = await supabase.from("targets").insert({ company_id: companyId, priority_id: d.priority_id, measure, kpi_id: kpiId, target_value: d.target_value, unit, direction, owner_user_id: d.owner_user_id, due_quarter: d.due_quarter });
  if (error) back(year, error.message);
  back(year, "Target added." + (kpiId ? " It now appears on the scorecard." : ""), "saved");
}

export async function deleteTarget(form: FormData) {
  const { s, supabase, companyId } = await ctx();
  const year = Number(form.get("plan_year"));
  if (s.role !== "owner" && s.role !== "admin") back(year, "Only the owner or an admin can remove a target.");
  const { error } = await supabase.from("targets").delete().eq("id", String(form.get("id"))).eq("company_id", companyId);
  if (error) back(year, error.message);
  back(year, "Target removed.", "saved");
}

/** Review mode: save result (0 to 1) and status for every target in the plan year. */
export async function saveReview(form: FormData) {
  const { supabase, companyId } = await ctx();
  const year = Number(form.get("plan_year"));
  const ids = form.getAll("target_id").map(String);
  for (const id of ids) {
    const raw = String(form.get(`result_${id}`) ?? "");
    const result = raw === "" ? null : Math.round(Number(raw) * 10) / 10;
    const status = String(form.get(`status_${id}`) ?? "working_on_it");
    if (result != null && (result < 0 || result > 1)) back(year, "Results must be between 0 and 1.");
    const { error } = await supabase.from("targets").update({ result, status }).eq("id", id).eq("company_id", companyId);
    if (error) back(year, error.message);
  }
  redirect(`/plan/review?year=${year}&saved=1`);
}
