"use server";
import { redirect } from "next/navigation";
import { getSession, supabaseServer } from "@/lib/supabase/server";
import { HEALTH_AREAS, HEALTH_QUESTIONS } from "@/lib/templates/health-check-v1";
import { scoreHealthCheck } from "@/lib/engine/health-check";

/** Find the published Health Check template id (customers only see published templates). */
async function templateId() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("templates").select("id").eq("tool_key", "health_check").eq("publication_status", "published").order("version", { ascending: false }).limit(1).maybeSingle();
  return data?.id as string | undefined;
}

/** Start a new assessment or continue the in-progress one. */
export async function startOrContinue() {
  const s = await getSession();
  if (!s?.companyId) redirect("/setup");
  const supabase = await supabaseServer();
  const { data: open } = await supabase.from("assessments").select("id").eq("company_id", s.companyId).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (open) redirect(`/health-check?a=${open.id}&area=${HEALTH_AREAS[0].key}`);
  const tid = await templateId();
  if (!tid) redirect(`/health-check?error=${encodeURIComponent("The Health Check template has not been published yet. Run the seed script.")}`);
  const { data, error } = await supabase.from("assessments").insert({ company_id: s.companyId, template_id: tid }).select("id").single();
  if (error) redirect(`/health-check?error=${encodeURIComponent(error.message)}`);
  redirect(`/health-check?a=${data.id}&area=${HEALTH_AREAS[0].key}`);
}

/** Save one area's answers; move to the next area or finish. */
export async function saveArea(form: FormData) {
  const s = await getSession();
  if (!s?.companyId) redirect("/setup");
  const assessmentId = String(form.get("assessment_id"));
  const areaKey = String(form.get("area"));
  const supabase = await supabaseServer();

  const rows = HEALTH_QUESTIONS.filter((q) => q.area === areaKey).map((q) => {
    const raw = String(form.get(q.key) ?? "");
    const dont = raw === "dk";
    const v = dont ? null : Number(raw);
    return { assessment_id: assessmentId, company_id: s.companyId!, question_key: q.key, value: dont || !v ? null : v, dont_know: dont };
  }).filter((r) => r.dont_know || r.value);
  if (rows.length) {
    const { error } = await supabase.from("assessment_answers").upsert(rows, { onConflict: "assessment_id,question_key" });
    if (error) redirect(`/health-check?a=${assessmentId}&area=${areaKey}&error=${encodeURIComponent(error.message)}`);
  }

  const idx = HEALTH_AREAS.findIndex((a) => a.key === areaKey);
  const action = String(form.get("nav") ?? "next");
  if (action === "prev" && idx > 0) redirect(`/health-check?a=${assessmentId}&area=${HEALTH_AREAS[idx - 1].key}`);
  if (idx < HEALTH_AREAS.length - 1) redirect(`/health-check?a=${assessmentId}&area=${HEALTH_AREAS[idx + 1].key}`);

  // Last area: score and complete.
  const { data: answers } = await supabase.from("assessment_answers").select("question_key, value, dont_know").eq("assessment_id", assessmentId);
  const result = scoreHealthCheck(answers ?? []);
  if (!result.complete) {
    const missing = result.areas.filter((a) => a.answered < a.of)[0];
    redirect(`/health-check?a=${assessmentId}&area=${missing.area_key}&error=${encodeURIComponent("Please answer every statement in this area before finishing.")}`);
  }
  await supabase.from("assessment_area_scores").upsert(result.areas.map((a) => ({ assessment_id: assessmentId, company_id: s.companyId!, area_key: a.area_key, score_pct: a.score_pct, band: a.band })), { onConflict: "assessment_id,area_key" });
  await supabase.from("assessments").update({ status: "completed", completed_at: new Date().toISOString(), overall_score: result.overall_pct }).eq("id", assessmentId);
  redirect(`/health-check/results?a=${assessmentId}`);
}
