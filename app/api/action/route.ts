import { supabase, configured } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
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
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const { data, error } = await db.rpc("task_action", {
    action: body.action,
    payload: body.payload ?? {},
  });
  return NextResponse.json(
    error ? { error: error.message } : { result: data },
    { status: error ? 400 : 200 },
  );
}
