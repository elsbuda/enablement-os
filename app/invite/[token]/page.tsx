import { getSession, supabaseServer } from "@/lib/supabase/server";
import { acceptInvitation } from "@/app/(app)/team/actions";

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("invitation_preview", { p_token: token });
  const inv = (data as { company_name: string; role: string; email: string; expired: boolean; accepted: boolean; revoked: boolean }[] | null)?.[0];
  const s = await getSession().catch(() => null);

  return (
    <div className="auth">
      <h1>Enablement OS</h1>
      {!inv ? <div className="error">This invitation link is not valid.</div>
        : inv.revoked ? <div className="error">This invitation was withdrawn. Ask the person who invited you for a new link.</div>
        : inv.accepted ? <div className="card">This invitation has already been used. <a href="/sign-in">Sign in</a>.</div>
        : inv.expired ? <div className="error">This invitation expired. Ask for a new link.</div>
        : (
          <div className="card">
            <p style={{ marginTop: 0 }}>You have been invited to join <strong>{inv.company_name}</strong> as <strong>{inv.role}</strong>, using the email <strong>{inv.email}</strong>.</p>
            {error && <div className="error">{error}</div>}
            {!s ? (
              <>
                <p className="kv">Sign in with that email, or create an account with it, and you will come back here to accept.</p>
                <div className="actions"><a className="btn" href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in or create account</a></div>
              </>
            ) : s.email.toLowerCase() !== inv.email.toLowerCase() ? (
              <>
                <div className="error">You are signed in as {s.email}, but this invitation is for {inv.email}.</div>
                <div className="actions"><a className="btn ghost" href="/sign-in">Sign in with the other email</a></div>
              </>
            ) : s.companyId ? (
              <div className="error">You already belong to a company workspace. Release 1 allows one workspace per person.</div>
            ) : (
              <form action={acceptInvitation}><input type="hidden" name="token" value={token} /><div className="actions"><button className="btn" type="submit">Join {inv.company_name}</button></div></form>
            )}
          </div>
        )}
    </div>
  );
}
