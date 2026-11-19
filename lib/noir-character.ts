import { overdue, type Task } from "./types";

export const characterMedia = {
  neutral: "/reactions/v2/another-one-done-poster.webp",
  happy: "/reactions/v2/good-job-poster.webp",
  playful: "/reactions/v2/its-a-date-poster.webp",
  disappointed: "/reactions/v2/youre-late-poster.webp",
  celebrating: "/reactions/v2/what-a-good-boss-poster.webp",
} as const;
export type CharacterState = keyof typeof characterMedia;
export function characterMood(tasks: Task[], now: number, userId: string, admin: boolean, ready: boolean): { state: CharacterState; caption: string } {
  if (!ready) return { state: "neutral", caption: "Я здесь, когда понадоблюсь" };
  const visible = tasks.filter(t => !t.archived_at && (admin || t.assignee_id === userId));
  if (!visible.length) return { state: "neutral", caption: "Жду ваших распоряжений" };
  if (visible.some(t => overdue(t, now))) return { state: "disappointed", caption: "Кажется, у нас разговор" };
  if (visible.every(t => t.status === "done")) return { state: "happy", caption: "Сегодня вы великолепны" };
  return { state: "playful", caption: "Дела идут, дорогой" };
}
export function flawlessWeek(tasks: Task[], start: number, end: number): boolean {
  const completed = tasks.filter(t => t.status === "done" && t.completed_at && Date.parse(t.completed_at) >= start && Date.parse(t.completed_at) <= end);
  return completed.length > 0 && completed.every(t => !!t.deadline && t.completed_late === false && Date.parse(t.completed_at!) <= Date.parse(t.deadline!));
}
