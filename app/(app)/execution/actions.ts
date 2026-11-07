"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, supabaseServer } from "@/lib/supabase/server";
import { defaultPeriod } from "@/lib/engine/execution";

function back(msg?: string, key: "error" | "saved" = "error", path = "/execution"): never {
  redirect(`${path}${msg ? `?${key}=${encodeURIComponent(msg)}` : ""}`);
}
async function ctx() {
  const s = await getSession();
  if (!s?.companyId) redirect("/setup");
  if (s.role === "viewer") back("Viewers can read the board but not change it.");
  return { s, supabase: await supabaseServer(), companyId: s.companyId };
}

export async function startPeriod(form: FormData) {
  const { supabase, companyId } = await ctx();
  const planYear = Number(form.get("plan_year")) || new Date().getFullYear();
  const { data: active } = await supabase.from("periods").select("id").eq("company_id", companyId).eq("status", "active").maybeSingle();
  if (active) back("There is already an active 90-day period.");
  const custom = String(form.get("start_date") ?? "");
  const today = custom ? new Date(custom + "T00:00:00Z") : new Date();
  const p = defaultPeriod(today, planYear);
  const label = String(form.get("label") ?? "").trim() || p.label;
  const { error } = await supabase.from("periods").insert({ company_id: companyId, label, start_date: p.start_date, end_date: p.end_date, status: "active" });
  if (error) back(error.message);
  back(`Period "${label}" started: ${p.start_date} to ${p.end_date}.`, "saved");
}

const InitiativeSchema = z.object({ priority_id: z.string().uuid(), title: z.string().trim().min(3).max(120), description: z.string().trim().max(500).optional().or(z.literal("")), owner_user_id: z.string().uuid().optional().or(z.literal("")) });

export async function addInitiative(form: FormData) {
  const { supabase, companyId } = await ctx();
  const parsed = InitiativeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) back("Initiative needs a title of 3 to 120 characters and a priority.");
  const d = parsed.data;
  const { error } = await supabase.from("initiatives").insert({ company_id: companyId, priority_id: d.priority_id, title: d.title, description: d.description || null, owner_user_id: d.owner_user_id || null });
  if (error) back(error.message);
  back("Initiative added. Now break it into actions with an owner and a date.", "saved");
}

const ActionSchema = z.object({ initiative_id: z.string().uuid(), period_id: z.string().uuid(), title: z.string().trim().min(3).max(160), owner_user_id: z.string().uuid(), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kpi_id: z.string().uuid().optional().or(z.literal("")) });

export async function addAction(form: FormData) {
  const { supabase, companyId } = await ctx();
  const parsed = ActionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) back("Action needs a title, an owner and a due date.");
  const d = parsed.data;
  const { data: period } = await supabase.from("periods").select("start_date, end_date").eq("id", d.period_id).maybeSingle();
  if (!period) back("No active period.");
  if (d.due_date < period.start_date || d.due_date > period.end_date) back(`Due date must fall inside the period (${period.start_date} to ${period.end_date}).`);
  const { error } = await supabase.from("actions").insert({ company_id: companyId, initiative_id: d.initiative_id, period_id: d.period_id, title: d.title, owner_user_id: d.owner_user_id, due_date: d.due_date, kpi_id: d.kpi_id || null });
  if (error) back(error.message);
  back("Action added.", "saved");
}

export async function setActionStatus(form: FormData) {
  const { supabase, companyId } = await ctx();
  const id = String(form.get("id")); const status = String(form.get("status"));
  const from = String(form.get("from") ?? "/execution");
  if (!["not_started", "on_track", "at_risk", "done"].includes(status)) back("Unknown status", "error", from);
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString(), completed_at: status === "done" ? new Date().toISOString() : null };
  const { error } = await supabase.from("actions").update(patch).eq("id", id).eq("company_id", companyId);
  if (error) back(error.message, "error", from);
  redirect(from);
}

export async function moveActionDate(form: FormData) {
  const { supabase, companyId } = await ctx();
  const id = String(form.get("id")); const due = String(form.get("due_date") ?? "");
  const from = String(form.get("from") ?? "/execution");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) back("Pick a date.", "error", from);
  const { error } = await supabase.from("actions").update({ due_date: due, updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId);
  if (error) back(error.message, "error", from);
  redirect(from);
}

export async function closePeriod(form: FormData) {
  const { s, supabase, companyId } = await ctx();
  if (s.role !== "owner" && s.role !== "admin") back("Only the owner or an admin can close a period.");
  const periodId = String(form.get("period_id"));
  const planYear = Number(form.get("plan_year")) || new Date().getFullYear();
  const achieved = String(form.get("achieved_text") ?? "").slice(0, 2000);
  const slipped = String(form.get("slipped_text") ?? "").slice(0, 2000);
  const { data: period } = await supabase.from("periods").select("id, end_date, status").eq("id", periodId).eq("company_id", companyId).maybeSingle();
  if (!period || period.status !== "active") back("That period is not active.");
  // Next period starts the day after this one ends (or today if later).
  const after = new Date(new Date(period.end_date + "T00:00:00Z").getTime() + 864e5);
  const start = after > new Date() ? after : new Date();
  const np = defaultPeriod(start, planYear);
  const { data: next, error: e1 } = await supabase.from("periods").insert({ company_id: companyId, label: np.label, start_date: np.start_date, end_date: np.end_date, status: "planning" }).select("id").single();
  if (e1) back(e1.message);
  // Roll unfinished actions forward.
  const { data: open } = await supabase.from("actions").select("id, due_date").eq("period_id", periodId).neq("status", "done");
  for (const a of open ?? []) {
    const due = a.due_date < np.start_date ? np.start_date : a.due_date;
    await supabase.from("actions").update({ period_id: next.id, due_date: due, status: "not_started" }).eq("id", a.id);
  }
  const { error: e2 } = await supabase.from("reviews").insert({ company_id: companyId, period_id: periodId, held_on: new Date().toISOString().slice(0, 10), achieved_text: achieved, slipped_text: slipped, next_period_id: next.id, created_by: s.userId });
  if (e2) back(e2.message);
  await supabase.from("periods").update({ status: "closed" }).eq("id", periodId);
  await supabase.from("periods").update({ status: "active" }).eq("id", next.id);
  back(`Period closed. ${open?.length ?? 0} unfinished action(s) rolled into ${np.label}. Now score the targets in review mode.`, "saved", `/plan/review?year=${planYear}`);
}
