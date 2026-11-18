"use client";
import { useState, useRef, useEffect } from "react";
import {
  X,
  ArrowRight,
  Clock,
  Check,
  Archive,
  RotateCcw,
  Send,
  PenLine,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import Avatar from "./avatar";
import { TaskSelect, TaskDateTime } from "./task-fields";
import ReactMarkdown from "react-markdown";
import type { Data, Task } from "@/lib/types";
import { statuses, overdue, date, eventLabels } from "@/lib/types";
import { durations } from "@/lib/metrics";
import type { Mutate } from "./dashboard";
export function Overlay({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="drawer"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="drawer-inner">
        <header>
          <span>{title}</span>
          <button
            className="icon-button"
            aria-label="Закрыть панель"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
function localInput(value: string | null) {
  return value
    ? new Date(Date.parse(value) + 3 * 3600000).toISOString().slice(0, 16)
    : "";
}
function utc(value: FormDataEntryValue | null) {
  return value ? new Date(`${value}:00+03:00`).toISOString() : null;
}
export function TaskForm({
  data,
  task,
  mutate,
  busy,
  onDone,
}: {
  data: Data;
  task?: Task;
  mutate: Mutate;
  busy: boolean;
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [baseVersion] = useState(task?.version);
  const admin = data.profile.role === "admin";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      priority: form.get("priority"),
      assignee_id: admin ? form.get("assignee_id") : data.profile.id,
      ...(!task
        ? { deadline: utc(form.get("deadline")) }
        : { id: task.id, version: baseVersion }),
    };
    if (await mutate(task ? "update" : "create", payload)) onDone();
    else
      setError(
        "Не удалось сохранить. Проверьте сообщение об ошибке и повторите попытку.",
      );
  }
  return (
    <form className="task-form" onSubmit={submit}>
      <span className="eyebrow">
        {task ? "УТОЧНИМ ДЕТАЛИ" : "ПЕРВЫЙ ШАГ К РЕЗУЛЬТАТУ"}
      </span>
      <h2>{task ? "Редактировать задачу" : "Что нужно сделать?"}</h2>
      <label>
        Название <span>*</span>
        <input
          autoFocus
          name="title"
          required
          maxLength={200}
          placeholder="Например, подготовить концепцию"
          defaultValue={task?.title}
        />
      </label>
      <label>
        Описание
        <textarea
          name="description"
          rows={5}
          maxLength={20000}
          placeholder="Контекст, ожидаемый результат, полезные ссылки…"
          defaultValue={task?.description}
        />
        <small>
          Поддерживается Markdown: **жирный**, *курсив*, списки и ссылки.
        </small>
      </label>
      <div className="form-grid">
        {admin && (
          <TaskSelect
            label="Исполнитель *"
            name="assignee_id"
            defaultValue={task?.assignee_id ?? data.profile.id}
            options={data.profiles
              .filter((p) => p.access_status === "active")
              .map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
        <TaskSelect
          label="Приоритет"
          name="priority"
          defaultValue={task?.priority ?? "medium"}
          options={[
            { value: "low", label: "Низкий" },
            { value: "medium", label: "Обычный" },
            { value: "high", label: "Высокий" },
          ]}
        />
      </div>
      {!task && (
        <TaskDateTime
          label={admin ? "Дедлайн *" : "Предложить дедлайн *"}
          required
          name="deadline"
          hint={
            admin
              ? "Укажите дату и время по Москве."
              : "Время по Москве. Срок станет официальным после согласования."
          }
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="outline" type="button" onClick={onDone}>
          Отмена
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Сохраняем…" : task ? "Сохранить" : "Создать задачу"}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
export function TaskDrawer({
  task: t,
  data,
  mutate,
  busy,
  now,
  error,
  onClose,
}: {
  task: Task;
  data: Data;
  mutate: Mutate;
  busy: boolean;
  now: number;
  error: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [deadlineForm, setDeadlineForm] = useState(false),
    [returnForm, setReturnForm] = useState(false),
    [comment, setComment] = useState("");
  const admin = data.profile.role === "admin",
    assignee = data.profiles.find((p) => p.id === t.assignee_id),
    request = data.requests.find(
      (r) => r.task_id === t.id && r.status === "pending",
    ),
    metrics = durations(t, data.events, now);
  const entries = [
    ...data.events
      .filter((e) => e.task_id === t.id)
      .map((e) => ({ ...e, kind: "event" as const })),
    ...data.comments
      .filter((c) => c.task_id === t.id)
      .map((c) => ({ ...c, kind: "comment" as const })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const act = (action: string, payload: Record<string, unknown> = {}) =>
    mutate(action, { id: t.id, version: t.version, ...payload });
  const hours = (ms: number) =>
    ms < 3600000
      ? `${Math.max(0, Math.round(ms / 60000))} мин`
      : `${Math.round((ms / 3600000) * 10) / 10} ч`;
  if (editing)
    return (
      <TaskForm
        data={data}
        task={t}
        mutate={mutate}
        busy={busy}
        onDone={() => setEditing(false)}
      />
    );
  return (
    <div className="task-detail">
      <div className="detail-topline">
        <span className={`priority ${t.priority}`}>
          {t.priority === "high"
            ? "↑ Высокий приоритет"
            : t.priority === "low"
              ? "↓ Низкий приоритет"
              : "— Обычный приоритет"}
        </span>
        {admin && !t.archived_at && t.status !== "done" && (
          <button
            className="icon-button"
            aria-label="Редактировать задачу"
            onClick={() => setEditing(true)}
          >
            <PenLine size={17} />
          </button>
        )}
      </div>
      <h2>{t.title}</h2>
      <div className="detail-properties">
        <span>Статус</span>
        <strong>
          {statuses.find((s) => s.id === t.status)?.label}
          {t.archived_at && " · В архиве"}
        </strong>
        <span>Исполнитель</span>
        <strong className="assignee">
          <Avatar
            small
            name={assignee?.name ?? "Участник"}
            avatar={assignee?.avatar_id}
          />
          {assignee?.name ?? "Участник"}
        </strong>
        <span>Дедлайн</span>
        <strong className={overdue(t, now) ? "text-red" : ""}>
          <CalendarDays size={15} />
          {date(t.deadline, true)}
        </strong>
        {t.original_deadline && (
          <>
            <span>Первоначальный</span>
            <strong>{date(t.original_deadline, true)}</strong>
          </>
        )}
      </div>
      {overdue(t, now) && (
        <div className="deadline-warning">
          <Clock size={18} />
          <span>Срок прошёл. Задача остаётся активной до принятия.</span>
        </div>
      )}
      {t.completed_late && (
        <div className="deadline-warning">
          Принята с опозданием · {date(t.completed_at, true)}
        </div>
      )}
      {t.ever_overdue && !overdue(t, now) && (
        <p className="history-note">
          В истории задачи зафиксирована просрочка.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!t.archived_at && (
        <div className="status-actions">
          {t.status === "todo" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void act("status", { status: "progress" })}
            >
              Начать работу
              <ArrowRight size={16} />
            </button>
          )}
          {t.status === "progress" && (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void act("status", { status: "review" })}
              >
                Отправить на проверку
                <Check size={16} />
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void act("status", { status: "todo" })}
              >
                Вернуть в «Нужно сделать»
              </button>
            </>
          )}
          {t.status === "review" && admin && (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Принять задачу? Время завершения и соблюдение срока будут зафиксированы.",
                    )
                  )
                    void act("status", { status: "done" });
                }}
              >
                Принять работу
                <Check size={16} />
              </button>
              <button
                className="outline"
                onClick={() => setReturnForm(!returnForm)}
              >
                На доработку
              </button>
            </>
          )}
          {t.status === "review" && !admin && (
            <p className="muted">Задача ждёт проверки администратора.</p>
          )}
        </div>
      )}
      {returnForm && (
        <form
          className="inset-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await act("status", {
                status: "progress",
                reason: f.get("reason"),
              })
            )
              setReturnForm(false);
          }}
        >
          <label>
            Что нужно доработать?
            <textarea name="reason" required maxLength={4000} rows={3} />
          </label>
          <button className="primary" disabled={busy}>
            Вернуть в работу
          </button>
        </form>
      )}
      {request && (
        <div className="deadline-request">
          <span className="eyebrow">СРОК НА СОГЛАСОВАНИИ</span>
          <h3>{date(request.proposed_deadline, true)}</h3>
          <p>{request.reason || "Предложен первоначальный срок"}</p>
          <small>Официальный срок не изменится до принятия запроса.</small>
          {admin && !t.archived_at && t.status !== "done" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await act("approve", {
                  request_id: request.id,
                  deadline: utc(f.get("deadline")),
                });
              }}
            >
              <TaskDateTime
                label="Предложенная или другая дата"
                name="deadline"
                defaultValue={localInput(request.proposed_deadline)}
                required
              />
              <div className="form-actions">
                <button
                  className="outline"
                  type="button"
                  disabled={busy}
                  onClick={() => void act("reject", { request_id: request.id })}
                >
                  Отклонить
                </button>
                <button className="primary" disabled={busy}>
                  Согласовать
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {!request && !t.archived_at && t.status !== "done" && (
        <button
          className="deadline-button"
          onClick={() => setDeadlineForm(!deadlineForm)}
        >
          <CalendarDays size={15} />
          {admin
            ? "Установить или изменить срок"
            : t.deadline
              ? "Запросить перенос срока"
              : "Предложить срок"}
          <ArrowUpRight size={14} />
        </button>
      )}
      {deadlineForm && (
        <form
          className="inset-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await act(admin ? "set_deadline" : "request_deadline", {
                deadline: utc(f.get("deadline")),
                reason: f.get("reason"),
              })
            )
              setDeadlineForm(false);
          }}
        >
          <TaskDateTime
            label="Новый срок · по Москве"
            name="deadline"
            defaultValue={localInput(t.deadline)}
            required
          />
          {!admin && (
            <label>
              Причина {t.deadline ? "*" : "(необязательно)"}
              <textarea
                name="reason"
                required={!!t.deadline}
                rows={3}
                maxLength={4000}
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            {admin ? "Установить срок" : "Отправить запрос"}
          </button>
        </form>
      )}
      <section className="description-section">
        <h3>О задаче</h3>
        {t.description ? (
          <div className="markdown">
            <ReactMarkdown>{t.description}</ReactMarkdown>
          </div>
        ) : (
          <p className="muted">Описание пока не добавлено.</p>
        )}
      </section>
      <details className="execution-metrics">
        <summary>
          История в цифрах <Clock size={14} />
        </summary>
        <dl>
          <dt>До начала работы</dt>
          <dd>{hours(metrics.wait)}</dd>
          <dt>В работе</dt>
          <dd>{hours(metrics.progress)}</dd>
          <dt>На проверке</dt>
          <dd>{hours(metrics.review)}</dd>
          <dt>Возвратов на доработку</dt>
          <dd>{t.return_count}</dd>
          <dt>Запросов срока</dt>
          <dd>{data.requests.filter((r) => r.task_id === t.id).length}</dd>
          <dt>Согласованных переносов</dt>
          <dd>{t.deadline_changes}</dd>
          {t.completed_at && (
            <>
              <dt>Завершена</dt>
              <dd>{date(t.completed_at, true)}</dd>
            </>
          )}
          {metrics.originalDelta !== null && (
            <>
              <dt>От исходного срока</dt>
              <dd>
                {metrics.originalDelta > 0 ? "+" : "−"}
                {hours(Math.abs(metrics.originalDelta))}
              </dd>
            </>
          )}
          {metrics.lastDelta !== null && (
            <>
              <dt>От последнего срока</dt>
              <dd>
                {metrics.lastDelta > 0 ? "+" : "−"}
                {hours(Math.abs(metrics.lastDelta))}
              </dd>
            </>
          )}
        </dl>
      </details>
      <section className="activity-section">
        <h3>
          Движение задачи <span>{entries.length}</span>
        </h3>
        {entries.map((e) => {
          const author = data.profiles.find(
            (p) => p.id === (e.kind === "comment" ? e.author_id : e.actor_id),
          );
          return (
            <div key={e.id} className={`activity-entry ${e.kind}`}>
              <span className="activity-dot" />
              <div>
                <header>
                  <strong>
                    {(e.kind === "comment" ? e.author_name : e.actor_name) ??
                      author?.name ??
                      (e.kind === "event" && e.event_type === "overdue"
                        ? "Система"
                        : "Участник команды")}
                  </strong>
                  <time>{date(e.created_at, true)}</time>
                </header>
                {e.kind === "comment" ? (
                  <p>{e.content}</p>
                ) : (
                  <>
                    <p>
                      {eventLabels[e.event_type] ?? e.event_type}
                      {e.event_type === "status" &&
                        ` → ${statuses.find((s) => s.id === e.new_value?.status)?.label ?? ""}`}
                    </p>
                    {typeof e.new_value?.reason === "string" &&
                      e.new_value.reason && (
                        <blockquote>{e.new_value.reason}</blockquote>
                      )}
                    {!!e.new_value?.deadline && (
                      <small>
                        {date(String(e.new_value.deadline), true)}
                        {e.previous_value?.deadline
                          ? ` · было ${date(String(e.previous_value.deadline), true)}`
                          : ""}
                      </small>
                    )}
                    {e.event_type === "updated" && (
                      <details>
                        <summary>Изменения</summary>
                        <pre>
                          {JSON.stringify(
                            { было: e.previous_value, стало: e.new_value },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>
      {!t.archived_at && (
        <form
          className="comment-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act("comment", { content: comment })) setComment("");
          }}
        >
          <label htmlFor="comment">Расскажите, как идут дела</label>
          <textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
            maxLength={5000}
            rows={3}
            placeholder="Что сделано, что осталось, где нужна помощь…"
          />
          <div>
            <small>Обновления остаются в истории.</small>
            <button className="primary" disabled={busy || !comment.trim()}>
              <Send size={15} />
              Отправить
            </button>
          </div>
        </form>
      )}
      {admin && (
        <button
          className="archive-button"
          disabled={busy}
          onClick={async () => {
            if (
              window.confirm(
                t.archived_at
                  ? "Восстановить задачу на доске?"
                  : "Архивировать задачу? История и факты просрочек сохранятся.",
              )
            ) {
              if (await act(t.archived_at ? "restore" : "archive")) onClose();
            }
          }}
        >
          {t.archived_at ? <RotateCcw size={15} /> : <Archive size={15} />}{" "}
          {t.archived_at ? "Восстановить задачу" : "Переместить в архив"}
        </button>
      )}
    </div>
  );
}
