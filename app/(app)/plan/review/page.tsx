import { getSession } from "@/lib/supabase/server";
import { defaultPlanYear, loadMembers, loadPlan, memberName } from "@/lib/data/plan";
import { PLAN_BANDS, TARGET_STATUS, formatValue, scorePlan } from "@/lib/engine/plan";
import { saveReview } from "../actions";

export default async function Review({ searchParams }: { searchParams: Promise<{ year?: string; saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const s = (await getSession())!;
  if (!s.companyId) return <p>Set up your company first: <a href="/setup">Company context</a>.</p>;
  const year = Number(sp.year) || defaultPlanYear();
  const [priorities, members] = await Promise.all([loadPlan(s.companyId, year), loadMembers(s.companyId)]);
  const score = scorePlan({ priorities: priorities.map((p) => ({ id: p.id, targets: p.targets.map((t) => ({ result: t.result })) })) });
  const canEdit = s.role !== "viewer";
  const scored = priorities.some((p) => p.targets.some((t) => t.result != null));

  return (
    <>
      <h1>Quarterly review · {year} plan</h1>
      <p className="sub">For each target, say how far it landed: 0 = not at all, 1 = fully. The plan score is the average of the priorities, each the average of its targets.</p>
      {sp.error && <div className="error">{sp.error}</div>}
      {sp.saved && <div className="ok">Review saved.</div>}
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="card"><div className="kv">Plan score</div><div className="big">{score.plan_score == null ? "—" : score.plan_score.toFixed(2)}</div><div className="kv">{score.plan_band ?? (scored ? "" : "no results entered yet")}</div></div>
        {priorities.map((p, i) => (
          <div className="card" key={p.id}><div className="kv">{p.title}</div><div className="big">{score.priority_scores[i]?.value == null ? "—" : score.priority_scores[i].value!.toFixed(2)}</div><div className="kv">{score.priority_bands[i] ?? ""}</div></div>
        ))}
      </div>
      <form action={saveReview}>
        <input type="hidden" name="plan_year" value={year} />
        {priorities.map((p) => (
          <div className="card" key={p.id} style={{ marginBottom: 14 }}>
            <h2>{p.title}</h2>
            <p className="kv">{p.objective}</p>
            {p.targets.length === 0 ? <p className="kv">No targets to review.</p> : (
              <div className="tw"><table>
                <thead><tr><th>Measure</th><th className="num">Target</th><th>Owner</th><th>Due</th><th>How far did it land?</th><th>Status</th></tr></thead>
                <tbody>{p.targets.map((t) => (
                  <tr key={t.id}>
                    <td>{t.measure}<input type="hidden" name="target_id" value={t.id} /></td>
                    <td className="num">{formatValue(t.target_value, t.unit)}</td>
                    <td>{memberName(members.find((m) => m.user_id === t.owner_user_id))}</td>
                    <td>{t.due_quarter}</td>
                    <td><input type="number" name={`result_${t.id}`} min={0} max={1} step={0.1} defaultValue={t.result ?? ""} disabled={!canEdit} style={{ width: 90 }} /></td>
                    <td><select name={`status_${t.id}`} defaultValue={t.status} disabled={!canEdit}>{TARGET_STATUS.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}</select></td>
                  </tr>))}
                </tbody>
              </table></div>
            )}
          </div>
        ))}
        {canEdit && priorities.length > 0 && <div className="actions"><button className="btn" type="submit">Save review</button><a className="btn ghost" href={`/plan?year=${year}`}>Back to plan</a></div>}
      </form>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>How to read the score</h2>
        <ul>{PLAN_BANDS.map((b) => <li key={b.label}><strong>{b.label}</strong> ({b.from} to {b.to}): {b.advice}</li>)}</ul>
      </div>
    </>
  );
}
