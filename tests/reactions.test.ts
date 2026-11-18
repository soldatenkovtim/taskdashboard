import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ReactionInbox,
  adminReaction,
  acceptedReaction,
  mediaKind,
  reactionConfig,
  milestoneCount,
} from "../lib/reactions";
import type { Data, Task, Notification } from "../lib/types";
const task = {
  id: "task",
  status: "done",
  assignee_id: "employee",
  deadline: "2026-01-01",
  completed_late: false,
  created_at: "2026-01-01T00:00:00Z",
  completed_at: "2026-01-01T00:00:00Z",
} as Task;
const notice = (id: string, type = "accepted"): Notification => ({
  id,
  type,
  task_id: "task",
  is_read: false,
  created_at: `2026-01-01T00:00:0${id}Z`,
});
function data(
  notifications: Notification[] = [],
  enabled = true,
  role: "employee" | "admin" = "employee",
): Data {
  return {
    profile: {
      id: role,
      name: "Name",
      email: "user@example.com",
      role,
      access_status: "active",
      playful_reactions: enabled,
    },
    tasks: [task],
    notifications,
    profiles: [],
    requests: [],
    events: [],
    comments: [],
    serverNow: "2026-01-01",
  };
}
test("Первая загрузка, повторный снимок и перезагрузка не воспроизводят старые события", () => {
  const inbox = new ReactionInbox();
  assert.equal(inbox.observe(data([notice("1")])), null);
  assert.equal(inbox.observe(data([notice("1")])), null);
  assert.equal(
    inbox.observe(data([notice("1"), notice("2")]))?.title,
    "RIGHT ON TIME.",
  );
  assert.equal(inbox.observe(data([notice("1"), notice("2")])), null);
  assert.equal(
    new ReactionInbox().observe(data([notice("1"), notice("2")])),
    null,
  );
});
test("Событие другой сессии приходит через уведомления; is_read не управляет повторами", () => {
  const inbox = new ReactionInbox();
  inbox.observe(data());
  assert.equal(
    inbox.observe(data([{ ...notice("1", "returned"), is_read: true }]))?.title,
    "TRY AGAIN, DARLING.",
  );
});
test("Реакции работают даже со старым значением OFF в профиле", () => {
  const inbox = new ReactionInbox();
  inbox.observe(data([], false));
  assert.equal(
    inbox.observe(data([notice("1")], false))?.event,
    "task_completed_on_time",
  );
  assert.equal(inbox.observe(data([notice("1")], false)), null);
});
test("При смене аккаунта и снятии доступа реакции не показываются", () => {
  const inbox = new ReactionInbox();
  inbox.observe(data());
  const blocked = data([notice("1")]);
  blocked.profile.access_status = "blocked";
  assert.equal(inbox.observe(blocked), null);
  const other = data([notice("2")]);
  other.profile.id = "other";
  assert.equal(inbox.observe(other), null);
});
test("Специфичная реакция принятия использует серверный итог, а не часы браузера", () => {
  assert.equal(acceptedReaction(task), "task_completed_on_time");
  assert.equal(
    acceptedReaction({ ...task, completed_late: true }),
    "task_completed_late",
  );
  assert.equal(acceptedReaction({ ...task, deadline: null }), "task_accepted");
});
test("Один batch — один поп-ап; неизвестные события и отклонение срока молчат", () => {
  const inbox = new ReactionInbox();
  inbox.observe(data());
  assert.equal(inbox.observe(data([notice("1", "deadline_rejected")])), null);
  assert.equal(
    inbox.observe(
      data([
        notice("1", "deadline_rejected"),
        notice("2", "returned"),
        notice("3", "deadline_approved"),
      ]),
    )?.title,
    "IT'S A DATE.",
  );
});
test("Создание с назначением выбирает одну конкретную реакцию администратора", () => {
  const d = data([], true, "admin");
  assert.equal(
    adminReaction("create", { assignee_id: "employee" }, d)?.title,
    "YOU'RE THE BOSS.",
  );
  assert.equal(
    adminReaction("create", { assignee_id: "admin" }, d)?.title,
    "MAKE THEM WORK.",
  );
  assert.equal(
    adminReaction("update", { id: "task", assignee_id: "employee" }, d),
    null,
  );
  assert.equal(
    adminReaction("update", { id: "task", assignee_id: "other" }, d)?.event,
    "task_assigned",
  );
});
test("Администратор получает реакции только успешных вызовов, не своих уведомлений", () => {
  const d = data([], true, "admin");
  assert.equal(adminReaction("approve", {}, d)?.title, "HOW GENEROUS OF YOU.");
  assert.equal(adminReaction("reject", {}, d), null);
  assert.equal(
    adminReaction("status", { id: "task", status: "done" }, d)?.title,
    "ANOTHER ONE DONE.",
  );
  d.tasks = [{ ...task, status: "review" }];
  assert.equal(
    adminReaction("status", { id: "task", status: "progress" }, d)?.title,
    "NOT GOOD ENOUGH.",
  );
  d.tasks = [{ ...task, status: "todo" }];
  assert.equal(
    adminReaction("status", { id: "task", status: "progress" }, d),
    null,
  );
  const inbox = new ReactionInbox();
  inbox.observe(data([], true, "admin"));
  assert.equal(inbox.observe(data([notice("1")], true, "admin")), null);
});
test("Старый OFF не отключает реакцию администратора", () => {
  assert.equal(
    adminReaction("approve", {}, data([], false, "admin"))?.event,
    "deadline_approved",
  );
  assert.equal(adminReaction("approve", {}, data([], true, "employee")), null);
  assert.equal(adminReaction("approve", {}, null), null);
});
test("Поддерживаются только локальные GIF/WebP/MP4/WebM; каждая реакция подключена к анимации", () => {
  for (const ext of ["gif", "webp"])
    assert.equal(mediaKind(`/reactions/file.${ext}`), "image");
  for (const ext of ["mp4", "webm"])
    assert.equal(mediaKind(`/reactions/file.${ext}`), "video");
  for (const path of [
    null,
    "/reactions/static.png",
    "https://example.com/file.gif",
    "/reactions/../file.mp4",
  ])
    assert.equal(mediaKind(path), null);
  assert.ok(
    reactionConfig.every(
      (r) =>
        mediaKind(r.mediaPath) === "image" &&
        r.durationMs >= 3000 &&
        r.durationMs <= 6000,
    ),
  );
  assert.equal(reactionConfig.length, 20);
  for (const audience of ["admin", "employee"]) {
    assert.equal(
      reactionConfig.find(
        (r) => r.event === "visit_streak_16" && r.audience === audience,
      )?.mediaPath,
      "/reactions/sixteen-days.gif",
    );
    assert.equal(
      reactionConfig.find(
        (r) => r.event === "visit_streak_broken" && r.audience === audience,
      )?.mediaPath,
      "/reactions/streak-broken.gif",
    );
  }
});

