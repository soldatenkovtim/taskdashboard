import { configured, supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured()) return <Dashboard setup />;
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/auth");
  return <Dashboard />;
}
