import { getSession, supabaseServer } from "@/lib/supabase/server";
import { loadMembers, memberName } from "@/lib/data/plan";
import { formatValue } from "@/lib/engine/plan";
import { lastMonths, monthLabel, rag, trend, variance, type Rag } from "@/lib/engine/scorecard";
import { PERSPECTIVE_LABEL } from "@/lib/templates/kpi-library";
import { deriveStatus, summarise, type ActionRow } from "@/lib/engine/execution";
import { saveActuals, updateKpiTarget } from "./actions";
import { PageHead, Help, Empty } from "@/components/page";

const ragClass: Record<Rag, string> = { green: "g", amber: "w", red: "b", none: "" };
const ragText: Record<Rag, string> = { green: "On target", amber: "Just short", red: "Off target", none: "No data" };

export default async function Scorecard({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; month?: string }> }) {
  const sp = await searchParams;
  const s = (await getSession())!;
  if (!s.companyId) return <p>Set up your company first: <a href="/setup">Company context</a>.</p>;
  const supabase = await supabaseServer();
  const canEdit = s.role !== "viewer";
  const today = new Date();
  const months = lastMonths(3, today);
  const entryMonth = sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : months[months.length - 1];
  const [members, { data: kpis }] = await Promise.all([loadMembers(s.companyId), supabase.from("kpis").select("*").eq("company_id", s.companyId).order("perspective").order("name")]);
  const ids = (kpis ?? []).map((k) => k.id);
  const { data: actuals } = ids.length ? await supabase.from("kpi_actuals").select("kpi_id, period_month, actual_value").in("kpi_id", ids).gte("period_month", months[0]) : { data: [] };
  const get = (kpiId: string, m: string) => { const r = actuals?.find((a) => a.kpi_id === kpiId && a.period_month === m); return r ? Number(r.actual_value) : null; };
  const { data: period } = await supabase.from("periods").select("id, label").eq("company_id", s.companyId).eq("status", "active").maybeSingle();
  const acts = period ? (((await supabase.from("actions").select("*").eq("period_id", period.id)).data ?? []) as ActionRow[]).map((a) => deriveStatus(a, today)) : [];
  const sum = summarise(acts);
  const latest = months[months.length - 1];
  const rows = (kpis ?? []).map((k) => {
    const series = months.map((m) => get(k.id, m));
    const actual = series[series.length - 1];
    const target = k.target_value == null ? null : Number(k.target_value);
    return { k, series, actual, target, rag: rag(actual, target, k.direction), variance: variance(actual, target, k.direction), trend: trend(series, k.direction) };
  });
  const onTarget = rows.filter((r) => r.rag === "green").length, withData = rows.filter((r) => r.rag !== "none").length;

  return (
    <>
      <PageHead title="CEO Scorecard" context={<>{monthLabel(latest)} · each measure against its monthly target, with a three-month trend</>} />
      {sp.error && <div className="error">{sp.error}</div>}
      {sp.saved && <div className="ok">{sp.saved}</div>}
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="card"><div className="kv">Measures on target</div><div className="big">{onTarget}<span className="kv"> / {withData}</span></div><div className="kv">{rows.length - withData} without an actual yet</div></div>
        <div className="card"><div className="kv">Actions this period</div><div className="big">{sum.done}<span className="kv"> / {sum.total}</span></div><div className="kv">{period ? `${period.label}: ${sum.late} late, ${sum.at_risk} at risk` : "no active period"}</div></div>
        <div className="card"><div className="kv">Red measures</div><div className="big" style={{ color: "var(--bad)" }}>{rows.filter((r) => r.rag === "red").length}</div><div className="kv">A red financial measure two months running should get an action on the board</div></div>
      </div>

      {rows.length === 0 ? <div className="card">No measures yet. Add a target from the measure list in the <a href="/plan">plan</a>; it appears here automatically.</div> : (
        <div className="card">
          <div className="tw"><table>
            <thead><tr><th>Measure</th><th>Group</th><th>Owner</th><th className="num">Monthly target</th>{months.map((m) => <th key={m} className="num">{monthLabel(m)}</th>)}<th>Status</th><th>Trend</th></tr></thead>
            <tbody>{rows.map(({ k, series, target, rag: r, variance: v, trend: t }) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="kv">{k.perspective ? PERSPECTIVE_LABEL[k.perspective as keyof typeof PERSPECTIVE_LABEL] : ""}</td>
                <td>{memberName(members.find((m) => m.user_id === k.owner_user_id))}</td>
                <td className="num">{canEdit ? <form action={updateKpiTarget} style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}><input type="hidden" name="kpi_id" value={k.id} /><input name="target_value" type="number" step="any" defaultValue={target ?? ""} style={{ width: 110, textAlign: "right" }} /><button className="btn ghost small" type="submit">Set</button></form> : formatValue(target, k.unit)}</td>
                {series.map((val, i) => <td key={i} className="num">{formatValue(val, k.unit)}</td>)}
                <td><span className={`pill ${ragClass[r]}`}>{ragText[r]}</span>{v != null && r !== "none" && <span className="kv"> {v >= 0 ? "+" : ""}{formatValue(v, k.unit)}</span>}</td>
                <td className="kv">{t === "none" ? "—" : t}</td>
              </tr>))}
            </tbody>
          </table></div>
          <Help title="About monthly targets"><p>Targets set in the plan are annual; the monthly target here defaults to the annual figure and should be set to the monthly equivalent (for a rand or count measure, roughly the annual target divided by 12; for a percentage or days measure, the same figure). Trend compares the latest month with the earliest of the three shown.</p></Help>
        </div>
      )}

      {canEdit && rows.length > 0 && (
        <form action={saveActuals} className="card" style={{ marginTop: 16 }}>
          <h2>Enter actuals for {monthLabel(entryMonth)}</h2>
          <div className="row" style={{ alignItems: "center", marginBottom: 8 }}><span className="kv">Month:</span>{months.map((m) => <a key={m} className={`pill ${m === entryMonth ? "n" : ""}`} href={`/scorecard?month=${m}`} style={{ textDecoration: "none" }}>{monthLabel(m)}</a>)}</div>
          <input type="hidden" name="month" value={entryMonth} />
          <div className="form">
            {rows.map(({ k }) => (
              <div key={k.id}><label htmlFor={`a-${k.id}`}>{k.name} ({k.unit})</label><input id={`a-${k.id}`} name={`actual_${k.id}`} type="number" step="any" defaultValue={get(k.id, entryMonth) ?? ""} /><input type="hidden" name="kpi_id" value={k.id} /></div>
            ))}
          </div>
          <div className="actions"><button className="btn" type="submit">Save actuals</button></div>
          <p className="kv">Typed in once a month by the owner or an admin.</p>
        </form>
      )}
    </>
  );
}
