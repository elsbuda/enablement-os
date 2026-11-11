import { signIn } from "./actions";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string; email?: string }> }) {
  const { error, next, sent, email } = await searchParams;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const signUpHref = `/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="auth">
      <div className="brand"><i aria-hidden /> Enablement OS</div>
      <h1>Sign in</h1>
      <p className="sub">Enablement OS helps owner-led businesses check their health, choose priorities, run 90-day plans and track results.</p>
      {!configured && <div className="error">Supabase is not configured. Copy .env.example to .env.local and fill in the project URL and anon key.</div>}
      {error && <div className="error">{error}{error.startsWith("Email or password") && <> <a href={signUpHref}>Create an account</a> if you are new.</>}</div>}
      {sent && <div className="ok">Confirmation email sent. Click the link in it, then sign in here.</div>}
      <form action={signIn} className="card">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email ?? ""} />
        <label htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
        <div className="actions">
          <button className="btn" type="submit" disabled={!configured}>Sign in</button>
        </div>
      </form>
      <p className="note">New company? <a href={signUpHref}>Create an account</a> and you become its owner. Passwords are handled by Supabase Auth; this app never stores them.</p>
    </div>
  );
}
