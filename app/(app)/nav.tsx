"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; step?: number; sub?: boolean };

// The four workspaces form a real sequence (check, plan, execute, measure), so they are numbered.
const WORKSPACES: Item[] = [
  { href: "/home", label: "Home" },
  { href: "/health-check", label: "Business Health Check", step: 1 },
  { href: "/health-check/results", label: "Results", sub: true },
  { href: "/plan", label: "Strategy and Growth Plan", step: 2 },
  { href: "/plan/review", label: "Quarterly review", sub: true },
  { href: "/execution", label: "90 Day Execution", step: 3 },
  { href: "/execution/checkin", label: "Weekly check-in", sub: true },
  { href: "/scorecard", label: "CEO Scorecard", step: 4 },
];
const ACCOUNT: Item[] = [
  { href: "/setup", label: "Company context" },
  { href: "/team", label: "Team" },
];

function isOn(path: string, href: string, all: Item[]) {
  if (path === href) return true;
  // Parent is "on" only when no more specific item matches.
  const deeper = all.some((i) => i.href !== href && i.href.startsWith(href + "/") && path.startsWith(i.href));
  return !deeper && path.startsWith(href + "/");
}

export function NavLinks() {
  const path = usePathname();
  const all = [...WORKSPACES, ...ACCOUNT];
  const render = (i: Item) => (
    <Link key={i.href} href={i.href} className={`${i.sub ? "sub " : ""}${isOn(path, i.href, all) ? "on" : ""}`.trim()} aria-current={isOn(path, i.href, all) ? "page" : undefined}>
      {i.step && <span className="step" aria-hidden>{i.step}</span>}
      {i.label}
    </Link>
  );
  return (
    <div className="links">
      <div className="grp">Workspaces</div>
      {WORKSPACES.map(render)}
      <div className="grp">Account</div>
      {ACCOUNT.map(render)}
    </div>
  );
}
