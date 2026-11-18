import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001",
  employee = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003",
  pending = "00000000-0000-0000-0000-000000000004";
async function identity(id: string) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function action(name: string, payload: Record<string, unknown>) {
  const result = await db.query<{ result: { id: string } }>(
    "select public.task_action($1,$2::jsonb) as result",
    [name, JSON.stringify(payload)],
  );
  return result.rows[0].result;
}
async function get(id: string) {
  return (await db.query<any>("select * from public.tasks where id=$1", [id]))
    .rows[0];
}
async function mutate(
  id: string,
  name: string,
  payload: Record<string, unknown> = {},
) {
  const t = await get(id);
  return action(name, { id, version: t.version, ...payload });
}
async function create(
  title = "Тестовая задача",
  deadline: string | null = "2030-01-01T12:00:00Z",
) {
  return (await action("create", { title, assignee_id: employee, deadline }))
    .id;
}
before(async () => {
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/002_playful_reactions.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/003_profile_avatars.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/006_required_task_deadline.sql", "utf8"),
  );
  for (const [id, name] of [
    [admin, "Админ"],
    [employee, "Сотрудник"],
    [other, "Другой"],
    [pending, "Ожидает"],
  ])
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        id,
        `${name}@example.com`,
        JSON.stringify({ name, role: "admin", access_status: "active" }),
      ],
    );
  await db.query(
    "update public.profiles set access_status='active' where id<>$1",
    [pending],
  );
  await db.query("update public.profiles set role='admin' where id=$1", [
    admin,
  ]);
  await db.exec("set role authenticated");
});
after(async () => {
  await db.close();
});
test("Публичная регистрация не позволяет выбрать роль и доступ", async () => {
  await identity(pending);
  const p = (await db.query<any>("select * from public.profiles")).rows;
  assert.equal(p.length, 1);
  assert.equal(p[0].role, "employee");
  assert.equal(p[0].access_status, "pending");
  await assert.rejects(() => create(), /не предоставлен/);
  assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
});
test("Сотрудник создаёт только свою задачу, предложенный срок не официальный", async () => {
  await identity(employee);
  const id = await create("Свой срок", "2030-01-01T12:00:00Z");
  const t = await get(id);
  assert.equal(t.assignee_id, employee);
  assert.equal(t.deadline, null);
  const r = (
    await db.query<any>(
      "select * from public.deadline_requests where task_id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(r.status, "pending");
  await assert.rejects(
    () => mutate(id, "set_deadline", { deadline: "2030-02-01T12:00:00Z" }),
    /недоступно/,
  );
  await identity(admin);
  await mutate(id, "reject", { request_id: r.id });
  assert.equal((await get(id)).deadline, null);
});
test("Согласование, перенос и историческая просрочка сохраняются атомарно", async () => {
  await identity(admin);
  const id = await create("Просроченная", "2020-01-01T12:00:00Z");
  await identity(employee);
  assert.equal((await get(id)).ever_overdue, true);
  await mutate(id, "request_deadline", {
    deadline: "2030-01-01T12:00:00Z",
    reason: "Ждём материалы",
  });
  let r = (
    await db.query<any>(
      "select * from public.deadline_requests where task_id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(
    (await get(id)).deadline.toISOString(),
    "2020-01-01T12:00:00.000Z",
  );
  await assert.rejects(
    () => mutate(id, "approve", { request_id: r.id }),
    /недоступно/,
  );
  await identity(admin);
  await mutate(id, "approve", { request_id: r.id });
  const t = await get(id);
  assert.equal(t.deadline.toISOString(), "2030-01-01T12:00:00.000Z");
  assert.equal(t.original_deadline.toISOString(), "2020-01-01T12:00:00.000Z");
  assert.equal(t.deadline_changes, 1);
  assert.equal(t.ever_overdue, true);
  const e = (
    await db.query<any>(
      "select * from public.task_events where task_id=$1 and event_type='overdue'",
      [id],
    )
  ).rows;
  assert.equal(e.length, 1);
  await db.query("select public.sync_overdue()");
  assert.equal(
    (
      await db.query(
        "select * from public.task_events where task_id=$1 and event_type='overdue'",
        [id],
      )
    ).rows.length,
    1,
  );
});
test("Отклонённый перенос не меняет текущий и первоначальный сроки", async () => {
  await identity(admin);
  const id = await create("Без переноса", "2020-05-01T12:00:00Z");
  await identity(employee);
  await mutate(id, "request_deadline", {
    deadline: "2030-05-01T12:00:00Z",
    reason: "Нужен ответ",
  });
  const r = (
    await db.query<any>(
      "select * from public.deadline_requests where task_id=$1",
      [id],
    )
  ).rows[0];
  await identity(admin);
  await mutate(id, "reject", { request_id: r.id });
  const t = await get(id);
  assert.equal(t.deadline.toISOString(), "2020-05-01T12:00:00.000Z");
  assert.equal(t.deadline_changes, 0);
});
test("RLS скрывает чужие задачи, историю, комментарии и заявки; RPC также запрещён", async () => {
  await identity(admin);
  const id = await create();
  await mutate(id, "comment", { content: "Секретный контекст" });
  await identity(other);
  assert.equal(await get(id), undefined);
  for (const table of ["task_events", "task_comments", "deadline_requests"])
    assert.equal(
      (await db.query(`select * from public.${table} where task_id=$1`, [id]))
        .rows.length,
      0,
    );
  await assert.rejects(
    () => action("status", { id, version: 2, status: "progress" }),
    /недоступна/,
  );
});
test("Сотрудник не архивирует, не редактирует историю и не принимает задачу", async () => {
  await identity(admin);
  const id = await create("Поздняя", "2020-01-01T12:00:00Z");
  await identity(employee);
  await assert.rejects(() => mutate(id, "archive"), /администратору/);
  await assert.rejects(
    () => db.query("update public.tasks set deadline=null where id=$1", [id]),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("delete from public.task_events where task_id=$1", [id]),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query("update public.profiles set role='admin' where id=$1", [
        employee,
      ]),
    /permission denied/,
  );
  await mutate(id, "status", { status: "progress" });
  await mutate(id, "status", { status: "review" });
  await assert.rejects(
    () => mutate(id, "status", { status: "done" }),
    /администратор/,
  );
  await assert.rejects(
    () => mutate(id, "status", { status: "progress", reason: "Сам вернул" }),
    /администратор/,
  );
  await identity(admin);
  await assert.rejects(
    () => mutate(id, "status", { status: "progress", reason: "" }),
    /причину/,
  );
  await mutate(id, "status", {
    status: "progress",
    reason: "Исправить подпись",
  });
  assert.equal((await get(id)).return_count, 1);
  await identity(employee);
  await mutate(id, "status", { status: "review" });
  await identity(admin);
  await mutate(id, "status", { status: "done" });
  const t = await get(id);
  assert.equal(t.status, "done");
  assert.equal(t.completed_late, true);
  assert.ok(t.completed_at);
  await assert.rejects(
    () => mutate(id, "set_deadline", { deadline: "2030-01-01T12:00:00Z" }),
    /недоступно/,
  );
});
test("Версия предотвращает потерю обновлений; неудачное действие не пишет историю", async () => {
  await identity(admin);
  const id = await create();
  const initial = await get(id);
  await mutate(id, "status", { status: "progress" });
  const before = (
    await db.query("select * from public.task_events where task_id=$1", [id])
  ).rows.length;
  await assert.rejects(
    () => action("status", { id, version: initial.version, status: "review" }),
    /уже изменена/,
  );
  assert.equal((await get(id)).status, "progress");
  assert.equal(
    (await db.query("select * from public.task_events where task_id=$1", [id]))
      .rows.length,
    before,
  );
  await assert.rejects(
    () => mutate(id, "status", { status: "done" }),
    /после проверки/,
  );
});
test("Блокировка отбирает чтение и операции; уведомления изолированы", async () => {
  await identity(admin);
  await create("Уведомление");
  await action("access", { id: other, status: "blocked" });
  await identity(other);
  assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
  await assert.rejects(() => create(), /не предоставлен/);
  await identity(employee);
  const ns = (await db.query<any>("select * from public.notifications")).rows;
  assert.ok(ns.length > 0);
  assert.ok(ns.every((n) => n.recipient_id === employee));
  await action("read_notifications", {});
  assert.ok(
    (await db.query<any>("select * from public.notifications")).rows.every(
      (n) => n.is_read,
    ),
  );
});
test("Задачи без срока и принятые в срок не помечаются опоздавшими", async () => {
  await identity(admin);
  for (const deadline of [null, "2030-01-01T12:00:00Z"]) {
    const id = await create("Вовремя");
    if (deadline === null) {
      // Represent a legacy task created before migration 006.
      await db.exec("reset role");
      try {
        await db.query(
          "update public.tasks set deadline=null, original_deadline=null where id=$1",
          [id],
        );
      } finally {
        await db.exec("set role authenticated");
      }
    }
    await mutate(id, "status", { status: "progress" });
    await mutate(id, "status", { status: "review" });
    await mutate(id, "status", { status: "done" });
    assert.equal((await get(id)).completed_late, false);
  }
});
test("Согласованный снимок соблюдает RLS и содержит серверное время", async () => {
  await identity(employee);
  const snapshot = (
    await db.query<any>("select public.workspace_data() as data")
  ).rows[0].data;
  assert.equal(snapshot.profile.id, employee);
  assert.ok(snapshot.tasks.every((t: any) => t.assignee_id === employee));
  assert.ok(
    snapshot.events.every((e: any) =>
      snapshot.tasks.some((t: any) => t.id === e.task_id),
    ),
  );
  assert.ok(Date.parse(snapshot.serverNow));
});
test("Принятие не оставляет неразрешимый запрос дедлайна", async () => {
  await identity(employee);
  const id = await create("Сначала решение", "2030-01-01T12:00:00Z");
  await mutate(id, "status", { status: "progress" });
  await mutate(id, "status", { status: "review" });
  await identity(admin);
  await assert.rejects(
    () => mutate(id, "status", { status: "done" }),
    /Сначала рассмотрите/,
  );
  const r = (
    await db.query<any>(
      "select * from public.deadline_requests where task_id=$1",
      [id],
    )
  ).rows[0];
  await mutate(id, "approve", { request_id: r.id });
  await mutate(id, "status", { status: "done" });
  assert.equal((await get(id)).status, "done");
});
test("Миграция включает реакции всем и удаляет возможность отключения", async () => {
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/004_reactions_always_on.sql", "utf8"),
  );
  assert.equal(
    (
      await db.query<any>(
        "select count(*)::int as n from public.profiles where not playful_reactions",
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    () => db.query("update public.profiles set playful_reactions=false"),
    /reactions_always_on/,
  );
  await db.exec("set role authenticated");
  await identity(employee);
  await assert.rejects(
    () => db.query("select public.set_playful_reactions(false)"),
    /does not exist/,
  );
});
test("Аватар: только собственный профиль, допустимый каталог и сброс", async () => {
  await identity(employee);
  await db.query("select public.set_avatar('noir-3')");
  let snapshot = (await db.query<any>("select public.workspace_data() as data"))
    .rows[0].data;
  assert.equal(snapshot.profile.avatar_id, "noir-3");
  assert.equal(snapshot.profile.role, "employee");
  await assert.rejects(
    () =>
      db.query("select public.set_avatar('https://example.com/avatar.gif')"),
    /Выберите/,
  );
  await assert.rejects(
    () =>
      db.query("update public.profiles set avatar_id='noir-1' where id=$1", [
        admin,
      ]),
    /permission denied/,
  );
  await identity(admin);
  snapshot = (await db.query<any>("select public.workspace_data() as data"))
    .rows[0].data;
  assert.equal(snapshot.profile.avatar_id, null);
  assert.equal(
    snapshot.profiles.find((p: any) => p.id === employee).avatar_id,
    "noir-3",
  );
  await identity(employee);
  await db.query("select public.set_avatar(null)");
  snapshot = (await db.query<any>("select public.workspace_data() as data"))
    .rows[0].data;
  assert.equal(snapshot.profile.avatar_id, null);
  await identity("");
  await assert.rejects(
    () => db.query("select public.set_avatar('noir-1')"),
    /Войдите/,
  );
});

test("Посещения: 8-й день, без повторов, пропуск сбрасывает серию для обеих ролей", async () => {
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/005_visit_streak.sql", "utf8"),
  );
  for (const user of [employee, admin]) {
    await db.exec("reset role");
    await db.query(
      "update public.profiles set last_visit_day=(now() at time zone 'Europe/Moscow')::date-1,visit_streak=6 where id=$1",
      [user],
    );
    await db.exec("set role authenticated");
    await identity(user);
    const visit = async () =>
      (await db.query<any>("select public.record_visit() as result")).rows[0]
        .result;
    assert.deepEqual(await visit(), { days: 7, reward: false });
    await db.exec("reset role");
    await db.query(
      "update public.profiles set last_visit_day=(now() at time zone 'Europe/Moscow')::date-1 where id=$1",
      [user],
    );
    await db.exec("set role authenticated");
    assert.deepEqual(await visit(), { days: 8, reward: true });
    assert.deepEqual(await visit(), { days: 8, reward: false });
    await db.exec("reset role");
    await db.query(
      "update public.profiles set last_visit_day=(now() at time zone 'Europe/Moscow')::date-1 where id=$1",
      [user],
    );
    await db.exec("set role authenticated");
    assert.deepEqual(await visit(), { days: 9, reward: false });
    await assert.rejects(
      () =>
        db.query("update public.profiles set visit_streak=7 where id=$1", [
          user,
        ]),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query(
      "update public.profiles set last_visit_day=(now() at time zone 'Europe/Moscow')::date-2 where id=$1",
      [user],
    );
    await db.exec("set role authenticated");
    assert.deepEqual(await visit(), { days: 1, reward: false });
  }
  await identity(pending);
  await assert.rejects(
    () => db.query("select public.record_visit()"),
    /Нет доступа/,
  );
  await identity("");
  await assert.rejects(
    () => db.query("select public.record_visit()"),
    /Войдите/,
  );
});

test("Создание без дедлайна запрещено для обеих ролей и не оставляет записей", async () => {
  for (const user of [admin, employee]) {
    await identity(user);
    const before = (await db.query("select id from public.tasks")).rows.length;
    for (const deadline of [
      undefined,
      null,
      "",
      "   ",
      "infinity",
      "-infinity",
    ]) {
      await assert.rejects(
        () =>
          action("create", {
            title: "Без срока",
            assignee_id: employee,
            deadline,
          }),
        /Укажите дату и время дедлайна/,
      );
    }
    await assert.rejects(() =>
      action("create", {
        title: "Некорректный срок",
        assignee_id: employee,
        deadline: "invalid",
      }),
    );
    assert.equal(
      (await db.query("select id from public.tasks")).rows.length,
      before,
    );
  }
});

test("Посещения: 16 дней, прерывание длинной серии и отсутствие повторов", async () => {
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/007_visit_streak_sixteen.sql", "utf8"),
  );
  const visit = async () =>
    (await db.query<any>("select public.record_visit() as result")).rows[0]
      .result;
  for (const user of [admin, employee]) {
    for (const [streak, ago, days, reaction] of [
      [15, 1, 16, "visit_streak_16"],
      [16, 1, 17, null],
      [16, 2, 1, "visit_streak_broken"],
      [25, 5, 1, "visit_streak_broken"],
      [15, 2, 1, null],
      [0, null, 1, null],
      [7, 1, 8, null],
    ] as const) {
      await db.exec("reset role");
      await db.query(
        "update public.profiles set visit_streak=$2,last_visit_day=(now() at time zone 'Europe/Moscow')::date-$3::integer where id=$1",
        [user, streak, ago],
      );
      await db.exec("set role authenticated");
      await identity(user);
      assert.deepEqual(await visit(), { days, reward: days === 8, reaction });
      assert.deepEqual(await visit(), { days, reward: false });
    }
  }
  await identity(pending);
  await assert.rejects(visit, /Нет доступа/);
  await identity("");
  await assert.rejects(visit, /Войдите/);
});

test("Прерывание 8–15 дней: отдельная реакция, без повторов", async () => {
  await db.exec("reset role");
  await db.exec(
    readFileSync(
      "supabase/migrations/008_visit_streak_eight_broken.sql",
      "utf8",
    ),
  );
  for (const user of [admin, employee]) {
    for (const streak of [7, 8, 15, 16, 20]) {
      await db.exec("reset role");
      await db.query(
        "update public.profiles set visit_streak=$2,last_visit_day=(now() at time zone 'Europe/Moscow')::date-2 where id=$1",
        [user, streak],
      );
      await db.exec("set role authenticated");
      await identity(user);
      const visit = async () =>
        (await db.query<any>("select public.record_visit() as result")).rows[0]
          .result;
      assert.deepEqual(await visit(), {
        days: 1,
        reward: false,
        reaction:
          streak >= 16
            ? "visit_streak_broken"
            : streak >= 8
              ? "visit_streak_8_broken"
              : null,
      });
      assert.deepEqual(await visit(), { days: 1, reward: false });
    }
  }
});
