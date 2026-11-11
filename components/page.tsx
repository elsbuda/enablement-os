import type { ReactNode } from "react";

/* Page header following "street signs": the page name is exactly the words the person clicked,
   the breadcrumb says where it sits, the context line carries dates and counts, and the one
   primary action for this page sits at the right so it never has to be hunted for. */
export function PageHead({ title, crumb, context, action }: { title: string; crumb?: { href: string; label: string }[]; context?: ReactNode; action?: ReactNode }) {
  return (
    <header className="head">
      {crumb && crumb.length > 0 && (
        <nav className="crumb" aria-label="You are in">
          {crumb.map((c) => <span key={c.href}><a href={c.href}>{c.label}</a><span aria-hidden> › </span></span>)}
          <span aria-current="page">{title}</span>
        </nav>
      )}
      <div className="head-row">
        <div>
          <h1>{title}</h1>
          {context && <p className="ctx">{context}</p>}
        </div>
        {action && <div className="head-action">{action}</div>}
      </div>
    </header>
  );
}

/* Explanations stay one click away instead of sitting between the person and the task. */
export function Help({ title = "How this works", children }: { title?: string; children: ReactNode }) {
  return (
    <details className="help">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

/* Empty states are instructions: what this is, and the one thing to do now. */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className="actions" style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
