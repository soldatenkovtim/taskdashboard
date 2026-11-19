import { notFound } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { previewData } from "@/lib/preview-data";
import { devPreviewEnabled } from "@/lib/dev-preview";
export const dynamic = "force-dynamic";
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; count?: string }>;
}) {
  if (!devPreviewEnabled()) notFound();
  const { role, count } = await searchParams;
  const size =
    count === "5" ? 5 : count === "15" ? 15 : count === "30" ? 30 : null;
  return (
    <Dashboard
      setup
      previewRole={role === "employee" ? "employee" : "admin"}
      previewData={
        size
          ? previewData(size, role === "employee" ? "employee" : "admin")
          : undefined
      }
    />
  );
}
