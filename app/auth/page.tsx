import { devPreviewEnabled } from "@/lib/dev-preview";
import { configured, supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const params = await searchParams;
  // Password recovery needs the authenticated session to set a new password.
  if (configured() && params.mode !== "update" && !params.error) {
    const db = await supabase();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) redirect("/workspace");
  }

  return (
    <AuthForm
      initialMode={
        params.mode === "update"
          ? "update"
          : params.mode === "signup"
            ? "signup"
            : "login"
      }
      available={configured()}
      previewEnabled={devPreviewEnabled()}
      callbackError={!!params.error}
    />
  );
}
