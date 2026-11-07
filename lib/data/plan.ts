import { supabaseServer } from "@/lib/supabase/server";

export type Member = { user_id: string; role: string; email: string; full_name: string | null };
export type Target = { id: string; priority_id: string; measure: string; kpi_id: string | null; target_value: number; unit: string; direction: string; owner_user_id: string; due_quarter: string; status: string; result: number | null };
export type Priority = { id: string; plan_year: number; title: string; objective: string; rank: number; source_area_key: string | null; assessment_id: string | null; status: string; targets: Target[] };

export async function loadMembers(companyId: string): Promise<Member[]> {
  const supabase = await supabaseServer();
  const { data: ms } = await supabase.from("memberships").select("user_id, role").eq("company_id", companyId).not("accepted_at", "is", null);
  const ids = (ms ?? []).map((m) => m.user_id);
  if (!ids.length) return [];
  const { data: us } = await supabase.from("users").select("id, email, full_name").in("id", ids);
  return (ms ?? []).map((m) => {
    const u = us?.find((x) => x.id === m.user_id);
    return { user_id: m.user_id, role: m.role, email: u?.email ?? "", full_name: u?.full_name ?? null };
  });
}

export async function loadPlan(companyId: string, planYear: number): Promise<Priority[]> {
  const supabase = await supabaseServer();
  const { data: ps } = await supabase.from("priorities").select("*").eq("company_id", companyId).eq("plan_year", planYear).eq("status", "active").order("rank");
  if (!ps?.length) return [];
  const { data: ts } = await supabase.from("targets").select("*").in("priority_id", ps.map((p) => p.id));
  return ps.map((p) => ({ ...p, targets: (ts ?? []).filter((t) => t.priority_id === p.id) })) as Priority[];
}

export function memberName(m: Member | undefined): string {
  if (!m) return "—";
  return m.full_name || m.email.split("@")[0];
}

/** Plan year defaults to the current calendar year; the owner can switch to next year from October. */
export function defaultPlanYear(now = new Date()): number {
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}
