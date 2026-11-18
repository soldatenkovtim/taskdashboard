import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ReactionInbox,
  adminReaction,
  acceptedReaction,
  mediaKind,
  reactionConfig,
} from "../lib/reactions";
import type { Data, Task, Notification } from "../lib/types";
const task = {
  id: "task",
  status: "done",
  assignee_id: "employee",
  deadline: "2026-01-01",
  completed_late: false,
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
test("OFF поглощает события; включение не воспроизводит накопленное", () => {
  const inbox = new ReactionInbox();
  inbox.observe(data([], false));
  assert.equal(inbox.observe(data([notice("1")], false)), null);
  assert.equal(inbox.observe(data([notice("1"), notice("2")], true)), null);
  assert.equal(
    inbox.observe(data([notice("1"), notice("2"), notice("3")], true))?.event,
    "task_completed_on_time",
  );
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
test("С выключенной настройкой локальная успешная операция не даёт реакцию", () => {
  assert.equal(adminReaction("approve", {}, data([], false, "admin")), null);
  assert.equal(adminReaction("approve", {}, data([], true, "employee")), null);
  assert.equal(adminReaction("approve", {}, null), null);
});
test("Поддерживаются только локальные GIF/WebP/MP4/WebM; конфиг пока честно текстовый", () => {
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
        r.mediaPath === null && r.durationMs >= 2000 && r.durationMs <= 4000,
    ),
  );
  assert.equal(reactionConfig.length, 10);
});
