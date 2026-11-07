/** KPI library v1 — ORIGINAL content for Enablement OS. Perspectives are plain-language groups. */
export type KpiDef = { key: string; name: string; unit: "R" | "%" | "count" | "days"; direction: "higher_better" | "lower_better"; perspective: "financial" | "customer" | "internal" | "people"; area: string };

export const KPI_LIBRARY: KpiDef[] = [
  { key: "revenue", name: "Monthly revenue", unit: "R", direction: "higher_better", perspective: "financial", area: "finance" },
  { key: "new_contract_value", name: "New contract value", unit: "R", direction: "higher_better", perspective: "financial", area: "sales" },
  { key: "gross_margin", name: "Gross margin", unit: "%", direction: "higher_better", perspective: "financial", area: "finance" },
  { key: "debtor_days", name: "Debtor days", unit: "days", direction: "lower_better", perspective: "financial", area: "finance" },
  { key: "cash_forecast_accuracy", name: "Weeks cash forecast within 10%", unit: "count", direction: "higher_better", perspective: "financial", area: "finance" },
  { key: "proposals_issued", name: "Proposals issued", unit: "count", direction: "higher_better", perspective: "customer", area: "sales" },
  { key: "deals_closed", name: "Deals closed", unit: "count", direction: "higher_better", perspective: "customer", area: "sales" },
  { key: "deals_without_owner", name: "Deals closed without the owner", unit: "count", direction: "higher_better", perspective: "customer", area: "sales" },
  { key: "qualified_pipeline", name: "Qualified pipeline value", unit: "R", direction: "higher_better", perspective: "customer", area: "sales" },
  { key: "conversion_rate", name: "First meeting to close conversion", unit: "%", direction: "higher_better", perspective: "customer", area: "sales" },
  { key: "repeat_business", name: "Revenue from repeat customers", unit: "%", direction: "higher_better", perspective: "customer", area: "customers" },
  { key: "top_customer_share", name: "Largest customer share of revenue", unit: "%", direction: "lower_better", perspective: "customer", area: "customers" },
  { key: "on_time_delivery", name: "On-time delivery", unit: "%", direction: "higher_better", perspective: "internal", area: "operations" },
  { key: "risks_owned", name: "Risks with owner and mitigation", unit: "count", direction: "higher_better", perspective: "internal", area: "risk" },
  { key: "issues_closed", name: "Issues closed within 30 days", unit: "%", direction: "higher_better", perspective: "internal", area: "operations" },
  { key: "staff_turnover", name: "Staff turnover (annualised)", unit: "%", direction: "lower_better", perspective: "people", area: "people" },
  { key: "roles_documented", name: "Roles with written accountabilities", unit: "%", direction: "higher_better", perspective: "people", area: "people" },
  { key: "leadership_meetings", name: "Leadership meetings held", unit: "count", direction: "higher_better", perspective: "people", area: "leadership" },
];

export const PERSPECTIVE_LABEL: Record<KpiDef["perspective"], string> = { financial: "Money", customer: "Customers and sales", internal: "How we run", people: "People" };
