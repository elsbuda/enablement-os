import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/sign-in/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession().catch(() => null);
  if (!s) redirect("/sign-in");
  return (
    <div className="shell">
      <nav className="side" aria-label="Workspaces">
        <div className="brand">Enablement OS</div>
        <div className="co">{s.email}{s.role ? ` · ${s.role}` : ""}{s.subscriptionStatus ? ` · ${s.subscriptionStatus}` : ""}</div>
        <div className="grp">Workspaces</div>
        <Link href="/home">Home</Link>
        <Link href="/health-check">Business Health Check</Link>
        <Link href="/health-check/results">Health Check results</Link>
        <Link href="/plan">Strategy and Growth Plan</Link>
        <Link href="/execution">90 Day Execution</Link>
        <Link href="/execution/checkin">Weekly check-in</Link>
        <Link href="/scorecard">CEO Scorecard</Link>
        <div className="grp">Account</div>
        <Link href="/setup">Company context</Link>
        <form action={signOut}><button className="btn ghost" type="submit" style={{ marginTop: 8 }}>Sign out</button></form>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
