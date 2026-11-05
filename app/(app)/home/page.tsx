import { getSession, supabaseServer } from "@/lib/supabase/server";

export default async function Home() {
  const s = (await getSession())!;
  if (!s.companyId) return <><h1>Welcome</h1><p className="sub">Set up your company to begin: <a href="/setup">Company context</a>.</p></>;
  const supabase = await supabaseServer();
  const { data: company } = await supabase.from("companies").select("name").eq("id", s.companyId).maybeSingle();
  const { data: last } = await supabase.from("assessments").select("id, completed_at, overall_score").eq("company_id", s.companyId).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle();
  const { data: areas } = last ? await supabase.from("assessment_area_scores").select("area_key, score_pct, band").eq("assessment_id", last.id).order("score_pct") : { data: null };
  return (
    <>
      <h1>{company?.name}</h1>
      <p className="sub">Release 1 preview: Health Check is live; plan, execution and scorecard follow in the next stage.</p>
      <div className="row">
        <div className="card">
          <div className="kv">Latest Health Check</div>
          {last ? <><div className="big">{last.overall_score}%</div><div className="kv">{new Date(last.completed_at!).toLocaleDateString("en-ZA")} · lowest: {areas?.[0]?.area_key} {areas?.[0]?.score_pct}%</div><div className="actions"><a className="btn ghost" href={`/health-check/results?a=${last.id}`}>See results</a></div></>
            : <><div className="big">—</div><div className="actions"><a className="btn" href="/health-check">Start the Health Check</a></div></>}
        </div>
        <div className="card"><div className="kv">Priorities this year</div><div className="big">—</div><div className="kv">Strategy and Growth Plan: next stage</div></div>
        <div className="card"><div className="kv">Actions this quarter</div><div className="big">—</div><div className="kv">90 Day Execution: next stage</div></div>
        <div className="card"><div className="kv">KPIs on target</div><div className="big">—</div><div className="kv">CEO Scorecard: next stage</div></div>
      </div>
    </>
  );
}
