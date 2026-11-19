import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { validMaterialUrl } from "../lib/materials";
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001",
  employee = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
let project: string;
async function as(id: string) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function action(name: string, payload: Record<string, unknown>) {
  return (
    await db.query<{ v: any }>("select material_action($1,$2::jsonb) v", [
      name,
      JSON.stringify(payload),
    ])
  ).rows[0].v;
}
async function task() {
  await as(admin);
  return (
    await db.query<{ id: string }>(
      "insert into tasks(title,assignee_id,created_by,deadline,status) values('Задача',$1,$2,now()+interval '1 day','review') returning id",
      [employee, admin],
    )
  ).rows[0].id;
}
async function add(tid: string | null, kind = "link") {
  return action("add", {
    project_id: project,
    task_id: tid,
    kind,
    title: "Результат",
    url: "https://github.com/example/project",
    file_name: "report.docx",
  });
}
async function read(id: string) {
  return (
    await db.query<any>("select * from project_materials where id=$1", [id])
  ).rows[0];
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;`);
  await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/009_project_files.sql", "utf8"),
  );
  for (const id of [admin, employee, other])
    await db.query(
      "insert into auth.users(id,email) values($1,'test@example.com')",
      [id],
    );
  await db.exec("update profiles set access_status='active'");
  await db.query("update profiles set role='admin' where id=$1", [admin]);
  await as(admin);
  project = (await action("project", { name: "Проект" })).id;
});
after(() => db.close());
test("Материал ждёт принятия, возврат не публикует, done публикует атомарно", async () => {
  const tid = await task();
  await as(employee);
  const m = await add(tid);
  assert.equal((await read(m.id)).published_at, null);
  await db.query("update tasks set status='progress' where id=$1", [tid]);
  assert.equal((await read(m.id)).published_at, null);
  await db.query("update tasks set status='review' where id=$1", [tid]);
  await as(admin);
  const t = (
    await db.query<any>("select version from tasks where id=$1", [tid])
  ).rows[0];
  await db.query("select task_action('status',$1::jsonb)", [
    JSON.stringify({ id: tid, version: t.version, status: "done" }),
  ]);
  assert.ok((await read(m.id)).published_at);
});
test("RLS: чужие черновики и комментарии скрыты, опубликованные доступны команде", async () => {
  const tid = await task();
  await as(employee);
  const m = await add(tid);
  await action("comment", { id: m.id, content: "Пояснение" });
  await as(other);
  await db.exec("set role authenticated");
  try {
    assert.equal(
      (await db.query("select * from project_materials where id=$1", [m.id]))
        .rows.length,
      0,
    );
    await assert.rejects(
      action("comment", { id: m.id, content: "Чужое" }),
      /недоступен/,
    );
    await assert.rejects(add(tid), /недоступна/);
  } finally {
    await db.exec("reset role");
  }
  await as(admin);
  await db.query("update tasks set status='done' where id=$1", [tid]);
  await as(other);
  await db.exec("set role authenticated");
  try {
    assert.equal(
      (await db.query("select * from project_materials where id=$1", [m.id]))
        .rows.length,
      1,
    );
    await action("comment", { id: m.id, content: "Нашёл" });
    await assert.rejects(
      db.query("update project_materials set ready=false where id=$1", [m.id]),
    );
  } finally {
    await db.exec("reset role");
  }
});
test("Принятие во время загрузки: файл публикуется только после finalize", async () => {
  const tid = await task();
  await as(employee);
  const m = await add(tid, "file");
  await assert.rejects(action("finalize", { id: m.id }), /не завершена/);
  await as(admin);
  await db.query("update tasks set status='done' where id=$1", [tid]);
  assert.equal((await read(m.id)).published_at, null);
  await db.query(
    "insert into storage.objects(bucket_id,name) values('project-files',$1)",
    [m.path],
  );
  await as(employee);
  await action("finalize", { id: m.id });
  assert.ok((await read(m.id)).published_at);
});
test("Старые материалы публикуются напрямую; вложения к завершённым задачам тоже", async () => {
  await as(employee);
  const old = await add(null);
  assert.ok((await read(old.id)).published_at);
  const tid = await task();
  await db.query(
    "update tasks set status='done',archived_at=now() where id=$1",
    [tid],
  );
  await as(employee);
  const m = await add(tid);
  assert.ok((await read(m.id)).published_at);
});
test("Storage: нельзя загрузить чужой файл, подменить объект или получить черновик", async () => {
  const tid = await task();
  await as(employee);
  const m = await add(tid, "file");
  await as(other);
  await db.exec("set role authenticated");
  try {
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('project-files',$1)",
        [m.path],
      ),
    );
  } finally {
    await db.exec("reset role");
  }
  await as(employee);
  await db.exec("set role authenticated");
  try {
    await db.query(
      "insert into storage.objects(bucket_id,name) values('project-files',$1)",
      [m.path],
    );
    await action("finalize", { id: m.id });
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [m.path]))
        .rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "update storage.objects set name='changed' where name=$1 returning *",
          [m.path],
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.exec("reset role");
  }
  await as(other);
  await db.exec("set role authenticated");
  try {
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [m.path]))
        .rows.length,
      0,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("Заблокированный участник теряет доступ к библиотеке", async () => {
  await as(other);
  await db.query("update profiles set access_status='blocked' where id=$1", [
    other,
  ]);
  await db.exec("set role authenticated");
  try {
    assert.equal(
      (await db.query("select * from project_materials")).rows.length,
      0,
    );
    await assert.rejects(add(null), /Нет доступа/);
  } finally {
    await db.exec("reset role");
    await db.query("update profiles set access_status='active' where id=$1", [
      other,
    ]);
  }
});
test("Ссылки: только web URL без встроенных учётных данных", () => {
  assert.ok(validMaterialUrl("https://github.com/team/repo"));
  for (const value of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "oops",
  ])
    assert.equal(validMaterialUrl(value), false);
});
