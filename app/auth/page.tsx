import AuthForm from "@/components/auth-form";
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      initialMode={params.mode === "update" ? "update" : "login"}
      callbackError={!!params.error}
    />
  );
}
