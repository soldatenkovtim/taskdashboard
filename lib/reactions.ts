import type { Data, Task } from "./types";
export type ReactionEvent =
  | "task_created"
  | "task_assigned"
  | "task_accepted"
  | "task_completed_on_time"
  | "task_completed_late"
  | "task_returned"
  | "deadline_approved";
export type ReactionConfig = {
  event: ReactionEvent;
  title: string;
  mediaPath: string | null;
  durationMs: number;
  audience: "admin" | "employee";
};
// Add a local GIF, animated WebP, MP4 or WebM path when genuine animation is available.
// Null deliberately means text-only, not a static-image substitute.
export const reactionConfig: ReactionConfig[] = [
  {
    event: "task_created",
    audience: "admin",
    title: "MAKE THEM WORK.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "task_assigned",
    audience: "admin",
    title: "YOU'RE THE BOSS.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "deadline_approved",
    audience: "admin",
    title: "HOW GENEROUS OF YOU.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "task_accepted",
    audience: "admin",
    title: "ANOTHER ONE DONE.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "task_returned",
    audience: "admin",
    title: "NOT GOOD ENOUGH.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "task_accepted",
    audience: "employee",
    title: "GOOD JOB, BABY.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "task_completed_on_time",
    audience: "employee",
    title: "RIGHT ON TIME.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "task_completed_late",
    audience: "employee",
    title: "YOU'RE LATE, HONEY.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "task_returned",
    audience: "employee",
    title: "TRY AGAIN, DARLING.",
    mediaPath: null,
    durationMs: 3000,
  },
  {
    event: "deadline_approved",
    audience: "employee",
    title: "IT'S A DATE.",
    mediaPath: null,
    durationMs: 3000,
  },
];
export function configFor(
  event: ReactionEvent,
  audience: "admin" | "employee",
) {
  return (
    reactionConfig.find((r) => r.event === event && r.audience === audience) ??
    null
  );
}
export function mediaKind(path: string | null) {
  if (!path || !/^\/reactions\/[\w./-]+$/i.test(path) || path.includes(".."))
    return null;
  if (/\.(mp4|webm)$/i.test(path)) return "video";
  if (/\.(gif|webp)$/i.test(path)) return "image";
  return null;
}
// Called only after a successful task API response. Reads existing operation intent;
// validation and completion/deadline decisions remain in PostgreSQL.
export function adminReaction(
  action: string,
  payload: Record<string, unknown>,
  before: Data | null,
) {
  if (
    !before?.profile.playful_reactions ||
    before.profile.role !== "admin" ||
    before.profile.access_status !== "active"
  )
    return null;
  let event: ReactionEvent | undefined;
  if (action === "create")
    event =
      payload.assignee_id && payload.assignee_id !== before.profile.id
        ? "task_assigned"
        : "task_created";
  if (action === "update") {
    const task = before.tasks.find((t) => t.id === payload.id);
    if (task && task.assignee_id !== payload.assignee_id)
      event = "task_assigned";
  }
  if (action === "approve") event = "deadline_approved";
  if (action === "status" && payload.status === "done") event = "task_accepted";
  if (
    action === "status" &&
    payload.status === "progress" &&
    before.tasks.find((t) => t.id === payload.id)?.status === "review"
  )
    event = "task_returned";
  return event ? configFor(event, "admin") : null;
}
export function acceptedReaction(task: Task | undefined): ReactionEvent {
  if (task?.status === "done" && task.deadline)
    return task.completed_late
      ? "task_completed_late"
      : "task_completed_on_time";
  return "task_accepted";
}
// A fresh instance baselines the first snapshot on every mount/reload. Unread is NOT
// used as a cursor: old unread notifications must never become new reactions.
export class ReactionInbox {
  private userId: string | null = null;
  private seen = new Set<string>();
  private enabled = false;
  observe(data: Data): ReactionConfig | null {
    const enabled =
      data.profile.playful_reactions === true &&
      data.profile.access_status === "active";
    const notifications = data.notifications ?? [];
    if (this.userId !== data.profile.id) {
      this.userId = data.profile.id;
      this.seen = new Set(notifications.map((n) => n.id));
      this.enabled = enabled;
      return null;
    }
    const fresh = notifications.filter((n) => !this.seen.has(n.id));
    notifications.forEach((n) => this.seen.add(n.id));
    const canShow = enabled && this.enabled && data.profile.role === "employee";
    this.enabled = enabled;
    if (!canShow) return null;
    // Coalesce a polling batch to one popup. Prefer the most recent relevant event;
    // accepted + on-time/late is a single, more specific reaction, never a queue.
    for (const n of fresh
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const task = data.tasks?.find((t) => t.id === n.task_id);
      if (!task) continue;
      const event =
        n.type === "accepted"
          ? acceptedReaction(task)
          : n.type === "returned"
            ? "task_returned"
            : n.type === "deadline_approved"
              ? "deadline_approved"
              : null;
      if (event) return configFor(event, "employee");
    }
    return null;
  }
}
