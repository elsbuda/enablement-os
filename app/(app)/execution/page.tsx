import { getSession, supabaseServer } from "@/lib/supabase/server";
import { defaultPlanYear, loadMembers, loadPlan, memberName } from "@/lib/data/plan";
import { deriveStatus, summarise, weekOf, type ActionRow } from "@/lib/engine/execution";
import { addAction, addInitiative, closePeriod, setActionStatus, startPeriod } from "./actions";

const pillFor = (d: string) => (d === "done" ? "g" : d === "late" ? "b" : d === "at_risk" ? "w" : "n");
const label = (d: string) => ({ done: "Done", late: "Late", at_risk: "At risk", on_track: "On track", not_started: "Not started" }[d] ?? d);

export default async function Execution({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const s = (await getSession())!;
  if (!s.companyId) return <p>Set up your company first: <a href="/setup">Company context</a>.</p>;
  const supabase = await supabaseServer();
  const canEdit = s.role !== "viewer";
  const isAdmin = s.role === "owner" || s.role === "admin";
  const planYear = defaultPlanYear();
  const [priorities, members] = await Promise.all([loadPlan(s.companyId, planYear), loadMembers(s.companyId)]);
  const { data: period } = await supabase.from("periods").select("*").eq("company_id", s.companyId).eq("status", "active").maybeSingle();
  const { data: initiatives } = await supabase.from("initiatives").select("*").eq("company_id", s.companyId).eq("status", "active").order("title");
  const { data: kpis } = await supabase.from("kpis").select("id, name").eq("company_id", s.companyId).order("name");
  const today = new Date();
  const rows = period ? ((await supabase.from("actions").select("*").eq("period_id", period.id).order("due_date")).data ?? []) as ActionRow[] : [];
  const derived = rows.map((a) => deriveStatus(a, today));
  const sum = summarise(derived);

  if (!period) {
    return (
      <>
        <h1>90 Day Execution</h1>
        <p className="sub">Start a 90-day period, then break each initiative into actions with an owner and a date. One active period at a time.</p>
        {sp.error && <div className="error">{sp.error}</div>}
        {priorities.length === 0 && <div className="ok" style={{ background: "var(--tint)", color: "var(--accent)", borderColor: "var(--accent)" }}>Set at least one priority in the <a href="/plan">Strategy and Growth Plan</a> first, so actions have something to serve.</div>}
        {canEdit && (
          <form action={startPeriod} className="card">
            <h2>Start the next 90 days</h2>
            <input type="hidden" name="plan_year" value={planYear} />
            <div className="form">
              <div><label htmlFor="start">Start date (default today)</label><input id="start" name="start_date" type="date" /></div>
              <div><label htmlFor="label">Label (optional, e.g. Q1 2027)</label><input id="label" name="label" maxLength={40} /></div>
              <div style={{ alignSelf: "end" }}><button className="btn" type="submit">Start period</button></div>
            </div>
          </form>
        )}
      </>
    );
  }

  const week = weekOf(period.start_date, today);
  return (
    <>
      <h1>90-day board · {period.label}</h1>
      <p className="sub">{period.start_date} to {period.end_date} · week {week} of 13. Every action has an owner, a due date and a status; Late and At risk are worked out from the dates, not typed.</p>
      {sp.error && <div className="error">{sp.error}</div>}
      {sp.saved && <div className="ok">{sp.saved}</div>}
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="card"><div className="kv">Done</div><div className="big">{sum.done}<span className="kv"> / {sum.total}</span></div><div className="bar"><i style={{ width: `${sum.completion_pct}%` }} /></div></div>
        <div className="card"><div className="kv">On track</div><div className="big">{sum.on_track}</div></div>
        <div className="card"><div className="kv">At risk</div><div className="big" style={{ color: "var(--warn)" }}>{sum.at_risk}</div></div>
        <div className="card"><div className="kv">Late</div><div className="big" style={{ color: "var(--bad)" }}>{sum.late}</div>{sum.overloaded && <div className="kv" style={{ color: "var(--bad)" }}>More than 20% late: the plan is overloaded. Drop something at the check-in.</div>}</div>
      </div>
      <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}><a className="btn" href="/execution/checkin">Weekly check-in</a><a className="btn ghost" href="/plan">Plan</a></div>

      {priorities.map((p) => {
        const inits = (initiatives ?? []).filter((i) => i.priority_id === p.id);
        return (
          <div className="card" key={p.id} style={{ marginBottom: 14 }}>
            <div className="tag">Priority</div>
            <h2>{p.title}</h2>
            {inits.length === 0 && <p className="kv">No initiatives yet. An initiative is a piece of work with a start and an end that moves one of this priority&apos;s targets.</p>}
            {inits.map((init) => {
              const acts = derived.filter((a) => a.initiative_id === init.id);
              return (
                <div key={init.id} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  <strong>{init.title}</strong> <span className="kv">{init.description ?? ""} · owner {memberName(members.find((m) => m.user_id === init.owner_user_id))}</span>
                  {acts.length > 0 && (
                    <div className="tw" style={{ marginTop: 8 }}><table>
                      <thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th>{canEdit && <th>Update</th>}</tr></thead>
                      <tbody>{acts.map((a) => (
                        <tr key={a.id}>
                          <td>{a.title}{a.kpi_id && <span className="kv"> · moves {kpis?.find((k) => k.id === a.kpi_id)?.name}</span>}</td>
                          <td>{memberName(members.find((m) => m.user_id === a.owner_user_id))}</td>
                          <td>{a.due_date} <span className="kv">{a.derived === "done" ? "" : a.days_to_due < 0 ? `${-a.days_to_due}d late` : `${a.days_to_due}d`}</span></td>
                          <td><span className={`pill ${pillFor(a.derived)}`}>{label(a.derived)}</span></td>
                          {canEdit && <td><form action={setActionStatus} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="from" value="/execution" />
                            {a.derived !== "done" && <button className="btn ghost small" name="status" value="on_track" type="submit">Started</button>}
                            {a.derived !== "done" && <button className="btn ghost small" name="status" value="at_risk" type="submit">Flag risk</button>}
                            {a.derived !== "done" ? <button className="btn small" name="status" value="done" type="submit">Done</button>
                              : <button className="btn ghost small" name="status" value="on_track" type="submit">Reopen</button>}
                          </form></td>}
                        </tr>))}
                      </tbody>
                    </table></div>
                  )}
                  {canEdit && (
                    <form action={addAction} className="form" style={{ marginTop: 10 }}>
                      <input type="hidden" name="initiative_id" value={init.id} /><input type="hidden" name="period_id" value={period.id} />
                      <div><label htmlFor={`at-${init.id}`}>New action</label><input id={`at-${init.id}`} name="title" required minLength={3} maxLength={160} placeholder="e.g. Call top 10 lapsed accounts" /></div>
                      <div><label htmlFor={`ao-${init.id}`}>Owner</label><select id={`ao-${init.id}`} name="owner_user_id" defaultValue={init.owner_user_id ?? s.userId}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}</select></div>
                      <div><label htmlFor={`ad-${init.id}`}>Due</label><input id={`ad-${init.id}`} name="due_date" type="date" required min={period.start_date} max={period.end_date} /></div>
                      <div><label htmlFor={`ak-${init.id}`}>Moves which measure (optional)</label><select id={`ak-${init.id}`} name="kpi_id" defaultValue=""><option value="">None</option>{(kpis ?? []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></div>
                      <div style={{ alignSelf: "end" }}><button className="btn ghost" type="submit">Add action</button></div>
                    </form>
                  )}
                </div>
              );
            })}
            {canEdit && (
              <form action={addInitiative} className="form" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <input type="hidden" name="priority_id" value={p.id} />
                <div><label htmlFor={`it-${p.id}`}>New initiative for this priority</label><input id={`it-${p.id}`} name="title" required minLength={3} maxLength={120} placeholder="e.g. Win back lapsed mine accounts" /></div>
                <div><label htmlFor={`id-${p.id}`}>One line on what it is (optional)</label><input id={`id-${p.id}`} name="description" maxLength={500} /></div>
                <div><label htmlFor={`io-${p.id}`}>Owner</label><select id={`io-${p.id}`} name="owner_user_id" defaultValue={s.userId}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}</select></div>
                <div style={{ alignSelf: "end" }}><button className="btn ghost" type="submit">Add initiative</button></div>
              </form>
            )}
          </div>
        );
      })}

      {isAdmin && (
        <form action={closePeriod} className="card">
          <h2>Close this period</h2>
          <p className="kv">Closing writes a review record, rolls unfinished actions into the next 90 days, and keeps this period read-only in history. Then score the targets in review mode.</p>
          <input type="hidden" name="period_id" value={period.id} /><input type="hidden" name="plan_year" value={planYear} />
          <div className="form">
            <div><label htmlFor="ach">What was achieved</label><textarea id="ach" name="achieved_text" rows={3} maxLength={2000} /></div>
            <div><label htmlFor="slip">What slipped, and why</label><textarea id="slip" name="slipped_text" rows={3} maxLength={2000} /></div>
          </div>
          <div className="actions"><button className="btn ghost" type="submit">Close period and start the next 90 days</button></div>
        </form>
      )}
    </>
  );
}
