import { NextRequest, NextResponse } from "next/server";
import { validAvatar } from "@/lib/avatars";
import { configured, supabase } from "@/lib/supabase";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Недопустимый источник запроса" },
      { status: 403 },
    );
  if (!configured())
    return NextResponse.json(
      { error: "Сначала подключите Supabase" },
      { status: 503 },
    );
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body && Object.hasOwn(body, "avatar_id")) {
    if (!validAvatar(body.avatar_id))
      return NextResponse.json(
        { error: "Выберите аватар из списка" },
        { status: 400 },
      );
    const { data, error } = await db.rpc("set_avatar", {
      selected_avatar: body.avatar_id,
    });
    return NextResponse.json(
      error
        ? {
            error:
              "Не удалось сохранить аватар. Проверьте подключение и миграцию 003.",
          }
        : { avatar_id: data },
      { status: error ? 400 : 200 },
    );
  }
  return NextResponse.json(
    { error: "Изменение этой настройки недоступно" },
    { status: 400 },
  );
}
