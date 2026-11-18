import { devPreviewEnabled } from "@/lib/dev-preview";
import { configured } from "@/lib/supabase";
import AuthForm from "@/components/auth-form";
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const params = await searchParams;
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
