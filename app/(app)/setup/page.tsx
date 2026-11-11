import { getSession, supabaseServer } from "@/lib/supabase/server";
import { saveCompanyContext, uploadLogo, removeLogo } from "./actions";
import { logoUrl } from "@/lib/logo";
import { acceptInvitation } from "@/app/(app)/team/actions";
import { PageHead, Help, Empty } from "@/components/page";

const SECTORS = ["Engineering services", "Distribution", "IT and software", "Professional services", "Light manufacturing", "Other"];
const STAFF = ["10 to 25", "26 to 50", "51 to 100"];
const TURNOVER = ["R10m to R25m", "R25m to R60m", "R60m to R150m"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function Setup({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const s = (await getSession())!;
  let company: { name: string; sector: string | null; staff_band: string | null; turnover_band: string | null; financial_year_end: number | null; logo_path: string | null } | null = null;
  let profile: { products: string[]; customer_types: string[]; sales_team_size: number | null } | null = null;
  if (s.companyId) {
    const supabase = await supabaseServer();
    const { data: c } = await supabase.from("companies").select("name, sector, staff_band, turnover_band, financial_year_end, logo_path").eq("id", s.companyId).maybeSingle();
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
      <PageHead title={isNew ? "Create your company workspace" : "Company context"} context={isNew ? "Two minutes. Every workspace reads from this." : `${company?.name} · entered once, every workspace reads from it`} />
      {error && <div className="error">{error}</div>}
      {saved === "logo" && <div className="ok">Logo updated. It now shows in the side panel and on reports.</div>}
      {saved === "logo-removed" && <div className="ok">Logo removed.</div>}
      {saved && saved !== "logo" && saved !== "logo-removed" && <div className="ok">Saved. <a href="/health-check">Start the Business Health Check</a>.</div>}
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
      {!isNew && (s.role === "owner" || s.role === "admin") && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Company logo</h2>
          <div className="logo-row">
            <div className="logo-preview">{company?.logo_path ? <img src={logoUrl(company.logo_path)!} alt={`${company.name} logo`} /> : <span className="kv">No logo yet</span>}</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <form action={uploadLogo}>
                <label htmlFor="logo">Upload a PNG, JPG, WebP or SVG, up to 1 MB. A square or wide logo on a transparent or white background works best.</label>
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" required />
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="btn" type="submit">{company?.logo_path ? "Replace logo" : "Upload logo"}</button>
                  {company?.logo_path && <button className="btn ghost" type="submit" formAction={removeLogo} formNoValidate>Remove logo</button>}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {isNew && <p className="note">This starts a free trial on the BUILD package (3 seats). Nothing is charged.</p>}
      {!isNew && <Help><p>Each save keeps a dated version, so you can see how the business description changed over time.</p></Help>}
    </>
  );
}
