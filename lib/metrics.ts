import type { Task, Event } from "./types";
export function durations(task: Task, events: Event[], now: number) {
  const totals: Record<string, number> = {
    todo: 0,
    progress: 0,
    review: 0,
    done: 0,
  };
  let status = "todo",
    start = Date.parse(task.created_at),
    firstStart: number | null = null;
  for (const e of events
    .filter((e) => e.task_id === task.id && e.event_type === "status")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const end = Date.parse(e.created_at);
    totals[status] += end - start;
    status = String(e.new_value?.status);
    start = end;
    if (status === "progress" && firstStart === null) firstStart = end;
  }
  totals[status] += Math.max(
    0,
    (task.completed_at ? Date.parse(task.completed_at) : now) - start,
  );
  return {
    todo: totals.todo,
    progress: totals.progress,
    review: totals.review,
    done: totals.done,
    wait:
      firstStart === null
        ? now - Date.parse(task.created_at)
        : firstStart - Date.parse(task.created_at),
    originalDelta:
      task.completed_at && task.original_deadline
        ? Date.parse(task.completed_at) - Date.parse(task.original_deadline)
        : null,
    lastDelta:
      task.completed_at && task.deadline
        ? Date.parse(task.completed_at) - Date.parse(task.deadline)
        : null,
  };
}
