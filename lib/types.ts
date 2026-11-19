export type Status = "todo" | "progress" | "review" | "done";
export type Profile = {
  id: string;
  name: string;
  email?: string;
  role: "admin" | "employee";
  playful_reactions?: boolean;
  avatar_id?: string | null;
  access_status: "pending" | "active" | "blocked";
};
export type Task = {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: "low" | "medium" | "high";
  assignee_id: string;
  created_by: string;
  original_deadline: string | null;
  deadline: string | null;
  created_at: string;
  completed_at: string | null;
  completed_late: boolean;
  archived_at: string | null;
  version: number;
  deadline_changes: number;
  return_count: number;
  ever_overdue: boolean;
};
export type DeadlineRequest = {
  id: string;
  task_id: string;
  requested_by: string;
  proposed_deadline: string;
  reason: string;
  status: string;
  created_at: string;
};
export type Event = {
  id: string;
  task_id: string;
  actor_id: string | null;
  actor_name?: string;
  event_type: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};
export type Comment = {
  id: string;
  task_id: string;
  author_id: string;
  author_name?: string;
  content: string;
  created_at: string;
};
export type Notification = {
  id: string;
  task_id: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
};
export type Data = {
  profile: Profile;
  profiles: Profile[];
  tasks: Task[];
  requests: DeadlineRequest[];
  events: Event[];
  comments: Comment[];
  notifications: Notification[];
  serverNow: string;
};
export const statuses: { id: Status; label: string; caption: string }[] = [
  {
    id: "todo",
    label: "Нужно сделать",
    caption: "Всё начинается с первого шага",
  },
  { id: "progress", label: "В работе", caption: "Идеи становятся результатом" },
  { id: "review", label: "На проверке", caption: "Остался последний взгляд" },
  { id: "done", label: "Готово", caption: "Хорошая работа. Двигаемся дальше" },
];
export function overdue(task: Task, now = Date.now()) {
  return (
    task.status !== "done" &&
    !!task.deadline &&
    new Date(task.deadline).getTime() < now
  );
}
export function date(value: string | null, time = false) {
  return value
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
        timeZone: "Europe/Moscow",
      }).format(new Date(value))
    : "Срок не установлен";
}
export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}
export const eventLabels: Record<string, string> = {
  created: "Создана задача",
  updated: "Обновлены данные задачи",
  status: "Изменён статус",
  deadline_requested: "Предложен срок",
  deadline_approved: "Срок согласован",
  deadline_rejected: "Срок отклонён",
  deadline_set: "Установлен срок",
  overdue: "Зафиксирована просрочка",
  archived: "Задача архивирована",
  restored: "Задача восстановлена",
};
