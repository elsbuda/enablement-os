/**
 * Declarative rules runner. Tool definitions carry an array of rules; the
 * engine executes only these operations. No expressions, no eval, no code
 * from uploaded files. Anything else is rejected at load time (and by the
 * database check constraint `templates_rules_allowed`).
 */
export type Band = { from: number; to: number; label: string; advice?: string };

export type Rule =
  | { op: "sum" | "avg" | "min" | "max"; over: string; as: string; group_by?: string; ignore_null?: boolean }
  | { op: "count_if"; over: string; equals: string | number | boolean; as: string }
  | { op: "band"; field: string; bands: Band[] | "interpretation"; as: string }
  | { op: "diff"; a: string; b: string; as: string }
  | { op: "ratio"; a: string; b: string; as: string; pct?: boolean }
  | { op: "map"; field: string; mapping: Record<string, string | number>; as: string };

export const ALLOWED_OPS = ["sum", "avg", "min", "max", "count_if", "band", "diff", "ratio", "map"] as const;

export type Doc = Record<string, unknown>;

/** Resolve a dotted path with optional [*] wildcards into a flat list of values. */
export function resolvePath(doc: unknown, path: string): unknown[] {
  const parts = path.replace(/\[\*\]/g, ".*").split(".").filter(Boolean);
  let current: unknown[] = [doc];
  for (const part of parts) {
    const next: unknown[] = [];
    for (const c of current) {
      if (c == null) continue;
      if (part === "*") {
        if (Array.isArray(c)) next.push(...c);
      } else if (typeof c === "object") {
        next.push((c as Record<string, unknown>)[part]);
      }
    }
    current = next;
  }
  return current;
}

function numbers(values: unknown[], ignoreNull: boolean): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v == null) { if (ignoreNull) continue; else return []; }
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const agg = {
  sum: (xs: number[]) => xs.reduce((a, b) => a + b, 0),
  avg: (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null),
  min: (xs: number[]) => (xs.length ? Math.min(...xs) : null),
  max: (xs: number[]) => (xs.length ? Math.max(...xs) : null),
};

export function bandFor(value: number | null, bands: Band[]): string | null {
  if (value == null) return null;
  const b = bands.find((x) => value >= x.from && value <= x.to);
  return b ? b.label : null;
}

function setPath(doc: Doc, path: string, value: unknown) {
  const parts = path.split(".");
  let cur: Record<string, unknown> = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== "object" || cur[k] == null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function validateRules(rules: unknown): rules is Rule[] {
  if (!Array.isArray(rules)) return false;
  return rules.every((r) => r && typeof r === "object" && (ALLOWED_OPS as readonly string[]).includes((r as Rule).op));
}

/**
 * Run rules in order against `input`, writing results into a fresh `output`
 * object. Group-by aggregations write an array under `as` with one entry
 * per group item (e.g. one score per priority).
 */
export function runRules(rules: Rule[], input: Doc, interpretation: Band[] = []): Doc {
  if (!validateRules(rules)) throw new Error("rules contain a non-allowed operation");
  const output: Doc = {};
  const scope = () => ({ ...input, ...output });

  for (const r of rules) {
    switch (r.op) {
      case "sum": case "avg": case "min": case "max": {
        if (r.group_by) {
          const groups = resolvePath(input, r.group_by).flatMap((g) => (Array.isArray(g) ? g : [g]));
          const rest = r.over.startsWith(r.group_by + "[*].") ? r.over.slice(r.group_by.length + 4) : r.over;
          const results = groups.map((g, i) => ({ index: i, value: agg[r.op](numbers(resolvePath(g, rest), r.ignore_null ?? true)) }));
          setPath(output, r.as, results);
        } else {
          setPath(output, r.as, agg[r.op](numbers(resolvePath(scope(), r.over), r.ignore_null ?? true)));
        }
        break;
      }
      case "count_if": {
        const vals = resolvePath(scope(), r.over);
        setPath(output, r.as, vals.filter((v) => v === r.equals).length);
        break;
      }
      case "band": {
        const bands = r.bands === "interpretation" ? interpretation : r.bands;
        const target = resolvePath(scope(), r.field);
        if (r.field.endsWith("[*].value") || r.field.includes("[*]")) {
          // band each item of a grouped result
          const listPath = r.field.split("[*]")[0];
          const list = resolvePath(scope(), listPath)[0] as Array<Record<string, unknown>> | undefined;
          setPath(output, r.as, (list ?? []).map((item) => bandFor(item.value as number | null, bands)));
        } else {
          setPath(output, r.as, bandFor(target[0] as number | null, bands));
        }
        break;
      }
      case "diff": {
        const [a] = numbers(resolvePath(scope(), r.a), false); const [b] = numbers(resolvePath(scope(), r.b), false);
        setPath(output, r.as, a != null && b != null ? a - b : null);
        break;
      }
      case "ratio": {
        const [a] = numbers(resolvePath(scope(), r.a), false); const [b] = numbers(resolvePath(scope(), r.b), false);
        const v = a != null && b ? a / b : null;
        setPath(output, r.as, v == null ? null : r.pct ? v * 100 : v);
        break;
      }
      case "map": {
        const [v] = resolvePath(scope(), r.field);
        setPath(output, r.as, v == null ? null : r.mapping[String(v)] ?? null);
        break;
      }
    }
  }
  return output;
}
