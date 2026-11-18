import { createClient } from "@supabase/supabase-js";
import { provisionAdmin } from "./provision-admin.mjs";
try {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw Error(
      "Задайте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SECRET_KEY в .env.admin.local.",
    );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await provisionAdmin(db, process.env);
  console.log(
    `Администратор готов: ${result.id}. Войдите на /auth с заданными email и паролем.`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Не удалось создать администратора.",
  );
  process.exitCode = 1;
}
