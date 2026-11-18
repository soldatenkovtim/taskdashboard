import { supabase, configured } from "@/lib/supabase";
import { NextResponse } from "next/server";
export async function GET() {
  if (!configured())
    return NextResponse.json(
      { error: "Supabase ещё не подключён" },
      { status: 503 },
    );
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error)
    return NextResponse.json(
      { error: "Не удалось загрузить профиль. Проверьте миграцию базы." },
      { status: 500 },
    );
  if (profile.access_status !== "active") return NextResponse.json({ profile });
  const sync = await db.rpc("sync_overdue");
  if (sync.error)
    return NextResponse.json({ error: sync.error.message }, { status: 400 });
  const { data, error: readError } = await db.rpc("workspace_data");
  if (readError)
    return NextResponse.json({ error: readError.message }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
