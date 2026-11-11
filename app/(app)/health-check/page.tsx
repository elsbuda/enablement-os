import { getSession, supabaseServer } from "@/lib/supabase/server";
import { HEALTH_AREAS, HEALTH_QUESTIONS, HEALTH_SCALE } from "@/lib/templates/health-check-v1";
import { saveArea, startOrContinue } from "./actions";
import { PageHead, Help, Empty } from "@/components/page";


export default async function HealthCheck({ searchParams }: { searchParams: Promise<{ a?: string; area?: string; error?: string }> }) {
  const { a, area, error } = await searchParams;
  const s = (await getSession())!;
  if (!s.companyId) return <p>Set up your company first: <a href="/setup">Company context</a>.</p>;
  const supabase = await supabaseServer();

  if (!a) {
    const { data: done } = await supabase.from("assessments").select("id, completed_at, overall_score").eq("company_id", s.companyId).eq("status", "completed").order("completed_at", { ascending: false }).limit(5);
    const { data: open } = await supabase.from("assessments").select("id").eq("company_id", s.companyId).eq("status", "in_progress").limit(1).maybeSingle();
    return (
      <>
        <PageHead title="Business Health Check" context="48 statements, 8 areas, about an hour. Pause any time." action={<form action={startOrContinue}><button className="btn" type="submit">{open ? "Continue where you left off" : "Start a new Health Check"}</button></form>} />
        {error && <div className="error">{error}</div>}
        {!open && (!done || done.length === 0) && <Empty title="No Health Check yet" action={<form action={startOrContinue}><button className="btn" type="submit">Start a new Health Check</button></form>}>Rate how true 48 statements are for your business today. You get a score per area and three suggested priorities.</Empty>}
        {done && done.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <h2>Previous Health Checks</h2>
            <table><thead><tr><th>Completed</th><th className="num">Overall</th><th></th></tr></thead><tbody>
              {done.map((d) => <tr key={d.id}><td>{new Date(d.completed_at!).toLocaleDateString("en-ZA")}</td><td className="num">{d.overall_score}%</td><td><a href={`/health-check/results?a=${d.id}`}>View</a></td></tr>)}
            </tbody></table>
          </div>
        )}
      </>
    );
  }

  const areaKey = area ?? HEALTH_AREAS[0].key;
  const idx = HEALTH_AREAS.findIndex((x) => x.key === areaKey);
  const current = HEALTH_AREAS[idx];
  const qs = HEALTH_QUESTIONS.filter((q) => q.area === areaKey);
  const { data: existing } = await supabase.from("assessment_answers").select("question_key, value, dont_know").eq("assessment_id", a);
  const prior = new Map((existing ?? []).map((e) => [e.question_key, e.dont_know ? "dk" : String(e.value)]));
  const answeredTotal = existing?.length ?? 0;

  return (
    <>
      <PageHead title="Business Health Check" context={<>Area {idx + 1} of {HEALTH_AREAS.length}: <strong>{current.title}</strong> · {answeredTotal} of {HEALTH_QUESTIONS.length} answered</>} />
      <div className="bar" style={{ marginTop: -10 }}><i style={{ width: `${Math.round((answeredTotal / HEALTH_QUESTIONS.length) * 100)}%` }} /></div>
      <p className="kv" style={{ marginTop: 10 }}>{current.plain}</p>
      {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}
      <form action={saveArea} style={{ marginTop: 14 }}>
        <input type="hidden" name="assessment_id" value={a} />
        <input type="hidden" name="area" value={areaKey} />
        {qs.map((q) => (
          <div className="q" key={q.key}>
            <p>{q.key.slice(1)}. {q.text}</p>
            <div className="scale" role="radiogroup" aria-label={q.text}>
              {HEALTH_SCALE.map((sc) => (
                <label key={sc.value}><input type="radio" name={q.key} value={sc.value} defaultChecked={prior.get(q.key) === String(sc.value)} /> {sc.value} {sc.label}</label>
              ))}
              <label><input type="radio" name={q.key} value="dk" defaultChecked={prior.get(q.key) === "dk"} /> Don&apos;t know</label>
            </div>
          </div>
        ))}
        <div className="actions">
          {idx > 0 && <button className="btn ghost" type="submit" name="nav" value="prev">Previous area</button>}
          <button className="btn" type="submit" name="nav" value="next">{idx < HEALTH_AREAS.length - 1 ? "Save and next area" : "Finish and see results"}</button>
        </div>
      </form>
      <Help><p>Answers save each time you move between areas, so you can stop and come back.</p><p>&quot;Don&apos;t know&quot; scores 1: not knowing is itself a gap worth fixing.</p></Help>
    </>
  );
}
