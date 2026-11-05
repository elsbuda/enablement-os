import { describe, it, expect } from "vitest";
import { runRules, resolvePath, validateRules, bandFor } from "../rules";
import { scoreHealthCheck } from "../health-check";
import { HEALTH_QUESTIONS } from "../../templates/health-check-v1";

describe("rules runner", () => {
  const interpretation = [
    { from: 0.7, to: 1.0, label: "Largely landed" },
    { from: 0.4, to: 0.69, label: "Partly landed" },
    { from: 0.0, to: 0.39, label: "Did not land" },
  ];
  const input = {
    priorities: [
      { title: "Grow sales", targets: [{ result: 0.7 }, { result: 1.0 }, { result: 0.5 }] },
      { title: "Survive a bad month", targets: [{ result: 0.2 }, { result: null }] },
    ],
  };
  const rules = [
    { op: "avg", over: "priorities[*].targets[*].result", group_by: "priorities", ignore_null: true, as: "priority_scores" },
    { op: "band", field: "priority_scores[*].value", bands: "interpretation", as: "priority_bands" },
    { op: "avg", over: "priority_scores[*].value", ignore_null: true, as: "plan_score" },
    { op: "band", field: "plan_score", bands: "interpretation", as: "plan_band" },
  ] as const;

  it("reproduces the OKR sheet averages (E7 and E21)", () => {
    const out = runRules([...rules] as never, input, interpretation);
    const scores = out.priority_scores as { value: number }[];
    expect(scores[0].value).toBeCloseTo(0.7333, 3);
    expect(scores[1].value).toBeCloseTo(0.2, 3);        // null ignored, as the sheet's AVERAGE ignores blanks
    expect(out.priority_bands).toEqual(["Largely landed", "Did not land"]);
    expect(out.plan_score).toBeCloseTo((0.7333 + 0.2) / 2, 3);
    expect(out.plan_band).toBe("Partly landed");
  });

  it("refuses non-allowed operations", () => {
    expect(validateRules([{ op: "eval", expr: "1+1" }])).toBe(false);
    expect(() => runRules([{ op: "eval" } as never], {}, [])).toThrow(/non-allowed/);
  });

  it("resolves wildcard paths", () => {
    expect(resolvePath(input, "priorities[*].targets[*].result")).toEqual([0.7, 1.0, 0.5, 0.2, null]);
  });

  it("count_if, diff, ratio and map", () => {
    const out = runRules(
      [
        { op: "count_if", over: "actions[*].status", equals: "late", as: "late" },
        { op: "diff", a: "actual", b: "target", as: "variance" },
        { op: "ratio", a: "actual", b: "target", as: "attainment_pct", pct: true },
        { op: "map", field: "impact", mapping: { "1": "Low", "2": "Medium", "3": "High" }, as: "impact_label" },
      ],
      { actions: [{ status: "late" }, { status: "done" }, { status: "late" }], actual: 690000, target: 750000, impact: 3 },
    );
    expect(out.late).toBe(2);
    expect(out.variance).toBe(-60000);
    expect(out.attainment_pct).toBeCloseTo(92, 5);
    expect(out.impact_label).toBe("High");
  });

  it("bands are inclusive at both edges", () => {
    expect(bandFor(0.7, interpretation)).toBe("Largely landed");
    expect(bandFor(0.69, interpretation)).toBe("Partly landed");
    expect(bandFor(null, interpretation)).toBeNull();
  });
});

describe("health check scoring", () => {
  const all = (value: number) => HEALTH_QUESTIONS.map((q) => ({ question_key: q.key, value, dont_know: false }));

  it("all 5s scores 100% Strong; all 1s scores 20% Critical", () => {
    expect(scoreHealthCheck(all(5)).overall_pct).toBe(100);
    expect(scoreHealthCheck(all(5)).overall_band).toBe("Strong");
    expect(scoreHealthCheck(all(1)).overall_pct).toBe(20);
    expect(scoreHealthCheck(all(1)).overall_band).toBe("Critical");
  });

  it("don't know scores as 1 and is counted", () => {
    const answers = all(5).map((a) => (a.question_key === "q9" ? { ...a, value: null, dont_know: true } : a));
    const r = scoreHealthCheck(answers);
    const sales = r.areas.find((a) => a.area_key === "sales")!;
    expect(sales.score_pct).toBeCloseTo(((5 * 5 + 1) / 30) * 100, 1); // 86.7
    expect(sales.dont_know).toBe(1);
  });

  it("suggests the three lowest areas and always offers sales under 80%", () => {
    const answers = all(5).map((a) => {
      const q = HEALTH_QUESTIONS.find((x) => x.key === a.question_key)!;
      if (q.area === "risk") return { ...a, value: 1 };
      if (q.area === "finance") return { ...a, value: 2 };
      if (q.area === "operations") return { ...a, value: 3 };
      if (q.area === "sales") return { ...a, value: 3 }; // 60%, under 80
      return a;
    });
    const r = scoreHealthCheck(answers);
    expect(r.suggested.map((s) => s.area_key)).toEqual(["risk", "finance", "sales"]);
    expect(r.suggested[0].triggers).toHaveLength(3);
    expect(r.complete).toBe(true);
  });

  it("partial answers are not complete and score only what was answered", () => {
    const r = scoreHealthCheck(all(4).slice(0, 6));
    expect(r.complete).toBe(false);
    expect(r.areas.find((a) => a.area_key === "strategy")!.score_pct).toBe(80);
    expect(r.areas.find((a) => a.area_key === "sales")!.answered).toBe(0);
  });
});
