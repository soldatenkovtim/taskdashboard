import { devPreviewEnabled } from "./dev-preview";
import { statuses, type Data, type Profile, type Task } from "./types";

export function previewData(
  count: 5 | 15 | 30,
  role: "admin" | "employee",
): Data {
  if (!devPreviewEnabled())
    throw Error("Предпросмотр доступен только в локальной разработке");
  const now = Date.now();
  const iso = (days: number) => new Date(now + days * 86400000).toISOString();
  const profiles: Profile[] = [
    {
      id: "demo-admin",
      name: "Администратор · демо",
      email: "admin@example.test",
      role: "admin",
      access_status: "active",
    },
    {
      id: "demo-employee",
      name: "Анна · демо",
      email: "anna@example.test",
      role: "employee",
      access_status: "active",
    },
    {
      id: "demo-other",
      name: "Марк · демо",
      email: "mark@example.test",
      role: "employee",
      access_status: "active",
    },
  ];
  const tasks: Task[] = Array.from({ length: count }, (_, i) => ({
    id: `demo-${String(i + 1).padStart(4, "0")}`,
    title:
      [
        "Подготовить материалы проекта",
        "Проверить мобильную версию",
        "Согласовать описание результата",
        "Обновить документацию команды",
      ][i % 4] + ` · ${i + 1}`,
    description: "Демонстрационные данные. Сохранение отключено.",
    status: statuses[i % 4].id,
    priority: i % 5 === 0 ? "high" : "medium",
    assignee_id: profiles[(i + 1) % profiles.length].id,
    created_by: "demo-admin",
    original_deadline: iso(-2),
    deadline: iso((i % 3) - 1),
    created_at: iso(-5),
    completed_at: i % 4 === 3 ? iso(0) : null,
    completed_late: i % 8 === 3,
    archived_at: null,
    version: 1,
    deadline_changes: i % 3,
    return_count: 0,
    ever_overdue: i % 3 === 0,
  }));
  return {
    profile: profiles[role === "admin" ? 0 : 1],
    profiles,
    tasks,
    requests: tasks
      .filter((t) => t.status === "progress")
      .map((t) => ({
        id: `request-${t.id}`,
        task_id: t.id,
        requested_by: t.assignee_id,
        proposed_deadline: iso(2),
        reason: "Нужно дополнительное время для проверки материалов.",
        status: "pending",
        created_at: iso(-1),
      })),
    events: [],
    comments: [],
    notifications: [],
    serverNow: iso(0),
  };
}
