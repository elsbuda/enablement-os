import { getSession, supabaseServer } from "@/lib/supabase/server";
import { defaultPlanYear, loadPlan } from "@/lib/data/plan";
import { deriveStatus, summarise, weekOf, type ActionRow } from "@/lib/engine/execution";
import { lastMonths, rag } from "@/lib/engine/scorecard";

export default async function Home() {
  const s = (await getSession())!;
  if (!s.companyId) return <><h1>Welcome</h1><p className="sub">Set up your company to begin: <a href="/setup">Company context</a>.</p></>;
  const supabase = await supabaseServer();
  const today = new Date();
  const [{ data: company }, { data: last }, priorities, { data: period }, { data: kpis }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", s.companyId).maybeSingle(),
    supabase.from("assessments").select("id, completed_at, overall_score").eq("company_id", s.companyId).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    loadPlan(s.companyId, defaultPlanYear()),
    supabase.from("periods").select("id, label, start_date, end_date").eq("company_id", s.companyId).eq("status", "active").maybeSingle(),
    supabase.from("kpis").select("id, target_value, direction").eq("company_id", s.companyId),
  ]);
  const { data: areas } = last ? await supabase.from("assessment_area_scores").select("area_key, score_pct").eq("assessment_id", last.id).order("score_pct") : { data: null };
  const acts = period ? (((await supabase.from("actions").select("*").eq("period_id", period.id)).data ?? []) as ActionRow[]).map((a) => deriveStatus(a, today)) : [];
  const sum = summarise(acts);
  const month = lastMonths(1, today)[0];
  const { data: actuals } = kpis?.length ? await supabase.from("kpi_actuals").select("kpi_id, actual_value").in("kpi_id", kpis.map((k) => k.id)).eq("period_month", month) : { data: [] };
  const onTarget = (kpis ?? []).filter((k) => { const a = actuals?.find((x) => x.kpi_id === k.id); return rag(a ? Number(a.actual_value) : null, k.target_value == null ? null : Number(k.target_value), k.direction) === "green"; }).length;
  const attention = acts.filter((a) => a.derived === "late" || a.derived === "at_risk").slice(0, 5);
  const targets = priorities.reduce((n, p) => n + p.targets.length, 0);

  return (
    <>
      <h1>{company?.name}</h1>
      <p className="sub">{period ? `${period.label}, week ${weekOf(period.start_date, today)} of 13.` : "No active 90-day period yet."}{last ? ` Last Health Check ${new Date(last.completed_at!).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}.` : ""}</p>
      <div className="stats">
        <div className="stat"><div className="kv">Health Check</div>{last ? <><div className="big">{last.overall_score}%</div><div className="kv">lowest: {areas?.[0]?.area_key} {areas?.[0]?.score_pct}%</div><div className="actions"><a className="btn ghost" href={`/health-check/results?a=${last.id}`}>Results</a></div></> : <><div className="big">—</div><div className="actions"><a className="btn" href="/health-check">Start</a></div></>}</div>
        <div className="stat"><div className="kv">Priorities {defaultPlanYear()}</div><div className="big">{priorities.length}<span className="kv"> / 5</span></div><div className="kv">{targets} target{targets === 1 ? "" : "s"}</div><div className="actions"><a className="btn ghost" href="/plan">{priorities.length ? "Open plan" : "Build plan"}</a></div></div>
        <div className="stat"><div className="kv">Actions this period</div><div className="big">{sum.done}<span className="kv"> / {sum.total}</span></div><div className="kv">{sum.late} late, {sum.at_risk} at risk</div><div className="actions"><a className="btn ghost" href="/execution">{period ? "Board" : "Start period"}</a></div></div>
        <div className="stat"><div className="kv">Measures on target</div><div className="big">{onTarget}<span className="kv"> / {kpis?.length ?? 0}</span></div><div className="kv">this month</div><div className="actions"><a className="btn ghost" href="/scorecard">Scorecard</a></div></div>
      </div>
      {attention.length > 0 && (
        <>
          <div className="card" style={{ marginTop: 20 }}>
          <h2>Needs your attention</h2>
          <div className="tw"><table><thead><tr><th>Action</th><th>Due</th><th>Status</th></tr></thead><tbody>
            {attention.map((a) => <tr key={a.id}><td>{a.title}</td><td>{a.due_date}</td><td><span className={`pill ${a.derived === "late" ? "b" : "w"}`}>{a.derived === "late" ? "Late" : "At risk"}</span></td></tr>)}
          </tbody></table></div>
          <div className="actions"><a className="btn" href="/execution/checkin">Open weekly check-in</a></div>
          </div>
        </>
      )}
    </>
  );
}
