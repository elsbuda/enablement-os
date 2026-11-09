import { getSession, supabaseServer } from "@/lib/supabase/server";
import { saveCompanyContext } from "./actions";
import { acceptInvitation } from "@/app/(app)/team/actions";

const SECTORS = ["Engineering services", "Distribution", "IT and software", "Professional services", "Light manufacturing", "Other"];
const STAFF = ["10 to 25", "26 to 50", "51 to 100"];
const TURNOVER = ["R10m to R25m", "R25m to R60m", "R60m to R150m"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function Setup({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const s = (await getSession())!;
  let company: { name: string; sector: string | null; staff_band: string | null; turnover_band: string | null; financial_year_end: number | null } | null = null;
  let profile: { products: string[]; customer_types: string[]; sales_team_size: number | null } | null = null;
  if (s.companyId) {
    const supabase = await supabaseServer();
    const { data: c } = await supabase.from("companies").select("name, sector, staff_band, turnover_band, financial_year_end").eq("id", s.companyId).maybeSingle();
    company = c;
    const { data: p } = await supabase.from("company_profile").select("products, customer_types, sales_team_size").eq("company_id", s.companyId).order("version", { ascending: false }).limit(1).maybeSingle();
    profile = p;
  }
  const isNew = !s.companyId;
  let pending: { token: string; role: string; company_id: string; company_name?: string }[] = [];
  if (isNew) {
    const supabase = await supabaseServer();
    const { data: inv } = await supabase.from("invitations").select("token, role, company_id").is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString());
    for (const i of inv ?? []) {
      const { data: pv } = await supabase.rpc("invitation_preview", { p_token: i.token });
      pending.push({ ...i, company_name: (pv as { company_name: string }[] | null)?.[0]?.company_name });
    }
  }
  return (
    <>
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>You have been invited</h2>
          {pending.map((i) => (
            <form action={acceptInvitation} key={i.token} className="actions" style={{ marginTop: 8 }}>
              <input type="hidden" name="token" value={i.token} />
              <span>Join <strong>{i.company_name ?? "a company"}</strong> as {i.role}</span>
              <button className="btn" type="submit">Join</button>
            </form>
          ))}
          <p className="note">Or create your own company workspace below instead.</p>
        </div>
      )}
      <h1>{isNew ? "Create your company workspace" : `Company context: ${company?.name}`}</h1>
      <p className="sub">Entered once. Every workspace reads from this, so you never type it again. Each save keeps a dated version.</p>
      {error && <div className="error">{error}</div>}
      {saved && <div className="ok">Saved. <a href="/health-check">Start the Business Health Check</a>.</div>}
      <form action={saveCompanyContext} className="card">
        <div className="form">
          <div><label htmlFor="name">Company name</label><input id="name" name="name" required minLength={2} maxLength={120} defaultValue={company?.name ?? ""} readOnly={!isNew && s.role !== "owner" && s.role !== "admin"} /></div>
          <div><label htmlFor="sector">Sector</label><select id="sector" name="sector" defaultValue={company?.sector ?? SECTORS[0]}>{SECTORS.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label htmlFor="staff_band">Staff</label><select id="staff_band" name="staff_band" defaultValue={company?.staff_band ?? STAFF[1]}>{STAFF.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label htmlFor="turnover_band">Annual turnover</label><select id="turnover_band" name="turnover_band" defaultValue={company?.turnover_band ?? TURNOVER[1]}>{TURNOVER.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label htmlFor="fye">Financial year end</label><select id="fye" name="financial_year_end" defaultValue={String(company?.financial_year_end ?? 2)}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><label htmlFor="sales_team_size">Sales team size (people, excluding you)</label><input id="sales_team_size" name="sales_team_size" type="number" min={0} max={500} defaultValue={profile?.sales_team_size ?? 0} /></div>
          <div><label htmlFor="products">Main products or services (one per line)</label><textarea id="products" name="products" rows={3} defaultValue={(profile?.products ?? []).join("\n")} /></div>
          <div><label htmlFor="customer_types">Main customer types (one per line)</label><textarea id="customer_types" name="customer_types" rows={3} defaultValue={(profile?.customer_types ?? []).join("\n")} /></div>
        </div>
        <div className="actions"><button className="btn" type="submit">{isNew ? "Create workspace" : "Save new version"}</button></div>
      </form>
      {isNew && <p className="note">Creating the workspace starts a trial subscription on the BUILD package (3 seats). Payment is added in a later stage; nothing is charged here.</p>}
    </>
  );
}
