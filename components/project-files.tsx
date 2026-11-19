"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { FileText, Link2, Search, Download } from "lucide-react";
import {
  MATERIAL_BUCKET,
  MAX_FILE_SIZE,
  validMaterialUrl,
  type Material,
  type FileProject,
  type MaterialComment,
} from "@/lib/materials";
import { date, type Task } from "@/lib/types";

async function operation(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "Не удалось сохранить материал");
  return result;
}
export default function ProjectFiles({
  task,
  tasks = [],
  preview = false,
}: {
  task?: Task;
  tasks?: Task[];
  preview?: boolean;
}) {
  const [materials, setMaterials] = useState<Material[]>([]),
    [projects, setProjects] = useState<FileProject[]>([]);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [adding, setAdding] = useState(false);
  const [project, setProject] = useState(""),
    [newProject, setNewProject] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState("");
  const [kind, setKind] = useState("file"),
    [url, setUrl] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [linkedTask, setLinkedTask] = useState("");
  const [selected, setSelected] = useState<Material | null>(null),
    [comments, setComments] = useState<MaterialComment[]>([]),
    [comment, setComment] = useState("");
  const request = useRef(0);
  const commentRequest = useRef(0);
  const load = useCallback(async () => {
    if (preview) return;
    const version = ++request.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        project: filter,
        page: String(page),
      });
      if (task) params.set("task", task.id);
      const response = await fetch(`/api/materials?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (version !== request.current) return;
      setMaterials(data.materials);
      setProjects(data.projects);
      setTotal(data.total);
    } catch (e) {
      if (version === request.current) setError((e as Error).message);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [task?.id, task?.status, preview, query, filter, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(timer);
      ++request.current;
    };
  }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    let created: string | null = null;
    try {
      if (kind === "file" && (!file || !file.size || file.size > MAX_FILE_SIZE))
        throw Error("Выберите непустой файл размером до 25 МБ");
      if (kind === "link" && !validMaterialUrl(url))
        throw Error("Нужна корректная ссылка http:// или https://");
      const projectId =
        project === "new"
          ? (await operation("project", { name: newProject.trim() })).id
          : project;
      setProject(projectId);
      const result = await operation("add", {
        project_id: projectId,
        task_id: task?.id || linkedTask || null,
        title: title.trim(),
        description,
        kind,
        url: kind === "link" ? url.trim() : null,
        file_name: file?.name,
      });
      created = result.id;
      if (kind === "file" && file) {
        const db = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        );
        const { error } = await db.storage
          .from(MATERIAL_BUCKET)
          .upload(result.path, file, {
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (error) throw Error(`Файл не загружен: ${error.message}`);
        await operation("finalize", { id: result.id });
      }
      setAdding(false);
      setTitle("");
      setDescription("");
      setFile(null);
      setUrl("");
      setNewProject("");
      await load();
    } catch (e) {
      setError(
        `${(e as Error).message}${created ? " Материал не опубликован. При завершённой загрузке можно повторить подтверждение в списке вложений задачи." : ""}`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function showComments(material: Material) {
    const version = ++commentRequest.current;
    setSelected(material);
    setComments([]);
    setComment("");
    setError("");
    try {
      const result = await operation("comments", { id: material.id });
      if (version === commentRequest.current) setComments(result.comments);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function download(material: Material) {
    setBusy(true);
    setError("");
    try {
      const result = await operation("download", { id: material.id });
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`project-files ${task ? "task-materials" : ""}`}
      aria-label={task ? "Материалы задачи" : "Файлы проектов"}
    >
      <header className="files-heading">
        <div>
          <h2>{task ? "Материалы задачи" : "Файлы проектов"}</h2>
          <p>
            {task
              ? task.status === "done"
                ? "Задача принята: новые материалы сразу появятся в хранилище."
                : "Приложите результат работы. До принятия его видят только исполнитель и администратор."
              : "Документы, ссылки и пояснения — по проектам. Здесь хранятся принятые результаты и материалы, добавленные напрямую."}
          </p>
        </div>
        <button
          className="outline"
          onClick={() => setAdding(!adding)}
          disabled={preview || busy}
        >
          {adding ? "Скрыть форму" : "Добавить материал"}
        </button>
      </header>
      {preview && (
        <p className="files-notice">
          Хранилище станет доступно после подключения Supabase и применения
          миграции 009. Файлы в предпросмотре не сохраняются.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Обновить
          </button>
        </p>
      )}
      {adding && (
        <form className="files-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <label>
              Проект
              <select
                required
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">Выберите проект</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="new">Новый проект…</option>
              </select>
            </label>
            {project === "new" && (
              <label>
                Название проекта
                <input
                  required
                  maxLength={120}
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                />
              </label>
            )}
            <label>
              Тип материала
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="file">Файл: Word, Excel, PDF и другие</option>
                <option value="link">Ссылка: GitHub, документ, ресурс</option>
              </select>
            </label>
            <label>
              Название
              <input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {kind === "file" ? (
              <label>
                Файл · до 25 МБ
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !title) setTitle(f.name);
                  }}
                />
              </label>
            ) : (
              <label>
                Ссылка
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/…"
                />
              </label>
            )}
            <label>
              Что это и зачем
              <textarea
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Что находится внутри, для чего использовать, важные детали"
              />
            </label>
            {!task && (
              <label>
                Связанная задача
                <select
                  value={linkedTask}
                  onChange={(e) => setLinkedTask(e.target.value)}
                >
                  <option value="">
                    Без задачи / материал старого проекта
                  </option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      КТ–{t.id.slice(0, 4)} · {t.title}
                      {t.status === "done"
                        ? " · Принята"
                        : " · Ожидает принятия"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!task &&
              linkedTask &&
              tasks.find((t) => t.id === linkedTask)?.status !== "done" && (
                <p className="files-notice">
                  До принятия этот материал будет доступен в выбранной задаче,
                  но не в общем хранилище.
                </p>
              )}
            <button className="primary" type="submit">
              {busy ? "Сохраняем…" : "Сохранить материал"}
            </button>
          </fieldset>
        </form>
      )}
      <div className="files-filters">
        <label>
          <Search size={16} />
          <input
            aria-label="Поиск материалов"
            placeholder="Название, описание или имя файла"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Фильтр по проекту"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Все проекты</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="files-notice" role="status">
          Загружаем материалы…
        </p>
      ) : (
        !materials.length &&
        !error && (
          <p className="files-notice">
            {query || filter
              ? "Материалы не найдены."
              : "Материалов пока нет. Добавьте файл или ссылку."}
          </p>
        )
      )}
      <div className="files-list">
        {materials.map((m) => (
          <article className="file-row" key={m.id}>
            {m.kind === "file" ? <FileText size={22} /> : <Link2 size={22} />}
            <div className="file-info">
              <h3>{m.title}</h3>
              <span>
                {projects.find((p) => p.id === m.project_id)?.name} ·{" "}
                {m.author_name} · {date(m.created_at)}
              </span>
              {m.task_id && (
                <small>
                  Задача КТ–{m.task_id.slice(0, 4).toUpperCase()}
                  {tasks.find((t) => t.id === m.task_id)
                    ? ` · ${tasks.find((t) => t.id === m.task_id)?.title}`
                    : ""}
                </small>
              )}
              {m.description && <p>{m.description}</p>}
              {!m.published_at && (
                <small>
                  {m.ready
                    ? "Ожидает принятия задачи"
                    : "Загрузка не подтверждена"}
                </small>
              )}
            </div>
            <div className="file-actions">
              {m.kind === "link" && m.url && validMaterialUrl(m.url) ? (
                <a href={m.url} target="_blank" rel="noopener noreferrer">
                  Открыть ссылку
                </a>
              ) : m.ready ? (
                <button disabled={busy} onClick={() => void download(m)}>
                  <Download size={15} />
                  Скачать
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await operation("finalize", { id: m.id });
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Подтвердить загрузку
                </button>
              )}
              <button onClick={() => void showComments(m)}>Обсуждение</button>
            </div>
          </article>
        ))}
      </div>
      {total > 50 && (
        <div className="files-pagination">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Назад
          </button>
          <span>
            {page + 1} / {Math.ceil(total / 50)}
          </span>
          <button
            disabled={(page + 1) * 50 >= total}
            onClick={() => setPage(page + 1)}
          >
            Далее
          </button>
        </div>
      )}
      {selected && (
        <section className="file-discussion">
          <header>
            <h3>Обсуждение: {selected.title}</h3>
            <button
              onClick={() => {
                ++commentRequest.current;
                setSelected(null);
              }}
            >
              Закрыть
            </button>
          </header>
          {comments.length ? (
            comments.map((c) => (
              <article key={c.id}>
                <strong>{c.author_name}</strong>
                <time>{date(c.created_at, true)}</time>
                <p>{c.content}</p>
              </article>
            ))
          ) : (
            <p>Комментариев пока нет.</p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await operation("comment", {
                  id: selected.id,
                  content: comment,
                });
                setComment("");
                await showComments(selected);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Комментарий
              <textarea
                required
                maxLength={4000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <button className="outline" disabled={busy || !comment.trim()}>
              Добавить комментарий
            </button>
          </form>
        </section>
      )}
    </section>
  );
}
