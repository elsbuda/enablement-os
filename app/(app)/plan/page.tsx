import { getSession, supabaseServer } from "@/lib/supabase/server";
import { scoreHealthCheck } from "@/lib/engine/health-check";
import { HEALTH_AREAS } from "@/lib/templates/health-check-v1";
import { KPI_LIBRARY, PERSPECTIVE_LABEL } from "@/lib/templates/kpi-library";
import { QUARTERS, UNITS, formatValue } from "@/lib/engine/plan";
import { defaultPlanYear, loadMembers, loadPlan, memberName } from "@/lib/data/plan";
import { acceptSuggestions, addPriority, addTarget, deleteTarget, retirePriority, updatePriority } from "./actions";

const areaTitle = (k: string | null) => HEALTH_AREAS.find((a) => a.key === k)?.title ?? k ?? "";

export default async function Plan({ searchParams }: { searchParams: Promise<{ year?: string; error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const s = (await getSession())!;
  if (!s.companyId) return <p>Set up your company first: <a href="/setup">Company context</a>.</p>;
  const year = Number(sp.year) || defaultPlanYear();
  const canEdit = s.role !== "viewer";
  const isAdmin = s.role === "owner" || s.role === "admin";
  const supabase = await supabaseServer();
  const [priorities, members] = await Promise.all([loadPlan(s.companyId, year), loadMembers(s.companyId)]);

  // Suggestions from the latest completed Health Check (only shown while the plan has fewer than 3 priorities).
  let suggestions: { area_key: string; title: string; score_pct: number; reason: string; triggers: { text: string; value: number }[] }[] = [];
  let assessmentId = "";
  if (priorities.length < 3) {
    const { data: last } = await supabase.from("assessments").select("id").eq("company_id", s.companyId).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle();
    if (last) {
      assessmentId = last.id;
      const { data: answers } = await supabase.from("assessment_answers").select("question_key, value, dont_know").eq("assessment_id", last.id);
      const used = new Set(priorities.map((p) => p.source_area_key));
      suggestions = scoreHealthCheck(answers ?? []).suggested.filter((x) => !used.has(x.area_key));
    }
  }
  const suggestedTitle: Record<string, string> = {
    sales: "Grow sales without the owner in every deal", risk: "Be able to survive a bad month", finance: "See cash and margin before they bite",
    strategy: "Get everyone pulling in one direction", customers: "Know who buys and why", operations: "Deliver without heroics",
    people: "Put the right people in clear roles", leadership: "Run the business on a rhythm",
  };
  const years = [defaultPlanYear() - 1, defaultPlanYear(), defaultPlanYear() + 1].filter((y) => y >= 2026);

  return (
    <>
      <h1>Strategy and Growth Plan · {year}</h1>
      <p className="sub">Three to five priorities for the year, each with one to three targets that say how you will know it happened. {priorities.length} of 5 priorities set.</p>
      <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
        <span className="kv">Plan year:</span>
        {years.map((y) => <a key={y} className={`pill ${y === year ? "n" : ""}`} href={`/plan?year=${y}`} style={{ textDecoration: "none" }}>{y}</a>)}
        {priorities.length > 0 && <a className="btn ghost" href={`/plan/review?year=${year}`} style={{ marginLeft: "auto" }}>Quarterly review mode</a>}
      </div>
      {sp.error && <div className="error">{sp.error}</div>}
      {sp.saved && <div className="card" style={{ marginBottom: 14 }}>{sp.saved}</div>}

      {canEdit && suggestions.length > 0 && (
        <form action={acceptSuggestions} className="card" style={{ marginBottom: 16 }}>
          <h2>Suggested from your Health Check</h2>
          <p className="kv">Keep, reword or untick each. You can change the wording later.</p>
          <input type="hidden" name="plan_year" value={year} />
          <input type="hidden" name="assessment_id" value={assessmentId} />
          {suggestions.map((sg, i) => (
            <div className="q" key={sg.area_key}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)", fontSize: 14 }}>
                <input type="checkbox" name={`keep_${i}`} defaultChecked style={{ width: "auto" }} /> <strong>{sg.title}</strong> {sg.score_pct}% <span className="kv">· {sg.reason}</span>
              </label>
              <input type="hidden" name={`area_${i}`} value={sg.area_key} />
              <div className="form" style={{ marginTop: 8 }}>
                <div><label htmlFor={`t${i}`}>Priority (5 to 80 characters)</label><input id={`t${i}`} name={`title_${i}`} defaultValue={suggestedTitle[sg.area_key] ?? `Improve ${sg.title.toLowerCase()}`} maxLength={80} /></div>
                <div><label htmlFor={`o${i}`}>By the end of the year, ... (10 to 200 characters)</label><input id={`o${i}`} name={`objective_${i}`} defaultValue="" placeholder="e.g. the two reps run the sales process without me" maxLength={200} /></div>
              </div>
              <p className="kv" style={{ marginTop: 6 }}>Lowest statements: {sg.triggers.map((t) => `${t.text.toLowerCase()} (${t.value})`).join("; ")}</p>
            </div>
          ))}
          <div className="actions"><button className="btn" type="submit">Add the ticked priorities</button></div>
        </form>
      )}

      {priorities.map((p, idx) => (
        <div className="card" key={p.id} style={{ marginBottom: 14 }}>
          <div className="tag">Priority {idx + 1}{p.source_area_key ? ` · from ${areaTitle(p.source_area_key)}` : ""}</div>
          {canEdit ? (
            <form action={updatePriority} className="form" style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={p.id} /><input type="hidden" name="plan_year" value={year} />
              <div><label htmlFor={`pt-${p.id}`}>Priority</label><input id={`pt-${p.id}`} name="title" defaultValue={p.title} maxLength={80} /></div>
              <div><label htmlFor={`po-${p.id}`}>By the end of the year, ...</label><input id={`po-${p.id}`} name="objective" defaultValue={p.objective} maxLength={200} /></div>
              <div style={{ alignSelf: "end" }}><button className="btn ghost" type="submit">Save wording</button></div>
            </form>
          ) : (<><h2 style={{ marginTop: 6 }}>{p.title}</h2><p className="kv">{p.objective}</p></>)}

          <h2 style={{ marginTop: 16 }}>Targets</h2>
          {p.targets.length === 0 ? <p className="kv">No target yet. A priority without a target is a wish.</p> : (
            <div className="tw"><table>
              <thead><tr><th>Measure</th><th className="num">Target</th><th>Owner</th><th>Due</th><th>Status</th><th>Scorecard</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>{p.targets.map((t) => (
                <tr key={t.id}>
                  <td>{t.measure}</td>
                  <td className="num">{formatValue(t.target_value, t.unit)} <span className="kv">({t.direction === "higher_better" ? "higher is better" : "lower is better"})</span></td>
                  <td>{memberName(members.find((m) => m.user_id === t.owner_user_id))}</td>
                  <td>{t.due_quarter} {year}</td>
                  <td><span className={`pill ${t.status === "done" ? "g" : t.status === "stuck" ? "b" : "n"}`}>{t.status.replace(/_/g, " ")}</span></td>
                  <td>{t.kpi_id ? <span className="pill g">tracked</span> : <span className="kv">custom</span>}</td>
                  {isAdmin && <td><form action={deleteTarget}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="plan_year" value={year} /><button className="btn ghost" type="submit" style={{ padding: "4px 8px", fontSize: 12 }}>Remove</button></form></td>}
                </tr>))}
              </tbody>
            </table></div>
          )}
          {canEdit && p.targets.length < 3 && (
            <form action={addTarget} style={{ marginTop: 12 }}>
              <input type="hidden" name="priority_id" value={p.id} /><input type="hidden" name="plan_year" value={year} />
              <div className="form">
                <div><label htmlFor={`k-${p.id}`}>Measure (from the list)</label>
                  <select id={`k-${p.id}`} name="kpi_key" defaultValue="">
                    <option value="">Type my own below</option>
                    {(["financial", "customer", "internal", "people"] as const).map((pers) => (
                      <optgroup key={pers} label={PERSPECTIVE_LABEL[pers]}>{KPI_LIBRARY.filter((k) => k.perspective === pers).map((k) => <option key={k.key} value={k.key}>{k.name} ({k.unit})</option>)}</optgroup>
                    ))}
                  </select></div>
                <div><label htmlFor={`m-${p.id}`}>Or my own measure</label><input id={`m-${p.id}`} name="measure" maxLength={80} placeholder="e.g. site visits booked per month" /></div>
                <div><label htmlFor={`v-${p.id}`}>Target number</label><input id={`v-${p.id}`} name="target_value" type="number" step="any" required /></div>
                <div><label htmlFor={`u-${p.id}`}>Unit (for own measure)</label><select id={`u-${p.id}`} name="unit" defaultValue="count">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
                <div><label htmlFor={`d-${p.id}`}>Direction (for own measure)</label><select id={`d-${p.id}`} name="direction" defaultValue="higher_better"><option value="higher_better">Higher is better</option><option value="lower_better">Lower is better</option></select></div>
                <div><label htmlFor={`ow-${p.id}`}>Owner</label><select id={`ow-${p.id}`} name="owner_user_id" defaultValue={s.userId}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)} ({m.role})</option>)}</select></div>
                <div><label htmlFor={`q-${p.id}`}>Due by</label><select id={`q-${p.id}`} name="due_quarter" defaultValue="Q1">{QUARTERS.map((q) => <option key={q}>{q}</option>)}</select></div>
                <div style={{ alignSelf: "end" }}><button className="btn" type="submit">Add target</button></div>
              </div>
            </form>
          )}
          {isAdmin && <form action={retirePriority} style={{ marginTop: 10 }}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="plan_year" value={year} /><button className="btn ghost" type="submit" style={{ fontSize: 12, padding: "4px 8px" }}>Retire this priority</button></form>}
        </div>
      ))}

      {canEdit && priorities.length < 5 && (
        <form action={addPriority} className="card">
          <h2>Add a priority of your own</h2>
          <input type="hidden" name="plan_year" value={year} />
          <div className="form">
            <div><label htmlFor="np-title">Priority (5 to 80 characters)</label><input id="np-title" name="title" required minLength={5} maxLength={80} placeholder="One thing you will change this year" /></div>
            <div><label htmlFor="np-obj">By the end of the year, ... (10 to 200)</label><input id="np-obj" name="objective" required minLength={10} maxLength={200} /></div>
            <div><label htmlFor="np-area">Related Health Check area (optional)</label><select id="np-area" name="source_area_key" defaultValue=""><option value="">None</option>{HEALTH_AREAS.map((a) => <option key={a.key} value={a.key}>{a.title}</option>)}</select></div>
            <div style={{ alignSelf: "end" }}><button className="btn" type="submit">Add priority</button></div>
          </div>
        </form>
      )}
      {priorities.length === 0 && suggestions.length === 0 && <p className="note">Complete a <a href="/health-check">Health Check</a> first and the three lowest areas will be suggested here.</p>}
      <p className="note">Words we use: a <strong>priority</strong> is one thing you will change this year; a <strong>target</strong> is the number, date and owner that prove it happened; a measure marked <em>tracked</em> is also on the scorecard for monthly actuals.</p>
    </>
  );
}
