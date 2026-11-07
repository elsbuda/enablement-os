import { runRules, type Band, type Rule } from "./rules";

/** Bands and advice — ORIGINAL (not from any toolkit). */
export const PLAN_BANDS: Band[] = [
  { from: 0.7, to: 1.0, label: "Largely landed", advice: "Keep the priority only if the next step is clear; otherwise retire it." },
  { from: 0.4, to: 0.69, label: "Partly landed", advice: "Keep it and reset the target for next quarter." },
  { from: 0.0, to: 0.39, label: "Did not land", advice: "Ask whether the priority was wrong, under-resourced or badly measured before adding more actions." },
];

/** Plain arithmetic: average of target results per priority, then average of priorities. */
export const PLAN_RULES: Rule[] = [
  { op: "avg", over: "priorities[*].targets[*].result", group_by: "priorities", ignore_null: true, as: "priority_scores" },
  { op: "band", field: "priority_scores[*].value", bands: "interpretation", as: "priority_bands" },
  { op: "avg", over: "priority_scores[*].value", ignore_null: true, as: "plan_score" },
  { op: "band", field: "plan_score", bands: "interpretation", as: "plan_band" },
];

export type PlanInput = { priorities: { id: string; targets: { result: number | null }[] }[] };
export type PlanScore = { priority_scores: { index: number; value: number | null }[]; priority_bands: (string | null)[]; plan_score: number | null; plan_band: string | null };

export function scorePlan(input: PlanInput): PlanScore {
  return runRules(PLAN_RULES, input, PLAN_BANDS) as unknown as PlanScore;
}

export const TARGET_STATUS: { value: string; label: string }[] = [
  { value: "working_on_it", label: "Working on it" },
  { value: "done", label: "Done" },
  { value: "stuck", label: "Stuck" },
  { value: "moved_to_next_quarter", label: "Moved to next quarter" },
];

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const UNITS = ["R", "%", "count", "days"] as const;

export function formatValue(v: number | string | null | undefined, unit: string): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (unit === "R") return "R" + n.toLocaleString("en-ZA", { maximumFractionDigits: 0 }).replace(/,/g, " ");
  if (unit === "%") return n.toLocaleString("en-ZA", { maximumFractionDigits: 1 }) + "%";
  if (unit === "days") return n.toLocaleString("en-ZA", { maximumFractionDigits: 0 }) + " days";
  return n.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
}
