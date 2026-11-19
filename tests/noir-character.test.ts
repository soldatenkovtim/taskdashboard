import { test } from "node:test";
import assert from "node:assert/strict";
import { characterMood, flawlessWeek, characterMedia } from "../lib/noir-character";
import type { Task } from "../lib/types";
import { existsSync } from "node:fs";
const now = Date.parse("2026-11-19T12:00:00Z");
const task = (overrides: Partial<Task> = {}) => ({ id: "1", status: "progress", assignee_id: "me", deadline: "2026-11-20T12:00:00Z", archived_at: null, ...overrides }) as Task;
test("Героиня учитывает только личные задачи сотрудника и готовность данных", () => {
  const late = task({ assignee_id: "other", deadline: "2026-11-18T12:00:00Z" });
  assert.equal(characterMood([late], now, "me", false, true).state, "neutral");
  assert.equal(characterMood([late], now, "me", true, true).state, "disappointed");
  assert.equal(characterMood([late], now, "me", true, false).caption, "Я здесь, когда понадоблюсь");
  assert.equal(characterMood([task()], now, "me", false, true).state, "playful");
  assert.equal(characterMood([task({status: "done"})], now, "me", false, true).state, "happy");
  assert.equal(characterMood([task({archived_at: "2026-11-19"})], now, "me", false, true).state, "neutral");
});
test("Поздравление требует завершённых вовремя задач текущей недели", () => {
  const start = now - 3 * 86400000;
  const done = task({status: "done", completed_at: "2026-11-19T10:00:00Z", completed_late: false});
  assert.equal(flawlessWeek([], start, now), false);
  assert.equal(flawlessWeek([done], start, now), true);
  assert.equal(flawlessWeek([done, task({ ...done, completed_late: true })], start, now), false);
  assert.equal(flawlessWeek([task({ ...done, deadline: null })], start, now), false);
  assert.equal(flawlessWeek([task({ ...done, completed_at: "2026-11-01T10:00:00Z" })], start, now), false);
});
test("Все состояния используют существующие локальные статичные портреты", () => {
  for (const path of Object.values(characterMedia)) {
    assert.ok(path.endsWith("-poster.webp"));
    assert.ok(existsSync(`public${path}`));
  }
});
