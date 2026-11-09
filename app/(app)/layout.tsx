import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/sign-in/actions";
import { NavLinks } from "./nav";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const SUB: Record<string, string> = { trial: "Trial", active: "Active", past_due: "Payment due", cancelled: "Cancelled", expired: "Expired" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession().catch(() => null);
  if (!s) redirect("/sign-in");
  const meta = [s.role && ROLE[s.role], s.subscriptionStatus && SUB[s.subscriptionStatus]].filter(Boolean).join(", ");
  return (
    <div className="shell">
      <nav className="side" aria-label="Workspaces">
        <div className="brand"><i aria-hidden /> Enablement OS</div>
        <div className="co"><b>{s.email}</b>{meta ? <><br />{meta}</> : null}</div>
        <NavLinks />
        <div className="spacer" />
        <form action={signOut}><button className="btn ghost" type="submit">Sign out</button></form>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
