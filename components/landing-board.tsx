"use client";

import { useRef, useState } from "react";
import { Check, Clock } from "lucide-react";
import Avatar from "@/components/avatar";
import ReactionPopup, {
  type ReactionInstance,
} from "@/components/reaction-popup";
import { configFor } from "@/lib/reactions";
import { statuses, type Status } from "@/lib/types";

// Only local sample state. No workspace data, API calls or persistence.
const examples = [
  {
    status: "todo",
    id: "0101",
    title: "Собрать материалы для проекта",
    name: "Анна Смирнова",
    deadline: "21 нояб.",
  },
  {
    status: "progress",
    id: "0102",
    title: "Подготовить первый макет",
    name: "Марк Волков",
    deadline: "20 нояб.",
    pending: true,
  },
  {
    status: "review",
    id: "0103",
    title: "Проверить тексты",
    name: "Ирина Белова",
    deadline: "18 нояб.",
    late: true,
  },
  {
    status: "done",
    id: "0104",
    title: "Согласовать структуру",
    name: "Анна Смирнова",
    deadline: "17 нояб.",
  },
];

export default function LandingBoard() {
  const [accepted, setAccepted] = useState(false);
  const [reaction, setReaction] = useState<ReactionInstance | null>(null);
  const [mobileStatus, setMobileStatus] = useState<Status>("review");
  const sequence = useRef(0);
  const repeatButton = useRef<HTMLButtonElement>(null);
  const acceptButton = useRef<HTMLButtonElement>(null);

  function accept() {
    if (accepted) return;
    setAccepted(true);
    setMobileStatus("done");
    const config = configFor("task_accepted", "admin");
    if (config)
      setReaction({
        id: ++sequence.current,
        expiresAt: Date.now() + config.durationMs,
        config,
      });
    requestAnimationFrame(() =>
      repeatButton.current?.focus({ preventScroll: true }),
    );
  }
  function repeat() {
    setReaction(null);
    setAccepted(false);
    setMobileStatus("review");
    requestAnimationFrame(() =>
      acceptButton.current?.focus({ preventScroll: true }),
    );
  }

  return (
    <div className="landing-demo">
      <div className="landing-demo-bar">
        <strong>Задачи команды</strong>
        <span>Демонстрационные данные · 19 ноября</span>
      </div>
      <div className="landing-demo-controls">
        <p aria-live="polite">
          {accepted
            ? "Задача принята и перемещена в «Готово»."
            : "Примите задачу на проверке — и посмотрите реакцию героини."}
        </p>
        {accepted && (
          <button
            ref={repeatButton}
            className="landing-demo-repeat"
            onClick={repeat}
          >
            Повторить демонстрацию
          </button>
        )}
      </div>
      <div
        className="landing-board-tabs"
        aria-label="Колонки демонстрационной доски"
      >
        {statuses.map((status) => (
          <button
            key={status.id}
            aria-pressed={mobileStatus === status.id}
            onClick={() => setMobileStatus(status.id)}
          >
            {status.label}
          </button>
        ))}
      </div>
      <div
        className="landing-board-scroll"
        tabIndex={0}
        role="region"
        aria-label="Демонстрационная канбан-доска"
      >
        <div className="kanban">
          {statuses.map((status) => {
            const tasks = examples.filter(
              (item) =>
                (accepted && item.id === "0103" ? "done" : item.status) ===
                status.id,
            );
            return (
              <div
                className={`kanban-column ${status.id} ${mobileStatus === status.id ? "demo-selected" : ""}`}
                key={status.id}
              >
                <div className="column-header">
                  <span className="status-marker">
                    {status.id === "done" && <Check size={10} />}
                  </span>
                  <h3>{status.label}</h3>
                  <span className="column-count">{tasks.length}</span>
                </div>
                <div className="column-tasks">
                  {tasks.map((task) => (
                    <article
                      key={task.id}
                      className={`task-card ${task.late && !accepted ? "is-late" : ""}`}
                    >
                      <div className="card-open">
                        <span className="card-meta">КТ–{task.id}</span>
                        <h4>{task.title}</h4>
                        {task.pending && (
                          <span className="pending-label">
                            <Clock size={12} />
                            Срок на согласовании
                          </span>
                        )}
                        <div className="card-deadline">
                          <Clock size={14} />
                          <span>Срок: {task.deadline}</span>
                          {task.late && (
                            <b>{accepted ? "С опозданием" : "Просрочено"}</b>
                          )}
                        </div>
                      </div>
                      <footer>
                        <span className="assignee">
                          <Avatar small name={task.name} />
                          {task.name}
                        </span>
                      </footer>
                      {task.id === "0103" && !accepted && (
                        <button
                          ref={acceptButton}
                          className="landing-demo-accept"
                          onClick={accept}
                        >
                          Принять задачу
                        </button>
                      )}
                    </article>
                  ))}
                  {!tasks.length && (
                    <p className="landing-demo-empty">Все задачи проверены.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <section
        className="landing-demo-history"
        aria-labelledby="demo-history-title"
      >
        <div className="landing-history-heading">
          <h3 id="demo-history-title">История задачи</h3>
          <span>КТ–0104 · Согласовать структуру · Завершена в срок</span>
        </div>
        <ol className="landing-timeline">
          {[
            {
              label: "Задача создана",
              person: "Анна Смирнова",
              time: "14 нояб., 10:00",
              iso: "2026-11-14T10:00:00+03:00",
            },
            {
              label: "Срок согласован",
              person: "Марк Волков",
              time: "15 нояб., 12:30",
              iso: "2026-11-15T12:30:00+03:00",
            },
            {
              label: "Задача завершена",
              person: "Анна Смирнова",
              time: "17 нояб., 16:40",
              iso: "2026-11-17T16:40:00+03:00",
            },
          ].map((event) => (
            <li key={event.label}>
              <strong>{event.label}</strong>
              <time dateTime={event.iso}>{event.time}</time>
              <span>{event.person}</span>
            </li>
          ))}
        </ol>
      </section>
      <ReactionPopup
        reaction={reaction}
        onClose={() => {
          const restoreFocus =
            document.activeElement?.closest(".reaction-popup");
          setReaction(null);
          if (restoreFocus)
            repeatButton.current?.focus({ preventScroll: true });
        }}
      />
    </div>
  );
}
