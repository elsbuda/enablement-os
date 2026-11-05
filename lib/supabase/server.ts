import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  return v;
}

/** Per-request client that acts as the signed-in user (row-level security applies). */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* called from a Server Component; proxy.ts refreshes the session instead */ }
      },
    },
  });
}

/** Service-role client: bypasses RLS. Server only. Used by staff admin and webhooks. */
export function supabaseService() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SessionContext = {
  userId: string;
  email: string;
  companyId: string | null;
  role: "owner" | "admin" | "editor" | "viewer" | null;
  subscriptionStatus: string | null;
};

/** Who is signed in and which company they belong to (release 1: one company per user). */
export async function getSession(): Promise<SessionContext | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: m } = await supabase
    .from("memberships")
    .select("company_id, role")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle();
  let subscriptionStatus: string | null = null;
  if (m?.company_id) {
    const { data: s } = await supabase.from("subscriptions").select("status").eq("company_id", m.company_id).maybeSingle();
    subscriptionStatus = s?.status ?? null;
  }
  return {
    userId: user.id,
    email: user.email ?? "",
    companyId: m?.company_id ?? null,
    role: (m?.role as SessionContext["role"]) ?? null,
    subscriptionStatus,
  };
}
