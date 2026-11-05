import { getSession, supabaseServer } from "@/lib/supabase/server";
import { scoreHealthCheck } from "@/lib/engine/health-check";

const barClass = (pct: number) => (pct < 40 ? "lo" : pct < 60 ? "mid" : "");
const pill = (band: string) => (band === "Strong" ? "g" : band === "Developing" ? "n" : band === "Weak" ? "w" : "b");

export default async function Results({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const { a } = await searchParams;
  const s = (await getSession())!;
  if (!s.companyId) return <p>Set up your company first: <a href="/setup">Company context</a>.</p>;
  const supabase = await supabaseServer();

  let id = a;
  if (!id) {
    const { data } = await supabase.from("assessments").select("id").eq("company_id", s.companyId).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle();
    id = data?.id;
  }
  if (!id) return <><h1>Health Check results</h1><p className="sub">No completed Health Check yet. <a href="/health-check">Start one</a>.</p></>;

  const { data: assessment } = await supabase.from("assessments").select("id, completed_at, overall_score, status").eq("id", id).maybeSingle();
  if (!assessment || assessment.status !== "completed") return <p>That Health Check is not complete. <a href="/health-check">Continue it</a>.</p>;
  const { data: answers } = await supabase.from("assessment_answers").select("question_key, value, dont_know").eq("assessment_id", id);
  // Raw answers are the record; scores are recomputed by the same engine that stored them.
  const r = scoreHealthCheck(answers ?? []);
  const dontKnow = r.areas.reduce((n, x) => n + x.dont_know, 0);
  const when = new Date(assessment.completed_at!).toLocaleDateString("en-ZA", { year: "numeric", month: "long" });

  return (
    <>
      <h1>Health Check results · {when}</h1>
      <p className="sub">Overall {r.overall_pct}%, {r.overall_band}. {r.suggested.length} areas suggested as priorities. Accept, reorder or replace them when you build the plan.</p>
      <div className="row">
        <div className="card" style={{ flex: "2 1 360px" }}>
          <h2>Area scores</h2>
          {r.areas.map((ar) => (
            <div key={ar.area_key} style={{ marginBottom: 10 }}>
              <div className="score"><span>{ar.title}</span><b>{ar.score_pct}%</b></div>
              <div className="bar"><i className={barClass(ar.score_pct)} style={{ width: `${ar.score_pct}%` }} /></div>
            </div>
          ))}
          <p className="note">Bands: under 40% Critical · 40 to 59% Weak · 60 to 79% Developing · 80%+ Strong. {dontKnow} statement{dontKnow === 1 ? "" : "s"} answered Don&apos;t know (scored 1).</p>
        </div>
        <div className="card" style={{ flex: "1 1 280px" }}>
          <h2>Suggested priorities</h2>
          {r.suggested.map((sp, i) => (
            <p key={sp.area_key}>
              <span className={`pill ${pill(r.areas.find((x) => x.area_key === sp.area_key)!.band)}`}>{i + 1}</span> <strong>{sp.title}</strong> {sp.score_pct}%<br />
              <span className="kv">{sp.reason}. Lowest statements: {sp.triggers.map((t) => `${t.text.toLowerCase()} (${t.value})`).join("; ")}</span>
            </p>
          ))}
          <div className="actions"><span className="btn" aria-disabled="true" style={{ opacity: 0.5 }}>Build the plan from these (next stage)</span></div>
        </div>
      </div>
    </>
  );
}
