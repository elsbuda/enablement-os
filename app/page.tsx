import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";

export default async function Root() {
  const s = await getSession().catch(() => null);
  if (!s) redirect("/sign-in");
  if (!s.companyId) redirect("/setup");
  redirect("/home");
}
