/** Execution rules — ORIGINAL. Late/at-risk are derived on read so they are never stale. */
export type ActionRow = { id: string; title: string; owner_user_id: string; due_date: string; status: "not_started" | "on_track" | "late" | "at_risk" | "done"; initiative_id: string; kpi_id: string | null; completed_at: string | null };

export type Derived = ActionRow & { derived: "done" | "late" | "at_risk" | "on_track" | "not_started"; days_to_due: number };

const DAY = 864e5;

export function deriveStatus(a: ActionRow, today: Date): Derived {
  const due = new Date(a.due_date + "T00:00:00Z");
  const t0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const days = Math.round((due.getTime() - t0.getTime()) / DAY);
  let derived: Derived["derived"];
  if (a.status === "done") derived = "done";
  else if (days < 0) derived = "late";
  else if (a.status === "at_risk" || (days <= 7 && a.status === "not_started")) derived = "at_risk";
  else derived = a.status === "not_started" ? "not_started" : "on_track";
  return { ...a, derived, days_to_due: days };
}

export function summarise(rows: Derived[]) {
  const n = (k: Derived["derived"]) => rows.filter((r) => r.derived === k).length;
  const total = rows.length;
  const done = n("done");
  return { total, done, on_track: n("on_track"), not_started: n("not_started"), at_risk: n("at_risk"), late: n("late"), completion_pct: total ? Math.round((done / total) * 100) : 0, overloaded: total > 0 && n("late") / total > 0.2 };
}

/** Week number inside a period (1-based), clamped to 1..13. */
export function weekOf(start: string, today: Date): number {
  const s = new Date(start + "T00:00:00Z");
  const w = Math.floor((today.getTime() - s.getTime()) / (7 * DAY)) + 1;
  return Math.max(1, Math.min(13, w));
}

/** Default 90-day period: starts today, ends 90 days later, labelled by quarter of the start. */
export function defaultPeriod(today: Date, planYear: number): { label: string; start_date: string; end_date: string } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const end = new Date(start.getTime() + 90 * DAY);
  const q = Math.floor(start.getUTCMonth() / 3) + 1;
  return { label: `Q${q} ${start.getUTCFullYear()}${start.getUTCFullYear() !== planYear ? ` (plan ${planYear})` : ""}`, start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) };
}
