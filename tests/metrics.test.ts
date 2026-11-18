import { test } from "node:test";
import assert from "node:assert/strict";
import { durations } from "../lib/metrics";
import { overdue, type Task, type Event } from "../lib/types";
const task = {
  id: "a",
  status: "review",
  created_at: "2026-01-01T00:00:00Z",
  deadline: "2026-01-01T01:00:00Z",
  completed_at: null,
} as Task;
test("Просрочка не скрывается статусом Review и начинается строго после срока", () => {
  assert.equal(overdue(task, Date.parse(task.deadline!)), false);
  assert.equal(overdue(task, Date.parse(task.deadline!) + 1), true);
  assert.equal(
    overdue({ ...task, status: "done" }, Date.parse(task.deadline!) + 1),
    false,
  );
  assert.equal(overdue({ ...task, deadline: null }), false);
});
test("Время включает все повторные интервалы работы и проверки", () => {
  const events = ["progress", "review", "progress", "review", "done"].map(
    (status, i) => ({
      id: String(i),
      actor_id: null,
      previous_value: null,
      task_id: "a",
      event_type: "status",
      new_value: { status },
      created_at: `2026-01-01T0${i + 1}:00:00Z`,
    }),
  ) as Event[];
  const result = durations(
    { ...task, status: "done", completed_at: "2026-01-01T05:00:00Z" },
    events,
    Date.parse("2026-01-02T00:00:00Z"),
  );
  assert.equal(result.wait, 3600000);
  assert.equal(result.progress, 7200000);
  assert.equal(result.review, 7200000);
  assert.equal(result.lastDelta, 14400000);
});
