"use client";
import { useRef, useState } from "react";
import { reactionConfig, type ReactionEvent } from "@/lib/reactions";
import ReactionPopup, {
  type ReactionInstance,
} from "@/components/reaction-popup";
const labels: Record<ReactionEvent, string> = {
  visit_streak_8_broken: "Прервана серия из 8–15 дней",
  visit_streak: "8 дней подряд с нами",
  visit_streak_16: "16 дней подряд с нами",
  visit_streak_broken: "Возвращение после прерывания серии из 16+ дней",
  tasks_created_milestone: "Поставлено 10 задач за 3 дня",
  tasks_completed_milestone: "Выполнено 10 задач за 3 дня",
  task_created: "Задача создана",
  task_assigned: "Задача назначена",
  task_accepted: "Работа принята",
  task_completed_on_time: "Выполнено вовремя",
  task_completed_late: "Выполнено с опозданием",
  task_returned: "Возврат на доработку",
  deadline_approved: "Новый срок согласован",
};
export default function ReactionsPage() {
  const [reaction, setReaction] = useState<ReactionInstance | null>(null);
  const serial = useRef(0);
  return (
    <main className="reaction-gallery">
      <a href="/workspace" className="eyebrow">
        ← В рабочее пространство
      </a>
      <header>
        <span className="eyebrow">КОНТУР / NOIR CABARET</span>
        <h1>
          У каждого дела —<br />
          <em>своя реакция.</em>
        </h1>
        <p>
          Маленькие сцены и особые достижения. Выберите реакцию, чтобы увидеть
          её в действии.
        </p>
      </header>
      <div className="reaction-gallery-grid">
        {reactionConfig.map((config) => (
          <article key={`${config.event}-${config.audience}`}>
            <img
              src={config.mediaPath?.replace(".gif", "-poster.webp")}
              alt="Нуарная героиня с красными губами"
              loading="lazy"
              width={320}
              height={426}
            />
            <div>
              <span className="eyebrow">
                {config.audience === "admin" ? "Администратор" : "Сотрудник"}
              </span>
              <h2>{config.title}</h2>
              <p>{labels[config.event]}</p>
              <button
                className="outline"
                onClick={() =>
                  setReaction({
                    id: ++serial.current,
                    config,
                    expiresAt: Date.now() + config.durationMs,
                  })
                }
              >
                ▶ Посмотреть реакцию
              </button>
            </div>
          </article>
        ))}
      </div>
      <ReactionPopup reaction={reaction} onClose={() => setReaction(null)} />
    </main>
  );
}
