import { getSession, supabaseServer } from "@/lib/supabase/server";
import { defaultPlanYear, loadPlan } from "@/lib/data/plan";
import { deriveStatus, summarise, weekOf, type ActionRow } from "@/lib/engine/execution";
import { lastMonths, rag } from "@/lib/engine/scorecard";
import { PageHead, Help, Empty } from "@/components/page";


export default async function Home() {
  const s = (await getSession())!;
  if (!s.companyId) return <><PageHead title="Welcome" /><Empty title="First, tell us about your company" action={<a className="btn" href="/setup">Set up company context</a>}>Takes two minutes. Every workspace reads from it.</Empty></>;
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
  // One obvious next step, worked out from where the company is in the Check → Plan → Execute → Measure rhythm.
  const next = !last ? { step: "Step 1 of 4", title: "Run your Business Health Check", why: "48 quick statements. It shows where the business is weakest and suggests your priorities.", href: "/health-check", cta: "Start the Health Check" }
    : priorities.length === 0 ? { step: "Step 2 of 4", title: "Build your Strategy and Growth Plan", why: "Your Health Check has suggested three priorities. Accept them or choose your own.", href: "/plan", cta: "Build the plan" }
    : !period ? { step: "Step 3 of 4", title: "Start your first 90 days", why: "Turn each priority into actions with an owner and a date.", href: "/execution", cta: "Start the 90-day period" }
    : attention.length > 0 ? { step: "This week", title: `${attention.length} action${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} a decision`, why: "Late or at risk. Update them in the weekly check-in.", href: "/execution/checkin", cta: "Open the weekly check-in" }
    : (kpis?.length ?? 0) > 0 && (actuals?.length ?? 0) === 0 ? { step: "Step 4 of 4", title: "Enter this month's numbers", why: "The CEO Scorecard needs an actual for each measure to show red, amber or green.", href: "/scorecard", cta: "Open the scorecard" }
    : { step: "On track", title: "Nothing is late or at risk", why: "Run the weekly check-in on Monday and the quarterly review at the end of the period.", href: "/execution", cta: "See the 90-day board" };

  return (
    <>
      <PageHead title="Home" context={<>{company?.name}{period ? ` · ${period.label}, week ${weekOf(period.start_date, today)} of 13` : ""}</>} />
      <section className="next" aria-label="Your next step">
        <div><div className="kv">{next.step}</div><h2>{next.title}</h2><p>{next.why}</p></div>
        <a className="btn" href={next.href}>{next.cta}</a>
      </section>
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
