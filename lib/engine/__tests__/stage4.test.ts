import { describe, it, expect } from "vitest";
import { scorePlan } from "../plan";
import { deriveStatus, summarise, weekOf, defaultPeriod } from "../execution";
import { rag, variance, trend, lastMonths } from "../scorecard";

describe("plan scoring", () => {
  it("averages targets per priority and priorities per plan, ignoring unscored", () => {
    const r = scorePlan({ priorities: [
      { id: "a", targets: [{ result: 0.7 }, { result: 1.0 }, { result: 0.5 }] },
      { id: "b", targets: [{ result: 0.2 }, { result: null }] },
      { id: "c", targets: [{ result: null }] },
    ] });
    expect(r.priority_scores[0].value).toBeCloseTo(0.7333, 3);
    expect(r.priority_scores[1].value).toBeCloseTo(0.2, 3);
    expect(r.priority_scores[2].value).toBeNull();
    expect(r.priority_bands).toEqual(["Largely landed", "Did not land", null]);
    expect(r.plan_score).toBeCloseTo(0.4667, 3);
    expect(r.plan_band).toBe("Partly landed");
  });
});

describe("execution status derivation", () => {
  const today = new Date("2027-02-07T10:00:00Z");
  const base = { id: "x", title: "t", owner_user_id: "u", initiative_id: "i", kpi_id: null, completed_at: null } as const;
  it("past due and not done is late", () => {
    expect(deriveStatus({ ...base, due_date: "2027-02-03", status: "on_track" }, today).derived).toBe("late");
    expect(deriveStatus({ ...base, due_date: "2027-02-03", status: "on_track" }, today).days_to_due).toBe(-4);
  });
  it("due within 7 days and not started is at risk; started is on track", () => {
    expect(deriveStatus({ ...base, due_date: "2027-02-12", status: "not_started" }, today).derived).toBe("at_risk");
    expect(deriveStatus({ ...base, due_date: "2027-02-12", status: "on_track" }, today).derived).toBe("on_track");
    expect(deriveStatus({ ...base, due_date: "2027-03-12", status: "not_started" }, today).derived).toBe("not_started");
  });
  it("done stays done even if past due; owner flag is respected", () => {
    expect(deriveStatus({ ...base, due_date: "2027-01-01", status: "done" }, today).derived).toBe("done");
    expect(deriveStatus({ ...base, due_date: "2027-03-30", status: "at_risk" }, today).derived).toBe("at_risk");
  });
  it("summary flags overload above 20% late", () => {
    const rows = [
      deriveStatus({ ...base, due_date: "2027-02-01", status: "on_track" }, today),
      deriveStatus({ ...base, due_date: "2027-02-01", status: "on_track" }, today),
      deriveStatus({ ...base, due_date: "2027-03-01", status: "done" }, today),
      deriveStatus({ ...base, due_date: "2027-03-01", status: "on_track" }, today),
    ];
    const s = summarise(rows);
    expect(s.late).toBe(2); expect(s.done).toBe(1); expect(s.completion_pct).toBe(25); expect(s.overloaded).toBe(true);
  });
  it("week and default period", () => {
    expect(weekOf("2027-01-01", today)).toBe(6);
    const p = defaultPeriod(new Date("2027-01-01T00:00:00Z"), 2027);
    expect(p).toEqual({ label: "Q1 2027", start_date: "2027-01-01", end_date: "2027-04-01" });
  });
});

describe("scorecard rules", () => {
  it("RAG with direction", () => {
    expect(rag(690000, 750000, "higher_better")).toBe("amber"); // 8% short
    expect(rag(600000, 750000, "higher_better")).toBe("red");
    expect(rag(800000, 750000, "higher_better")).toBe("green");
    expect(rag(54, 45, "lower_better")).toBe("red");     // 20% over
    expect(rag(48, 45, "lower_better")).toBe("amber");   // 6.7% over
    expect(rag(40, 45, "lower_better")).toBe("green");
    expect(rag(null, 45, "lower_better")).toBe("none");
  });
  it("variance is signed so positive always means better", () => {
    expect(variance(690000, 750000, "higher_better")).toBe(-60000);
    expect(variance(40, 45, "lower_better")).toBe(5);
  });
  it("trend is direction-aware", () => {
    expect(trend([410000, 520000, 690000], "higher_better")).toBe("improving");
    expect(trend([61, 58, 54], "lower_better")).toBe("improving");
    expect(trend([54, 58, 61], "lower_better")).toBe("worsening");
    expect(trend([null, 5], "higher_better")).toBe("none");
  });
  it("last three months are first-of-month, oldest first", () => {
    expect(lastMonths(3, new Date("2027-02-15T00:00:00Z"))).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
  });
});
