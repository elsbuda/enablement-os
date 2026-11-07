/** Scorecard rules — ORIGINAL. Green on/better than target, Amber within 10% short, Red more than 10% short. */
export type Rag = "green" | "amber" | "red" | "none";

export function rag(actual: number | null, target: number | null, direction: "higher_better" | "lower_better"): Rag {
  if (actual == null || target == null || target === 0) return "none";
  const shortfall = direction === "higher_better" ? (target - actual) / Math.abs(target) : (actual - target) / Math.abs(target);
  if (shortfall <= 0) return "green";
  if (shortfall <= 0.1) return "amber";
  return "red";
}

export function variance(actual: number | null, target: number | null, direction: "higher_better" | "lower_better"): number | null {
  if (actual == null || target == null) return null;
  return direction === "higher_better" ? actual - target : target - actual; // positive = better than target
}

/** Trend over the last three actuals: improving, worsening or flat (direction-aware). */
export function trend(values: (number | null)[], direction: "higher_better" | "lower_better"): "improving" | "worsening" | "flat" | "none" {
  const xs = values.filter((v): v is number => v != null);
  if (xs.length < 2) return "none";
  const last = xs[xs.length - 1], first = xs[0];
  const delta = direction === "higher_better" ? last - first : first - last;
  if (Math.abs(delta) < 1e-9) return "flat";
  return delta > 0 ? "improving" : "worsening";
}

/** First day of month as YYYY-MM-01 for the last n months, oldest first. */
export function lastMonths(n: number, today: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function monthLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-ZA", { month: "short", year: "2-digit", timeZone: "UTC" });
}
