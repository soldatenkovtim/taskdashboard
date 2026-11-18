import { NextRequest, NextResponse } from "next/server";
import { configured, supabase } from "@/lib/supabase";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Недопустимый источник" },
      { status: 403 },
    );
  if (!configured())
    return NextResponse.json(
      { error: "Supabase не подключён" },
      { status: 503 },
    );
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const { data, error } = await db.rpc("record_visit");
  return NextResponse.json(
    error ? { error: "Не удалось учесть посещение" } : data,
    { status: error ? 400 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
