/**
 * Business Health Check v1 — ORIGINAL content written for Enablement OS.
 * Statements tagged T are restated from fields in inspected Aurelien templates
 * (balanced scorecard, OKR, implementation roadmap, risk and issue log, RACI);
 * statements tagged O are original. Source references are recorded for provenance.
 * permission_status is 'original' for the question set as a whole; the T tags are
 * kept so that, if the licence review requires it, those statements can be reworded.
 */
export type HealthArea = { key: string; title: string; plain: string };
export type HealthQuestion = { key: string; area: string; text: string; tag: "O" | "T" };

export const HEALTH_AREAS: HealthArea[] = [
  { key: "strategy", title: "Strategy and direction", plain: "Do you know where the business is going, and does everyone else?" },
  { key: "sales", title: "Sales and pipeline", plain: "Is new business predictable, or does it depend on you?" },
  { key: "customers", title: "Customers and market", plain: "Do you know who buys, why, and who else they could buy from?" },
  { key: "finance", title: "Finance and cash", plain: "Can you see cash and margin before they become a problem?" },
  { key: "operations", title: "Operations and delivery", plain: "Does the business deliver without heroics?" },
  { key: "people", title: "People and roles", plain: "Does everyone know their job and how it is judged?" },
  { key: "leadership", title: "Leadership and governance", plain: "Are you working on the business, with a rhythm and a record?" },
  { key: "risk", title: "Risk and resilience", plain: "Could you survive a bad month, a lost supplier or a lost laptop?" },
];

const q = (n: number, area: string, text: string, tag: "O" | "T"): HealthQuestion => ({ key: `q${n}`, area, text, tag });

export const HEALTH_QUESTIONS: HealthQuestion[] = [
  q(1, "strategy", "We can state in one sentence what the business will look like in three years", "O"),
  q(2, "strategy", "We have written down three to five priorities for this year", "T"),
  q(3, "strategy", "Every senior person can name those priorities without looking them up", "O"),
  q(4, "strategy", "We know which customers and products we deliberately do not pursue", "O"),
  q(5, "strategy", "Each priority has a measurable target and a named owner", "T"),
  q(6, "strategy", "We review progress against the plan at least quarterly", "T"),
  q(7, "sales", "We know our monthly revenue target and where we stand against it every week", "O"),
  q(8, "sales", "Every open opportunity is written down with a value, stage and next step", "O"),
  q(9, "sales", "We know our conversion rate from first meeting to closed deal", "O"),
  q(10, "sales", "New business does not depend on the owner personally selling", "O"),
  q(11, "sales", "We follow a defined sales process with stages everyone uses the same way", "O"),
  q(12, "sales", "We have enough qualified pipeline to hit next quarter's target", "O"),
  q(13, "customers", "We can name our three most profitable customer types", "T"),
  q(14, "customers", "We know why customers choose us over the alternatives, in their words", "O"),
  q(15, "customers", "No single customer is more than 25% of our revenue", "O"),
  q(16, "customers", "We measure customer satisfaction or repeat business in some regular way", "T"),
  q(17, "customers", "We know who our main competitors are and how our prices compare", "O"),
  q(18, "customers", "We have a clear offer we can explain to a new prospect in two minutes", "O"),
  q(19, "finance", "We see a cash flow forecast for at least the next 13 weeks", "O"),
  q(20, "finance", "We know our gross margin by product or service line", "T"),
  q(21, "finance", "Management accounts are available within 15 days of month end", "O"),
  q(22, "finance", "We know our break-even monthly revenue", "O"),
  q(23, "finance", "Debtors are collected on average within our agreed terms", "O"),
  q(24, "finance", "We have a budget for the year and compare actuals to it monthly", "T"),
  q(25, "operations", "Our core delivery process is documented well enough for a new person to follow", "O"),
  q(26, "operations", "We deliver on time and to spec in most cases and we measure it", "T"),
  q(27, "operations", "We know our cost to deliver one unit of our main product or service", "O"),
  q(28, "operations", "Key suppliers have agreed terms and a backup option", "O"),
  q(29, "operations", "Our systems (accounting, CRM, job tracking) hold the data we need without manual re-typing", "O"),
  q(30, "operations", "Problems in delivery are logged and fixed at the root, not just patched", "T"),
  q(31, "people", "Every person has a written role with the results they are accountable for", "T"),
  q(32, "people", "We know who would step up if a key person left tomorrow", "O"),
  q(33, "people", "Performance is reviewed against agreed goals at least twice a year", "T"),
  q(34, "people", "We can hire for a role within 60 days when we need to", "O"),
  q(35, "people", "Staff turnover in the past year was at a level we are comfortable with", "O"),
  q(36, "people", "People get the training they need to do their jobs well", "T"),
  q(37, "leadership", "The owner spends most of the week on the business, not in it", "O"),
  q(38, "leadership", "There is a leadership team that meets on a fixed rhythm with an agenda", "O"),
  q(39, "leadership", "Decisions above a set value or risk follow an agreed approval route", "T"),
  q(40, "leadership", "We have an outside voice (board, advisor, mentor) who challenges us", "O"),
  q(41, "leadership", "Statutory and tax filings are up to date", "O"),
  q(42, "leadership", "Important decisions and their reasons are recorded somewhere", "O"),
  q(43, "risk", "We have listed the top risks to the business with their likelihood and impact", "T"),
  q(44, "risk", "Each major risk has a named owner and a mitigation action", "T"),
  q(45, "risk", "We could operate for a month if our main site, system or supplier failed", "O"),
  q(46, "risk", "Insurance cover was reviewed in the past 12 months", "O"),
  q(47, "risk", "Customer and company data is backed up and access is controlled", "O"),
  q(48, "risk", "Issues that arise are logged, prioritised and tracked to closure", "T"),
];

