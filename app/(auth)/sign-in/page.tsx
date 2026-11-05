import { signIn, signUp } from "./actions";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string }> }) {
  const { error, next, sent } = await searchParams;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return (
    <div className="auth">
      <h1>Enablement OS</h1>
      <p className="sub">Sign in with your work email. New company? Create an account and you become its owner.</p>
      {!configured && <div className="error">Supabase is not configured. Copy .env.example to .env.local and fill in the project URL and anon key.</div>}
      {error && <div className="error">{error}</div>}
      {sent && <div className="card">Check your email to confirm your account, then sign in.</div>}
      <form action={signIn} className="card">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <label htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" />
        <div className="actions">
          <button className="btn" type="submit" disabled={!configured}>Sign in</button>
          <button className="btn ghost" formAction={signUp} type="submit" disabled={!configured}>Create account</button>
        </div>
      </form>
      <p className="note">Passwords are handled by Supabase Auth; this app never stores them.</p>
    </div>
  );
}