test("Все GIF существуют, содержат разные кадры и укладываются в лимит размера", async () => {
  const { default: sharp } = await import("sharp");
  const { stat } = await import("node:fs/promises");
  for (const config of reactionConfig) {
    const file = new URL(`../public${config.mediaPath}`, import.meta.url);
    const bytes = await stat(file);
    const imported = [
      "/reactions/over-ten.gif",
      "/reactions/eight-days.gif",
      "/reactions/eight-days-broken.gif",
      "/reactions/sixteen-days.gif",
      "/reactions/streak-broken.gif",
    ].includes(config.mediaPath!);
    assert.ok(bytes.size < (imported ? 6 : 2) * 1024 * 1024, config.title);
    const metadata = await sharp(file.pathname, { animated: true }).metadata();
    assert.equal(metadata.format, "gif");
    assert.equal(metadata.pages, imported ? 52 : 24, config.title);
    const duration = (metadata.delay ?? []).reduce(
      (sum, delay) => sum + delay,
      0,
    );
    assert.ok(duration >= 3000 && duration <= 6000, config.title);
    assert.ok(config.durationMs >= duration, `Popup cuts off ${config.title}`);
    assert.equal(metadata.loop, 0);
    const hashes = await Promise.all(
      Array.from({ length: metadata.pages ?? 0 }, (_, page) => page).map(
        (page) =>
          sharp(file.pathname, { page, pages: 1 })
            .raw()
            .toBuffer()
            .then((buffer) => buffer.toString("base64")),
      ),
    );
    assert.ok(
      new Set(hashes).size >= 18,
      `Insufficient motion frames: ${config.title}`,
    );
  }
});

