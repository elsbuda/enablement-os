"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

function creds(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  return { email, password, next: next.startsWith("/") ? next : "/" };
}

export async function signIn(form: FormData) {
  const { email, password, next } = creds(form);
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function signUp(form: FormData) {
  const { email, password } = creds(form);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  // Profile row (RLS: users_self_write). If email confirmation is on, there is no session yet.
  if (data.session && data.user) {
    await supabase.from("users").upsert({ id: data.user.id, email });
    redirect("/setup");
  }
  redirect("/sign-in?sent=1");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
