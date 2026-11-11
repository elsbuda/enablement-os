import { getSession, supabaseServer } from "@/lib/supabase/server";
import { loadMembers, memberName } from "@/lib/data/plan";
import { deriveStatus, weekOf, type ActionRow } from "@/lib/engine/execution";
import { moveActionDate, setActionStatus } from "../actions";
import { PageHead, Help, Empty } from "@/components/page";

export default async function CheckIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const s = (await getSession())!;
  if (!s.companyId) return <p>Set up your company first: <a href="/setup">Company context</a>.</p>;
  const supabase = await supabaseServer();
  const canEdit = s.role !== "viewer";
  const { data: period } = await supabase.from("periods").select("*").eq("company_id", s.companyId).eq("status", "active").maybeSingle();
  if (!period) return <><PageHead title="Weekly check-in" crumb={[{ href: "/execution", label: "90 Day Execution" }]} /><Empty title="No active 90-day period" action={<a className="btn" href="/execution">Start a period</a>}>The check-in lists what is late, at risk or due this week in the current period.</Empty></>;
  const members = await loadMembers(s.companyId);
  const today = new Date();
  const rows = ((await supabase.from("actions").select("*").eq("period_id", period.id).order("due_date")).data ?? []) as ActionRow[];
  const items = rows.map((a) => deriveStatus(a, today)).filter((a) => a.derived === "late" || a.derived === "at_risk" || (a.derived !== "done" && a.days_to_due <= 7));
  const order = { late: 0, at_risk: 1, not_started: 2, on_track: 3, done: 4 } as const;
  items.sort((x, y) => order[x.derived] - order[y.derived] || x.days_to_due - y.days_to_due);

  return (
    <>
      <PageHead title="Weekly check-in" crumb={[{ href: "/execution", label: "90 Day Execution" }]} context={<>Week {weekOf(period.start_date, today)} of 13 · only what is late, at risk or due in the next 7 days</>} />
      {sp.error && <div className="error">{sp.error}</div>}
      {items.length === 0 && <Empty title="Nothing needs a decision this week" action={<a className="btn ghost" href="/execution">See the full board</a>}>No actions are late, at risk or due in the next 7 days.</Empty>}
      {items.map((a) => (
        <div className="card" key={a.id} style={{ marginBottom: 12 }}>
          <span className={`pill ${a.derived === "late" ? "b" : a.derived === "at_risk" ? "w" : "n"}`}>{a.derived === "late" ? "Late" : a.derived === "at_risk" ? "At risk" : "Due soon"}</span> <strong>{a.title}</strong>
          <div className="kv">{memberName(members.find((m) => m.user_id === a.owner_user_id))} · due {a.due_date} · {a.days_to_due < 0 ? `${-a.days_to_due} days late` : a.days_to_due === 0 ? "due today" : `${a.days_to_due} days left`}</div>
          {canEdit && (
            <div className="actions" style={{ marginTop: 10 }}>
              <form action={setActionStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="from" value="/execution/checkin" /><button className="btn" name="status" value="done" type="submit">Mark done</button></form>
              {a.derived !== "on_track" && <form action={setActionStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="from" value="/execution/checkin" /><button className="btn ghost" name="status" value="on_track" type="submit">It&apos;s started</button></form>}
              <form action={moveActionDate} style={{ display: "flex", gap: 6 }}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="from" value="/execution/checkin" /><input type="date" name="due_date" defaultValue={a.due_date} min={period.start_date} max={period.end_date} style={{ width: 160 }} /><button className="btn ghost" type="submit">Move date</button></form>
            </div>
          )}
        </div>
      ))}
      <div className="actions"><a className="btn ghost" href="/execution">Full board</a></div>
    </>
  );
}
