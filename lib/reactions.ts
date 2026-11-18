import type { Data, Task } from "./types";
export type ReactionEvent =
  | "visit_streak"
  | "task_created"
  | "task_assigned"
  | "task_accepted"
  | "task_completed_on_time"
  | "task_completed_late"
  | "task_returned"
  | "tasks_created_milestone"
  | "tasks_completed_milestone"
  | "deadline_approved";
export type ReactionConfig = {
  event: ReactionEvent;
  title: string;
  mediaPath: string | null;
  durationMs: number;
  audience: "admin" | "employee";
};
// Local noir animations and role-specific achievement rewards.
export const reactionConfig: ReactionConfig[] = [
  ...(["admin", "employee"] as const).map((audience) => ({
    event: "visit_streak" as const,
    audience,
    title: "EIGHT DAYS. ALL YOURS.",
    mediaPath: "/reactions/eight-days.gif",
    durationMs: 5600,
  })),
  {
    event: "tasks_created_milestone",
    audience: "admin",
    title: "WHAT A GOOD BOSS.",
    mediaPath: "/reactions/over-ten.gif",
    durationMs: 5600,
  },
  {
    event: "tasks_completed_milestone",
    audience: "employee",
    title: "YOU'VE EARNED IT.",
    mediaPath: "/reactions/over-ten.gif",
    durationMs: 5600,
  },
  {
    event: "task_created",
    audience: "admin",
    title: "MAKE THEM WORK.",
    mediaPath: "/reactions/v2/make-them-work.gif",
    durationMs: 4500,
  },
  {
    event: "task_assigned",
    audience: "admin",
    title: "YOU'RE THE BOSS.",
    mediaPath: "/reactions/v2/youre-the-boss.gif",
    durationMs: 4500,
  },
  {
    event: "deadline_approved",
    audience: "admin",
    title: "HOW GENEROUS OF YOU.",
    mediaPath: "/reactions/v2/how-generous.gif",
    durationMs: 4500,
  },
  {
    event: "task_accepted",
    audience: "admin",
    title: "ANOTHER ONE DONE.",
    mediaPath: "/reactions/v2/another-one-done.gif",
    durationMs: 4500,
  },
  {
    event: "task_returned",
    audience: "admin",
    title: "NOT GOOD ENOUGH.",
    mediaPath: "/reactions/v2/not-good-enough.gif",
    durationMs: 4500,
  },
  {
    event: "task_accepted",
    audience: "employee",
    title: "GOOD JOB, BABY.",
    mediaPath: "/reactions/v2/good-job.gif",
    durationMs: 4500,
  },
  {
    event: "task_completed_on_time",
    audience: "employee",
    title: "RIGHT ON TIME.",
    mediaPath: "/reactions/v2/right-on-time.gif",
    durationMs: 4500,
  },
  {
    event: "task_completed_late",
    audience: "employee",
    title: "YOU'RE LATE, HONEY.",
    mediaPath: "/reactions/v2/youre-late.gif",
    durationMs: 4500,
  },
  {
    event: "task_returned",
    audience: "employee",
    title: "TRY AGAIN, DARLING.",
    mediaPath: "/reactions/v2/try-again.gif",
    durationMs: 4500,
  },
  {
    event: "deadline_approved",
    audience: "employee",
    title: "IT'S A DATE.",
    mediaPath: "/reactions/v2/its-a-date.gif",
    durationMs: 4500,
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
// Rolling three-day window based on the server snapshot, including archived tasks.
export function milestoneCount(data: Data) {
  const now = Date.parse(data.serverNow);
  const start = now - 72 * 60 * 60 * 1000;
  return data.tasks.filter((task) => {
    const admin = data.profile.role === "admin";
    const belongs = admin
      ? task.created_by === data.profile.id
      : task.assignee_id === data.profile.id && task.status === "done";
    const timestamp = admin ? task.created_at : task.completed_at;
    const time = timestamp ? Date.parse(timestamp) : NaN;
    return belongs && time > start && time <= now;
  }).length;
}
// Called only after a successful task API response. Reads existing operation intent;
// validation and completion/deadline decisions remain in PostgreSQL.
export function adminReaction(
  action: string,
  payload: Record<string, unknown>,
  before: Data | null,
) {
  if (
    !before ||
    before.profile.role !== "admin" ||
    before.profile.access_status !== "active"
  )
    return null;
  // The refreshed server snapshot will show the milestone instead of briefly
  // flashing the ordinary creation reaction first.
  if (action === "create" && milestoneCount(before) === 9) return null;
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
  private milestoneCount = 0;
  observe(data: Data): ReactionConfig | null {
    const enabled = data.profile.access_status === "active";
    const notifications = data.notifications ?? [];
    const count = milestoneCount(data);
    if (this.userId !== data.profile.id) {
      this.userId = data.profile.id;
      this.seen = new Set(notifications.map((n) => n.id));
      this.enabled = enabled;
      this.milestoneCount = count;
      return null;
    }
    const fresh = notifications.filter((n) => !this.seen.has(n.id));
    notifications.forEach((n) => this.seen.add(n.id));
    const canShow = enabled && this.enabled;
    const milestone = this.milestoneCount < 10 && count >= 10;
    this.milestoneCount = count;
    this.enabled = enabled;
    if (!canShow) return null;
    if (milestone)
      return configFor(
        data.profile.role === "admin"
          ? "tasks_created_milestone"
          : "tasks_completed_milestone",
        data.profile.role,
      );
    if (data.profile.role !== "employee") return null;
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
