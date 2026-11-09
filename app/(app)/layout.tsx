import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/sign-in/actions";
import { NavLinks } from "./nav";
import { logoUrl } from "@/lib/logo";
import { supabaseServer } from "@/lib/supabase/server";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const SUB: Record<string, string> = { trial: "Trial", active: "Active", past_due: "Payment due", cancelled: "Cancelled", expired: "Expired" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession().catch(() => null);
  if (!s) redirect("/sign-in");
  const meta = [s.role && ROLE[s.role], s.subscriptionStatus && SUB[s.subscriptionStatus]].filter(Boolean).join(", ");
  let company: { name: string; logo_path: string | null } | null = null;
  if (s.companyId) {
    const supabase = await supabaseServer();
    company = (await supabase.from("companies").select("name, logo_path").eq("id", s.companyId).maybeSingle()).data;
  }
  const logo = logoUrl(company?.logo_path);
  return (
    <div className="shell">
      <nav className="side" aria-label="Workspaces">
        <div className="brand"><i aria-hidden /> Enablement OS</div>
        {company && (
          <div className="company">
            {logo ? <img src={logo} alt="" width={40} height={40} /> : <span className="mono" aria-hidden>{company.name.trim().charAt(0).toUpperCase()}</span>}
            <span>{company.name}</span>
          </div>
        )}
        <div className="co"><b>{s.email}</b>{meta ? <><br />{meta}</> : null}</div>
        <NavLinks />
        <div className="spacer" />
        <form action={signOut}><button className="btn ghost" type="submit">Sign out</button></form>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
