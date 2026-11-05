import { bandFor, type Band } from "./rules";
import { HEALTH_AREAS, HEALTH_QUESTIONS, HEALTH_BANDS, type HealthQuestion } from "../templates/health-check-v1";

export type Answer = { question_key: string; value: number | null; dont_know: boolean };
export type AreaScore = { area_key: string; title: string; score_pct: number; band: string; answered: number; of: number; dont_know: number };
export type SuggestedPriority = { area_key: string; title: string; score_pct: number; reason: string; triggers: { key: string; text: string; value: number }[] };
export type HealthResult = { overall_pct: number; overall_band: string; areas: AreaScore[]; suggested: SuggestedPriority[]; complete: boolean };

export type HealthConfig = {
  questions?: HealthQuestion[];
  areas?: typeof HEALTH_AREAS;
  bands?: Band[];
  dontKnowScoresAs?: number;
  suggestCount?: number;
  alwaysOfferArea?: string;
  alwaysOfferBelowPct?: number;
  triggerStatements?: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Score a set of answers. Area score = sum of answers / (5 x statements) as a
 * percentage; "Don't know" scores as 1. Overall = unweighted average of areas.
 * Suggested priorities = the lowest-scoring areas, with the sales area always
 * offered if it scores under the threshold.
 */
export function scoreHealthCheck(answers: Answer[], cfg: HealthConfig = {}): HealthResult {
  const questions = cfg.questions ?? HEALTH_QUESTIONS;
  const areas = cfg.areas ?? HEALTH_AREAS;
  const bands = cfg.bands ?? HEALTH_BANDS;
  const dk = cfg.dontKnowScoresAs ?? 1;
  const byKey = new Map(answers.map((a) => [a.question_key, a]));

  const effective = (qk: string): number | null => {
    const a = byKey.get(qk);
    if (!a) return null;
    if (a.dont_know) return dk;
    return a.value;
  };

  const areaScores: AreaScore[] = areas.map((area) => {
    const qs = questions.filter((q) => q.area === area.key);
    let sum = 0, answered = 0, dontKnow = 0;
    for (const q of qs) {
      const v = effective(q.key);
      if (v == null) continue;
      answered++; sum += v;
      if (byKey.get(q.key)?.dont_know) dontKnow++;
    }
    const pct = answered ? round1((sum / (answered * 5)) * 100) : 0;
    return { area_key: area.key, title: area.title, score_pct: pct, band: bandFor(pct, bands) ?? "", answered, of: qs.length, dont_know: dontKnow };
  });

  const complete = areaScores.every((a) => a.answered === a.of);
  const scored = areaScores.filter((a) => a.answered > 0);
  const overall = scored.length ? round1(scored.reduce((s, a) => s + a.score_pct, 0) / scored.length) : 0;

  // Suggestions
  const count = cfg.suggestCount ?? 3;
  const always = cfg.alwaysOfferArea ?? "sales";
  const alwaysBelow = cfg.alwaysOfferBelowPct ?? 80;
  const nTriggers = cfg.triggerStatements ?? 3;
  const sorted = [...scored].sort((a, b) => a.score_pct - b.score_pct);
  const picked: AreaScore[] = [];
  const alwaysArea = scored.find((a) => a.area_key === always);
  if (alwaysArea && alwaysArea.score_pct < alwaysBelow) picked.push(alwaysArea);
  for (const a of sorted) { if (picked.length >= count) break; if (!picked.includes(a)) picked.push(a); }
  picked.sort((a, b) => a.score_pct - b.score_pct);

  const suggested: SuggestedPriority[] = picked.map((a) => {
    const triggers = questions
      .filter((q) => q.area === a.area_key)
      .map((q) => ({ key: q.key, text: q.text, value: effective(q.key) ?? 0 }))
      .filter((t) => t.value > 0)
      .sort((x, y) => x.value - y.value)
      .slice(0, nTriggers);
    const reason = a.area_key === always && a.score_pct >= (sorted[count - 1]?.score_pct ?? 100)
      ? `Sales is always offered when it scores under ${alwaysBelow}%`
      : `One of the ${count} lowest-scoring areas`;
    return { area_key: a.area_key, title: a.title, score_pct: a.score_pct, reason, triggers };
  });

  return { overall_pct: overall, overall_band: bandFor(overall, bands) ?? "", areas: areaScores, suggested, complete };
}
