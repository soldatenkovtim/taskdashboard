import { notFound, redirect } from "next/navigation";
import { configured, supabase } from "@/lib/supabase";
import { devPreviewEnabled } from "@/lib/dev-preview";
import ReactionGallery from "@/components/reaction-gallery";
export const dynamic = "force-dynamic";
export default async function ReactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  if (devPreviewEnabled() && params.preview === "admin")
    return <ReactionGallery />;
  if (!configured()) redirect("/auth");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/auth");
  const { data: profile, error } = await db
    .from("profiles")
    .select("role, access_status")
    .eq("id", user.id)
    .single();
  if (error || profile?.role !== "admin" || profile.access_status !== "active")
    notFound();
  return <ReactionGallery />;
}
