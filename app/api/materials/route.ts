import { NextRequest, NextResponse } from "next/server";
import { configured, supabase } from "@/lib/supabase";
import { MATERIAL_BUCKET, validMaterialUrl } from "@/lib/materials";

async function client() {
  if (!configured()) return null;
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .single();
  return profile?.access_status === "active" ? { db, user } : null;
}
const failure = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });
export async function GET(req: NextRequest) {
  const session = await client();
  if (!session)
    return failure("Подключите базу и войдите в активный аккаунт", 401);
  const { db, user } = session;
  const task = req.nextUrl.searchParams.get("task");
  const page = Math.min(
    100000,
    Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("page"))) || 0),
  );
  let query = db
    .from("project_materials")
    .select(
      "id,project_id,task_id,title,description,kind,url,file_name,uploaded_by,author_name,ready,published_at,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 50, page * 50 + 49);
  if (task) query = query.eq("task_id", task);
  else query = query.eq("ready", true).not("published_at", "is", null);
  const project = req.nextUrl.searchParams.get("project");
  if (project) query = query.eq("project_id", project);
  const search = req.nextUrl.searchParams.get("q")?.trim();
  if (search) {
    const pattern = `%${search.replace(/[^\p{L}\p{N} .-]/gu, " ")}%`;
    query = query.or(
      `title.ilike.${pattern},description.ilike.${pattern},file_name.ilike.${pattern}`,
    );
  }
  const [materials, projects] = await Promise.all([
    query,
    db.from("file_projects").select("id,name").order("name").limit(1000),
  ]);
  if (materials.error || projects.error)
    return failure(
      "Не удалось загрузить хранилище. Проверьте подключение и миграцию 009.",
      503,
    );
  const pending =
    !task && page === 0 && !project && !search
      ? await db
          .from("project_materials")
          .select(
            "id,project_id,task_id,title,description,kind,url,file_name,uploaded_by,author_name,ready,published_at,created_at",
          )
          .eq("uploaded_by", user.id)
          .is("task_id", null)
          .eq("ready", false)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: [] };
  return NextResponse.json(
    {
      materials: [...(pending.data ?? []), ...(materials.data ?? [])],
      projects: projects.data,
      total: materials.count,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return failure("Недопустимый источник запроса", 403);
  const session = await client();
  if (!session) return failure("Нет доступа", 401);
  const { db } = session;
  let body;
  try {
    body = await req.json();
  } catch {
    return failure("Некорректный запрос");
  }
  const { action, payload = {} } = body ?? {};
  if (action === "download") {
    const { data: material } = await db
      .from("project_materials")
      .select("object_path,file_name,ready")
      .eq("id", payload.id)
      .single();
    if (!material?.ready || !material.object_path)
      return failure("Файл недоступен", 404);
    const { data, error } = await db.storage
      .from(MATERIAL_BUCKET)
      .createSignedUrl(material.object_path, 60, {
        download: material.file_name,
      });
    return error
      ? failure("Не удалось открыть файл")
      : NextResponse.json({ url: data.signedUrl });
  }
  if (action === "comments") {
    const { data, error } = await db
      .from("material_comments")
      .select("id,material_id,author_name,content,created_at")
      .eq("material_id", payload.id)
      .order("created_at")
      .limit(500);
    return error
      ? failure("Не удалось загрузить комментарии")
      : NextResponse.json({ comments: data });
  }
  if (!["add", "finalize", "project", "comment"].includes(action))
    return failure("Неизвестная операция");
  if (
    action === "add" &&
    payload.kind === "link" &&
    !validMaterialUrl(payload.url)
  )
    return failure("Укажите корректную http/https ссылку");
  const { data, error } = await db.rpc("material_action", { action, payload });
  return error ? failure(error.message) : NextResponse.json(data);
}
