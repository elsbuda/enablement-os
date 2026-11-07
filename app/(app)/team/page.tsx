import { headers } from "next/headers";
import { getSession, supabaseServer } from "@/lib/supabase/server";
import { loadMembers, memberName } from "@/lib/data/plan";
import { changeRole, invite, removeMember, revokeInvitation } from "./actions";

const ROLE_HELP: Record<string, string> = {
  owner: "Billing, users, everything.", admin: "All content and invites.", editor: "Edit plans, actions and actuals.", viewer: "Read and export only; does not use a seat.",
};

export default async function Team({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const s = (await getSession())!;
  if (!s.companyId) return <p>Set up your company first: <a href="/setup">Company context</a>.</p>;
  const isAdmin = s.role === "owner" || s.role === "admin";
  const supabase = await supabaseServer();
  const [members, { data: sub }, { data: invites }] = await Promise.all([
    loadMembers(s.companyId),
    supabase.from("subscriptions").select("package, seats, status").eq("company_id", s.companyId).maybeSingle(),
    isAdmin ? supabase.from("invitations").select("id, email, role, token, created_at, expires_at").eq("company_id", s.companyId).is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const seatsUsed = members.filter((m) => m.role !== "viewer").length;

  return (
    <>
      <h1>Team</h1>
      <p className="sub">{sub ? `${sub.package.toUpperCase()} package · ${seatsUsed} of ${sub.seats} seats in use` : ""}. Viewers do not use a seat.</p>
      {sp.error && <div className="error">{sp.error}</div>}
      {sp.saved && <div className="card" style={{ marginBottom: 14 }}>{sp.saved}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Members</h2>
        <div className="tw"><table>
          <thead><tr><th>Person</th><th>Email</th><th>Role</th>{isAdmin && <th>Change</th>}</tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.user_id}>
              <td>{memberName(m)}{m.user_id === s.userId ? " (you)" : ""}</td>
              <td>{m.email}</td>
              <td><span className={`pill ${m.role === "owner" ? "n" : ""}`}>{m.role}</span> <span className="kv">{ROLE_HELP[m.role]}</span></td>
              {isAdmin && <td>{m.role === "owner" || m.user_id === s.userId ? <span className="kv">—</span> : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <form action={changeRole} style={{ display: "flex", gap: 4 }}>
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <select name="role" defaultValue={m.role}><option value="admin">admin</option><option value="editor">editor</option><option value="viewer">viewer</option></select>
                    <button className="btn ghost" type="submit" style={{ padding: "3px 8px", fontSize: 12 }}>Set</button>
                  </form>
                  <form action={removeMember}><input type="hidden" name="user_id" value={m.user_id} /><button className="btn ghost" type="submit" style={{ padding: "3px 8px", fontSize: 12 }}>Remove</button></form>
                </div>
              )}</td>}
            </tr>))}
          </tbody>
        </table></div>
      </div>

      {isAdmin && (
        <>
          <form action={invite} className="card" style={{ marginBottom: 14 }}>
            <h2>Invite someone</h2>
            <div className="form">
              <div><label htmlFor="inv-email">Work email</label><input id="inv-email" name="email" type="email" required maxLength={120} /></div>
              <div><label htmlFor="inv-role">Role</label><select id="inv-role" name="role" defaultValue="editor"><option value="admin">admin — all content and invites</option><option value="editor">editor — edit plans, actions, actuals</option><option value="viewer">viewer — read only, no seat</option></select></div>
              <div style={{ alignSelf: "end" }}><button className="btn" type="submit">Create invitation</button></div>
            </div>
            <p className="note">You get a link to send by email or WhatsApp. The person signs in or creates an account with that exact email, and the link adds them to this workspace with the role you chose. Links expire after 14 days.</p>
          </form>

          {invites && invites.length > 0 && (
            <div className="card">
              <h2>Pending invitations</h2>
              <div className="tw"><table>
                <thead><tr><th>Email</th><th>Role</th><th>Link to send</th><th>Expires</th><th></th></tr></thead>
                <tbody>{invites.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td><td>{i.role}</td>
                    <td><input readOnly value={`${origin}/invite/${i.token}`} style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }} /></td>
                    <td className="kv">{new Date(i.expires_at).toLocaleDateString("en-ZA")}</td>
                    <td><form action={revokeInvitation}><input type="hidden" name="id" value={i.id} /><button className="btn ghost" type="submit" style={{ padding: "3px 8px", fontSize: 12 }}>Withdraw</button></form></td>
                  </tr>))}
                </tbody>
              </table></div>
              <p className="note">Select the link text and copy it. Email sending from the app is not set up yet; that comes with the proper sender before pilots.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