export const HEALTH_SCALE = [
  { value: 1, label: "Not true" },
  { value: 2, label: "Rarely true" },
  { value: 3, label: "Partly true" },
  { value: 4, label: "Mostly true" },
  { value: 5, label: "Fully true" },
] as const;

export const HEALTH_BANDS = [
  { from: 0, to: 39.99, label: "Critical", advice: "Fix the basics in this area before anything else." },
  { from: 40, to: 59.99, label: "Weak", advice: "A likely priority for the year." },
  { from: 60, to: 79.99, label: "Developing", advice: "Working, but not yet reliable." },
  { from: 80, to: 100, label: "Strong", advice: "Keep it; measure it on the scorecard." },
];

/** Template record as stored in `templates.body` (kind = health_check). */
export const HEALTH_CHECK_TEMPLATE = {
  tool_key: "health_check",
  version: 1,
  kind: "health_check",
  category: "core",
  title: "Business Health Check",
  permission_status: "original",
  publication_status: "published",
  body: {
    intro: "48 statements in 8 areas. Answer how true each one is today. Takes 60 to 90 minutes; you can pause and come back.",
    areas: HEALTH_AREAS,
    questions: HEALTH_QUESTIONS,
    scale: HEALTH_SCALE,
    dont_know_scores_as: 1,
    interpretation: HEALTH_BANDS,
    suggest: { count: 3, always_offer_area: "sales", always_offer_below_pct: 80, trigger_statements: 3 },
    rules: [],
  },
  source_references: [
    { file: "5. Balanced Scorecard - Additional templates.xlsx", sheet: "Balanced Scorecard (2)", cells: "A3:A12 (perspectives)", relationship: "informed_by" },
    { file: "2.1 Comprehensive Risk and Issue Logs and Dashboard - 3 level rating.xlsx", sheet: "Risk log", cells: "A2:M2 (fields)", relationship: "informed_by" },
    { file: "4b. Objectives and Key Results OKR.xlsx", sheet: "OKR - Template 1", cells: "A3:E7", relationship: "informed_by" },
  ],
} as const;