for (const role of ["admin", "employee"] as const) {
  const event =
    role === "admin" ? "tasks_created_milestone" : "tasks_completed_milestone";
  function snapshot(count: number, enabled = true) {
    const d = data([], enabled, role);
    d.tasks = Array.from({ length: count }, (_, i) => ({
      ...task,
      id: `own-${i}`,
      created_by: role,
      assignee_id: role,
      archived_at: i === 0 ? "2026-01-01" : null,
    }));
    d.tasks.push({
      ...task,
      id: "other",
      created_by: "other",
      assignee_id: "other",
    });
    return d;
  }
  test(`${role}: порог 10, архив учитывается, чужие задачи не считаются, повторов нет`, () => {
    const inbox = new ReactionInbox();
    assert.equal(inbox.observe(snapshot(9)), null);
    assert.equal(inbox.observe(snapshot(10))?.event, event);
    assert.equal(inbox.observe(snapshot(11)), null);
    assert.equal(inbox.observe(snapshot(12)), null);
    assert.equal(new ReactionInbox().observe(snapshot(12)), null);
  });
  test(`${role}: пакет пересекает порог; старый OFF не отключает награду, смена пользователя не воспроизводит её`, () => {
    const inbox = new ReactionInbox();
    inbox.observe(snapshot(9));
    assert.equal(inbox.observe(snapshot(13))?.event, event);
    const disabled = new ReactionInbox();
    disabled.observe(snapshot(9, false));
    assert.equal(disabled.observe(snapshot(11, false))?.event, event);
    assert.equal(disabled.observe(snapshot(11)), null);
    assert.equal(disabled.observe(snapshot(12)), null);
    const other = snapshot(14);
    other.profile.id = "other";
    assert.equal(inbox.observe(other), null);
  });
}
test("Сотрудник: review не считается выполнением, награда приоритетнее обычной реакции", () => {
  const inbox = new ReactionInbox();
  const d = data();
  d.tasks = Array.from({ length: 10 }, (_, i) => ({
    ...task,
    id: i === 9 ? "task" : `done-${i}`,
    status: i === 9 ? "review" : "done",
  }));
  inbox.observe(d);
  const accepted = {
    ...d,
    tasks: d.tasks.map((t) => ({ ...t, status: "done" as const })),
    notifications: [notice("1")],
  };
  assert.equal(inbox.observe(accepted)?.event, "tasks_completed_milestone");
  assert.equal(inbox.observe(accepted), null);
});

test("Администратор: на 10-й задаче обычная реакция ждёт награду из снимка", () => {
  const d = data([], true, "admin");
  d.tasks = Array.from({ length: 9 }, (_, i) => ({
    ...task,
    id: `created-${i}`,
    created_by: "admin",
  }));
  assert.equal(adminReaction("create", { assignee_id: "employee" }, d), null);
  d.tasks.push({ ...task, id: "eleventh", created_by: "admin" });
  assert.equal(
    adminReaction("create", { assignee_id: "employee" }, d)?.event,
    "task_assigned",
  );
});

for (const role of ["admin", "employee"] as const) {
  test(`${role}: только последние 72 часа по серверному времени`, () => {
    const d = data([], true, role);
    d.serverNow = "2026-01-04T12:00:00Z";
    d.tasks = [
      "2026-01-01T11:59:59Z",
      "2026-01-01T12:00:00Z",
      "2026-01-01T12:00:01Z",
      "2026-01-04T12:00:00Z",
      "2026-01-04T12:00:01Z",
    ].map((time, i) => ({
      ...task,
      id: `${i}`,
      created_by: role,
      assignee_id: role,
      created_at: time,
      completed_at: time,
    }));
    assert.equal(milestoneCount(d), 2);
    if (role === "employee") {
      d.tasks = [
        { ...task, created_at: "2025-01-01", completed_at: d.serverNow },
      ];
      assert.equal(milestoneCount(d), 1);
    }
  });
}
test("После выхода задач из окна новое достижение снова доступно", () => {
  const inbox = new ReactionInbox();
  const d = data();
  d.tasks = Array.from({ length: 10 }, (_, i) => ({ ...task, id: `${i}` }));
  inbox.observe(d);
  assert.equal(inbox.observe({ ...d, serverNow: "2026-01-05" }), null);
  const next = {
    ...d,
    serverNow: "2026-01-05",
    tasks: d.tasks.map((t) => ({
      ...t,
      id: `new-${t.id}`,
      completed_at: "2026-01-05",
    })),
  };
  assert.equal(inbox.observe(next)?.event, "tasks_completed_milestone");
  assert.equal(inbox.observe(next), null);
});
