import { notFound } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { devPreviewEnabled } from "@/lib/dev-preview";
export const dynamic = "force-dynamic";
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  if (!devPreviewEnabled()) notFound();
  const { role } = await searchParams;
  return (
    <Dashboard setup previewRole={role === "employee" ? "employee" : "admin"} />
  );
}
