import { signUp, resendConfirmation } from "@/app/(auth)/sign-in/actions";

export default async function SignUp({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string; email?: string }> }) {
  const { error, next, sent, email } = await searchParams;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return (
    <div className="auth">
      <div className="brand"><i aria-hidden /> Enablement OS</div>
      <h1>Create your account</h1>
      <p className="sub">You become the owner of a new company workspace. Joining a company that invited you? Use the link in your invitation instead.</p>
      {error && <div className="error">{error}</div>}
      {sent ? (
        <div className="card">
          <h2>Check your email</h2>
          <p>We sent a confirmation link to <strong>{email}</strong>. Click it, then sign in. Check the spam folder if it has not arrived within a few minutes.</p>
          <form action={resendConfirmation} className="actions">
            <input type="hidden" name="email" value={email ?? ""} />
            <button className="btn ghost" type="submit" disabled={!configured}>Send the email again</button>
            <a className="btn ghost" href="/sign-in">Go to sign in</a>
          </form>
        </div>
      ) : (
        <form action={signUp} className="card">
          <input type="hidden" name="next" value={next ?? "/"} />
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email ?? ""} />
          <label htmlFor="password" style={{ marginTop: 12 }}>Choose a password (at least 8 characters)</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <div className="actions">
            <button className="btn" type="submit" disabled={!configured}>Create account</button>
            <a className="btn ghost" href="/sign-in">I already have an account</a>
          </div>
        </form>
      )}
    </div>
  );
}
