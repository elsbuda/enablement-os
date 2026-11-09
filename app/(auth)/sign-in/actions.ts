"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

function creds(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  return { email, password, next: next.startsWith("/") ? next : "/" };
}

// Plain-language messages for the Supabase error codes people actually hit.
function friendly(code: string | undefined, message: string) {
  switch (code) {
    case "invalid_credentials": return "Email or password is wrong. Check both and try again.";
    case "email_not_confirmed": return "This email has not been confirmed yet. Open the confirmation link we emailed you, or request a new one.";
    case "user_already_exists":
    case "email_exists": return "An account with this email already exists. Sign in instead.";
    case "weak_password": return "Choose a stronger password: at least 8 characters.";
    case "over_email_send_rate_limit": return "Too many emails were sent to this address recently. Wait a few minutes and try again.";
    case "email_address_not_authorized": return "Sign-up emails are not yet enabled for addresses outside the team. Ask the administrator to enable email sending.";
    default: return message;
  }
}

export async function signIn(form: FormData) {
  const { email, password, next } = creds(form);
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") redirect(`/sign-up?sent=1&email=${encodeURIComponent(email)}&error=${encodeURIComponent(friendly(error.code, error.message))}`);
    redirect(`/sign-in?error=${encodeURIComponent(friendly(error.code, error.message))}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function signUp(form: FormData) {
  const { email, password, next } = creds(form);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/sign-in?next=${encodeURIComponent(next)}` } });
  if (error) redirect(`/sign-up?error=${encodeURIComponent(friendly(error.code, error.message))}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  // Supabase returns a user with no identities when the email is already registered (anti-enumeration).
  if (data.user && data.user.identities?.length === 0) redirect(`/sign-in?error=${encodeURIComponent("An account with this email already exists. Sign in instead.")}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  // Profile row (RLS: users_self_write). If email confirmation is on, there is no session yet.
  if (data.session && data.user) {
    await supabase.from("users").upsert({ id: data.user.id, email });
    redirect(next === "/" ? "/setup" : next);
  }
  redirect(`/sign-up?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

export async function resendConfirmation(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/sign-up?error=" + encodeURIComponent("Enter your email first."));
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/sign-in` } });
  if (error) redirect(`/sign-up?sent=1&email=${encodeURIComponent(email)}&error=${encodeURIComponent(friendly(error.code, error.message))}`);
  redirect(`/sign-up?sent=1&email=${encodeURIComponent(email)}`);
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
