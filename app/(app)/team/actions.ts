"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, supabaseServer } from "@/lib/supabase/server";

function back(msg?: string, key: "error" | "saved" = "error"): never {
  redirect(`/team${msg ? `?${key}=${encodeURIComponent(msg)}` : ""}`);
}
async function adminCtx() {
  const s = await getSession();
  if (!s?.companyId) redirect("/setup");
  if (s.role !== "owner" && s.role !== "admin") back("Only the owner or an admin can manage the team.");
  return { s, supabase: await supabaseServer(), companyId: s.companyId };
}

const InviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(120), role: z.enum(["admin", "editor", "viewer"]) });

export async function invite(form: FormData) {
  const { s, supabase, companyId } = await adminCtx();
  const parsed = InviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) back("Enter a valid email and pick a role.");
  const d = parsed.data;
  if (d.email === s.email.toLowerCase()) back("That is your own email.");
  const { data: existing } = await supabase.from("users").select("id").eq("email", d.email).maybeSingle();
  if (existing) {
    const { data: m } = await supabase.from("memberships").select("id").eq("user_id", existing.id).eq("company_id", companyId).not("accepted_at", "is", null).maybeSingle();
    if (m) back("That person is already a member.");
  }
  // Seat check up front so the admin is not surprised at acceptance time (viewers do not use a seat).
  if (d.role !== "viewer") {
    const [{ data: sub }, { count }] = await Promise.all([
      supabase.from("subscriptions").select("seats").eq("company_id", companyId).maybeSingle(),
      supabase.from("memberships").select("id", { count: "exact", head: true }).eq("company_id", companyId).not("accepted_at", "is", null).neq("role", "viewer"),
    ]);
    if (sub && (count ?? 0) >= sub.seats) back(`All ${sub.seats} seats are in use. Invite as a viewer, remove a member, or upgrade the package.`);
  }
  // Withdraw any older open invitation to the same email, then create a fresh one.
  await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("company_id", companyId).eq("email", d.email).is("accepted_at", null).is("revoked_at", null);
  const { error } = await supabase.from("invitations").insert({ company_id: companyId, email: d.email, role: d.role, invited_by: s.userId });
  if (error) back(error.message);
  back(`Invitation created for ${d.email}. Copy the link below and send it to them.`, "saved");
}

export async function revokeInvitation(form: FormData) {
  const { supabase, companyId } = await adminCtx();
  const { error } = await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", String(form.get("id"))).eq("company_id", companyId);
  if (error) back(error.message);
  back("Invitation withdrawn.", "saved");
}

export async function changeRole(form: FormData) {
  const { supabase, companyId } = await adminCtx();
  const role = String(form.get("role"));
  if (!["admin", "editor", "viewer"].includes(role)) back("Unknown role.");
  const { error } = await supabase.from("memberships").update({ role }).eq("user_id", String(form.get("user_id"))).eq("company_id", companyId);
  if (error) back(error.message.includes("seat limit") ? "No seat available for that role. Viewers do not use a seat." : error.message);
  back("Role updated.", "saved");
}

export async function removeMember(form: FormData) {
  const { supabase, companyId } = await adminCtx();
  const { error } = await supabase.from("memberships").delete().eq("user_id", String(form.get("user_id"))).eq("company_id", companyId);
  if (error) back(error.message);
  back("Member removed. Their past actions and targets stay in history under their name.", "saved");
}

/** Called from the invite page or the setup page by the invitee. */
export async function acceptInvitation(form: FormData) {
  const s = await getSession();
  const token = String(form.get("token") ?? "");
  if (!s) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
  redirect("/home?joined=1");
}
