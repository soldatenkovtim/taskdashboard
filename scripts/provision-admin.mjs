// Operator-only provisioning. Never imported by the application or public signup.
export async function provisionAdmin(db, env) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = env.ADMIN_NAME?.trim() || "Администратор";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("Укажите ADMIN_EMAIL.");
  if (name.length > 100) throw Error("ADMIN_NAME: не более 100 символов.");
  let user;
  if (env.ADMIN_USER_ID) {
    // Recovery/promoting an existing account requires its explicit immutable ID.
    const result = await db.auth.admin.getUserById(env.ADMIN_USER_ID);
    if (result.error || !result.data.user)
      throw Error("ADMIN_USER_ID не найден.");
    user = result.data.user;
    if (user.email?.toLowerCase() !== email || !user.email_confirmed_at)
      throw Error(
        "У существующего аккаунта должны совпадать ADMIN_EMAIL и подтверждённая почта.",
      );
  } else {
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12)
      throw Error("Задайте ADMIN_PASSWORD длиной минимум 12 символов.");
    // Check schema/credentials before creating an Auth user.
    const schema = await db.from("profiles").select("id").limit(1);
    if (schema.error)
      throw Error("Нет доступа к profiles: проверьте ключ и SQL-миграции.");
    const result = await db.auth.admin.createUser({
      email,
      password: env.ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name },
    });
    if (result.error || !result.data.user)
      throw Error(
        "Аккаунт не создан. Проверьте Auth и уникальность email. Для существующего подтверждённого аккаунта явно задайте ADMIN_USER_ID; его пароль не изменяется.",
      );
    user = result.data.user;
  }
  const result = await db
    .from("profiles")
    .update({ role: "admin", access_status: "active" })
    .eq("id", user.id)
    .select("id, role, access_status")
    .single();
  if (
    result.error ||
    result.data?.role !== "admin" ||
    result.data?.access_status !== "active"
  )
    throw Error(
      `Аккаунт существует, но роль не назначена. Проверьте миграции и повторите с ADMIN_USER_ID=${user.id}. Пароль повторно не задавайте.`,
    );
  return result.data;
}
