import { NextRequest, NextResponse } from "next/server";
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
  if (typeof body?.enabled !== "boolean")
    return NextResponse.json({ error: "Укажите ON или OFF" }, { status: 400 });
  const { data, error } = await db.rpc("set_playful_reactions", {
    enabled: body.enabled,
  });
  return NextResponse.json(
    error
      ? {
          error:
            "Не удалось сохранить настройку. Проверьте подключение и миграцию 002.",
        }
      : { enabled: data },
    { status: error ? 400 : 200 },
  );
}
