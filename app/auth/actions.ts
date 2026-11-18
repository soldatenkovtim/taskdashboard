"use server";
import { supabase, configured } from "@/lib/supabase";
export async function authAction(mode: string, form: FormData) {
  if (!configured())
    return { error: "Сначала подключите Supabase в переменных окружения." };
  const db = await supabase();
  const email = String(form.get("email") ?? "").trim(),
    password = String(form.get("password") ?? "");
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site)
    return { error: "Не настроен адрес приложения NEXT_PUBLIC_SITE_URL." };
  if (mode === "logout") {
    await db.auth.signOut();
    return { redirect: "/auth" };
  }
  if (mode === "reset") {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: `${site}/auth/callback?next=/auth?mode=update`,
    });
    return error
      ? { error: "Не удалось отправить письмо. Повторите позже." }
      : {
          message:
            "Если аккаунт существует, письмо для восстановления отправлено.",
        };
  }
  if (mode === "signup" || mode === "update") {
    if (password.length < 8)
      return { error: "Пароль должен содержать минимум 8 символов." };
    if (password !== form.get("confirm"))
      return { error: "Пароли не совпадают." };
  }
  if (mode === "signup") {
    const name = String(form.get("name") ?? "").trim();
    if (!name || name.length > 100)
      return { error: "Укажите имя (до 100 символов)." };
    const { error } = await db.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: `${site}/auth/callback` },
    });
    return error
      ? {
          error:
            "Не удалось зарегистрироваться. Проверьте данные или попробуйте позже.",
        }
      : {
          message:
            "Проверьте почту и подтвердите email. Затем администратор предоставит доступ.",
        };
  }
  if (mode === "update") {
    const { error } = await db.auth.updateUser({ password });
    return error
      ? { error: "Ссылка истекла. Запросите восстановление ещё раз." }
      : { redirect: "/" };
  }
  const { error } = await db.auth.signInWithPassword({ email, password });
  return error
    ? {
        error:
          "Не удалось войти. Проверьте email, пароль и подтверждение почты.",
      }
    : { redirect: "/" };
}
