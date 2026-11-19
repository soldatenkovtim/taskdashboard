"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutGrid,
  FolderOpen,
  ChartNoAxesCombined,
  CheckCheck,
  Users,
  Archive,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownUp,
  Bell,
  LogOut,
  ChevronDown,
  ArrowRight,
  SlidersHorizontal,
  Clock,
  MessageSquare,
  Check,
  AlertCircle,
  X,
  PanelLeftClose,
  Menu,
  ArrowDown,
  Settings2,
  Link2,
} from "lucide-react";
import ProjectFiles from "./project-files";
import NoirCharacter from "./noir-character";
import { flawlessWeek } from "@/lib/noir-character";
import type { Data, Task, Status } from "@/lib/types";
import { statuses, overdue, date } from "@/lib/types";
import { authAction } from "@/app/auth/actions";
import { Overlay, TaskDrawer, TaskForm } from "./task-drawer";
import ReactionPopup, { type ReactionInstance } from "./reaction-popup";
import Avatar from "./avatar";
import { avatars, validAvatar } from "@/lib/avatars";
import MusicPlayer from "./music-player";
import {
  adminReaction,
  configFor,
  ReactionInbox,
  type ReactionConfig,
} from "@/lib/reactions";
export type Mutate = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<boolean>;
type View = "files" | "board" | "overview" | "approvals" | "team" | "archive";
const nav = [
  { id: "board", label: "Доска задач", icon: LayoutGrid },
  { id: "overview", label: "Обзор команды", icon: ChartNoAxesCombined },
  { id: "approvals", label: "Согласования", icon: CheckCheck },
  { id: "team", label: "Команда", icon: Users },
  { id: "archive", label: "Архив", icon: Archive },
  { id: "files", label: "Файлы проектов", icon: FolderOpen },
] as const;
const notificationLabels: Record<string, string> = {
  assigned: "Вам назначена задача",
  deadline_requested: "Новый запрос срока",
  deadline_approved: "Срок согласован",
  deadline_rejected: "Срок отклонён",
  review: "Задача ждёт проверки",
  accepted: "Задача принята",
  returned: "Задача возвращена на доработку",
};
export default function Dashboard({
  setup = false,
  previewRole = "admin",
  previewData,
}: {
  setup?: boolean;
  previewRole?: "admin" | "employee";
  previewData?: Data;
}) {
  const [data, setData] = useState<Data | null>(
      setup ? (previewData ?? null) : null,
    ),
    [view, setView] = useState<View>("board"),
    [loading, setLoading] = useState(!setup),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [person, setPerson] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [lateOnly, setLateOnly] = useState(false),
    [metricFilter, setMetricFilter] = useState<
      "" | "active" | "done" | "on-time" | "changed" | "week"
    >(""),
    [sort, setSort] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [setupOpen, setSetupOpen] = useState(false),
    [notifications, setNotifications] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [mobileCol, setMobileCol] = useState<Status>("todo"),
    [busy, setBusy] = useState(false),
    // SSR and hydration must use the same timestamp, including at a deadline.
    [clock, setClock] = useState(() =>
      setup && previewData ? Date.parse(previewData.serverNow) : 0,
    );
  const [profileOpen, setProfileOpen] = useState(false),
    [preferenceBusy, setPreferenceBusy] = useState(false),
    [preferenceError, setPreferenceError] = useState(""),
    [reaction, setReaction] = useState<ReactionInstance | null>(null);
  const boardToolbar = useRef<HTMLDivElement>(null);
  const [boardJump, setBoardJump] = useState(0);
  useEffect(() => {
    if (!boardJump || view !== "board") return;
    boardToolbar.current?.focus({ preventScroll: true });
    boardToolbar.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [boardJump, view]);
  const inbox = useRef(new ReactionInbox()),
    reactionSerial = useRef(0),
    dataRef = useRef<Data | null>(null),
    loadSequence = useRef(0);
  const showReaction = useCallback((config: ReactionConfig | null) => {
    if (config && !document.hidden)
      setReaction({
        id: ++reactionSerial.current,
        expiresAt:
          Date.now() + Math.max(3000, Math.min(6000, config.durationMs)),
        config,
      });
  }, []);
  const visitRequest = useRef(false);
  useEffect(() => {
    if (
      setup ||
      !data ||
      data.profile.access_status !== "active" ||
      visitRequest.current
    )
      return;
    visitRequest.current = true;
    void fetch("/api/visit", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (
          result.reaction === "visit_streak_16" ||
          result.reaction === "visit_streak_broken" ||
          result.reaction === "visit_streak_8_broken"
        )
          showReaction(configFor(result.reaction, data.profile.role));
        else if (result.reward)
          showReaction(configFor("visit_streak", data.profile.role));
      })
      .catch(() => {});
  }, [setup, data, showReaction]);
  const clockOffset = useRef(0),
    mutationLock = useRef(false);
  const load = useCallback(async () => {
    if (setup) return;
    const sequence = ++loadSequence.current;
    try {
      const r = await fetch("/api/data", { cache: "no-store" });
      const value = await r.json();
      if (r.status === 401) {
        window.location.assign("/auth");
        return;
      }
      if (!r.ok) throw Error(value.error);
      if (sequence !== loadSequence.current) return;
      if (value.serverNow) {
        clockOffset.current = Date.parse(value.serverNow) - Date.now();
        setClock(Date.parse(value.serverNow));
      }
      dataRef.current = value;
      const nextReaction = inbox.current.observe(value);
      if (value.profile.access_status !== "active") setReaction(null);
      else showReaction(nextReaction);
      setData(value);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, [setup, showReaction]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!mutationLock.current) void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    setClock(Date.now() + clockOffset.current);
    const timer = setInterval(
      () => setClock(Date.now() + clockOffset.current),
      10000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const mutate: Mutate = async (action, payload) => {
    if (setup) {
      setSetupOpen(true);
      return false;
    }
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const value = await r.json();
      if (!r.ok) throw Error(value.error);
      showReaction(adminReaction(action, payload, dataRef.current));
      await load();
      setToast("Сохранено");
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить изменения",
      );
      return false;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  };
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  useEffect(() => {
    if (!setup) return;
    try {
      const saved = localStorage.getItem(
        `kontur.preview.avatar.${previewRole}`,
      );
      setPreviewAvatar(validAvatar(saved) ? saved : null);
    } catch {
      setPreviewAvatar(null);
    }
  }, [setup, previewRole]);
  async function saveAvatar(avatar_id: string | null) {
    if (setup) {
      setPreviewAvatar(avatar_id);
      try {
        if (avatar_id)
          localStorage.setItem(
            `kontur.preview.avatar.${previewRole}`,
            avatar_id,
          );
        else localStorage.removeItem(`kontur.preview.avatar.${previewRole}`);
        setPreferenceError("");
      } catch {
        setPreferenceError(
          "Браузер запретил сохранение. Аватарка выбрана до перезагрузки.",
        );
      }
      return;
    }
    if (!dataRef.current || mutationLock.current) return;
    mutationLock.current = true;
    setPreferenceBusy(true);
    setPreferenceError("");
    ++loadSequence.current;
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_id }),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error);
      const current = dataRef.current;
      const updated = {
        ...current,
        profile: { ...current.profile, avatar_id: value.avatar_id },
        profiles: current.profiles.map((p) =>
          p.id === current.profile.id
            ? { ...p, avatar_id: value.avatar_id }
            : p,
        ),
      };
      dataRef.current = updated;
      setData(updated);
    } catch (e) {
      setPreferenceError(
        e instanceof Error ? e.message : "Не удалось сохранить аватар",
      );
    } finally {
      setPreferenceBusy(false);
      mutationLock.current = false;
    }
  }
  const admin = setup
      ? previewRole === "admin"
      : data?.profile.role === "admin",
    tasks = data?.tasks ?? [],
    profiles = data?.profiles ?? [],
    pending = (data?.requests ?? []).filter((r) => r.status === "pending"),
    active = tasks.filter((t) => !t.archived_at && t.status !== "done"),
    late = active.filter((t) => overdue(t, clock)),
    unread = (data?.notifications ?? []).filter((n) => !n.is_read).length;
  const nowMoscow = new Date(clock + 3 * 3600000);
  const weekStart = new Date(
    Date.UTC(
      nowMoscow.getUTCFullYear(),
      nowMoscow.getUTCMonth(),
      nowMoscow.getUTCDate() - ((nowMoscow.getUTCDay() + 6) % 7),
    ) -
      3 * 3600000,
  ).getTime();
  const doneWeek = tasks.filter(
    (t) => t.completed_at && Date.parse(t.completed_at) >= weekStart,
  );
  const filtered = tasks
    .filter(
      (t) =>
        (view === "archive"
          ? !!t.archived_at
          : metricFilter && metricFilter !== "active"
            ? true
            : !t.archived_at) &&
        t.title.toLowerCase().includes(query.toLowerCase()) &&
        (!person || t.assignee_id === person) &&
        (!statusFilter || t.status === statusFilter) &&
        (!lateOnly ||
          (view === "archive" ? t.completed_late : overdue(t, clock))) &&
        (!metricFilter ||
          (metricFilter === "active"
            ? t.status !== "done"
            : metricFilter === "changed"
              ? t.deadline_changes > 0
              : metricFilter === "week"
                ? !!t.completed_at && Date.parse(t.completed_at) >= weekStart
                : metricFilter === "on-time"
                  ? t.status === "done" && !!t.deadline && !t.completed_late
                  : t.status === "done")),
    )
    .sort((a, b) =>
      sort
        ? (a.deadline ? Date.parse(a.deadline) : Infinity) -
          (b.deadline ? Date.parse(b.deadline) : Infinity)
        : b.created_at.localeCompare(a.created_at),
    );
  const task = tasks.find((t) => t.id === selected);
  function navigate(v: View) {
    setView(v);
    setMobileNav(false);
    setQuery("");
    setLateOnly(false);
    setPerson("");
    setStatusFilter("");
    setMetricFilter("");
  }
  function showMetric(
    personId: string,
    metric: typeof metricFilter,
    overdueOnly = false,
  ) {
    navigate("board");
    setPerson(personId);
    setMetricFilter(metric);
    setLateOnly(overdueOnly);
    if (["done", "on-time", "week"].includes(metric)) setMobileCol("done");
  }
  async function move(id: string, status: Status) {
    const t = tasks.find((t) => t.id === id);
    if (!t || t.status === status) return;
    if (
      status === "done" &&
      !window.confirm("Принять задачу и зафиксировать результат?")
    )
      return;
    if (t.status === "review" && status === "progress") {
      setSelected(id);
      setToast("Укажите причину возврата в карточке задачи");
      return;
    }
    await mutate("status", { id, version: t.version, status });
  }
  const newTask = () => (setup ? setSetupOpen(true) : setCreating(true));
  if (data?.profile.access_status && data.profile.access_status !== "active")
    return (
      <main className="waiting">
        <a className="wordmark" href="/">
          контур<span>®</span>
        </a>
        <Clock size={38} />
        <h1>
          {data.profile.access_status === "pending"
            ? "Вы почти в команде"
            : "Доступ приостановлен"}
        </h1>
        <p>
          {data.profile.name},{" "}
          {data.profile.access_status === "pending"
            ? "администратор ещё не подтвердил ваш доступ. Эта страница обновится автоматически."
            : "обратитесь к администратору команды."}
        </p>
        <button
          className="outline"
          onClick={async () => {
            await authAction("logout", new FormData());
            window.location.assign("/auth");
          }}
        >
          Выйти
        </button>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-top">
          <a className="wordmark" href="/">
            контур<span>®</span>
          </a>
          <button
            className="icon-button mobile-only"
            aria-label="Закрыть меню"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">к.</span>
          <div>
            <strong>Общее дело</strong>
            <small>Рабочее пространство</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-caption">ПРОСТРАНСТВО</span>
        <nav>
          {nav
            .filter((n) => admin || n.id === "board" || n.id === "files")
            .map((n) => (
              <button
                key={n.id}
                className={view === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} />
                {n.label}
                {n.id === "approvals" && pending.length > 0 && (
                  <span className="nav-count">{pending.length}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection">
            <i className={setup ? "offline" : ""} />
            {setup ? "База не подключена" : "Рабочее пространство"}
          </div>
          <button
            className="profile-button"
            onClick={() => setProfileOpen(true)}
          >
            <Avatar
              name={data?.profile.name ?? "Ваш аккаунт"}
              avatar={setup ? previewAvatar : data?.profile.avatar_id}
            />
            <span>
              <strong>{data?.profile.name ?? "Ваш аккаунт"}</strong>
              <small>{admin ? "Администратор" : "Сотрудник"}</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Закрыть меню"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              aria-label="Открыть меню"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Рабочее пространство</span>
            <span className="slash">/</span>
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Intl.DateTimeFormat("ru-RU", {
                day: "numeric",
                month: "long",
                timeZone: "Europe/Moscow",
              }).format(clock)}
            </span>
            <button
              className="notification-button icon-button"
              aria-label={`Уведомления: ${unread} непрочитанных`}
              onClick={() => setNotifications(true)}
            >
              <Bell size={18} />
              {unread > 0 && <i />}
            </button>
          </div>
          <MusicPlayer
            autoplayKey={
              !setup && data?.profile.id
                ? `login.${data.profile.id}`
                : undefined
            }
          />
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <h1>
                {view === "files"
                  ? "Файлы проектов"
                  : view === "board"
                    ? "Дела идут."
                    : view === "overview"
                      ? "Вся картина."
                      : view === "approvals"
                        ? "Договоримся."
                        : view === "team"
                          ? "Наши люди."
                          : "Всё на месте."}
                <span className="heading-spark">✳</span>
              </h1>
              <p>
                {view === "files"
                  ? "Документы, ссылки и результаты работы — по проектам."
                  : view === "board"
                    ? "От первой идеи до последней галочки. Всё в одном контуре."
                    : view === "overview"
                      ? "Как движется команда и где нужна ваша помощь."
                      : view === "approvals"
                        ? "Сроки меняются открыто. Каждое решение остаётся в истории."
                        : view === "team"
                          ? "У каждого своя роль. У всех — общее дело."
                          : "Завершённые главы тоже заслуживают своего места."}
              </p>
            </div>
            <button className="primary create-button" onClick={newTask}>
              <Plus size={18} />
              Новая задача
            </button>
          </div>
          {view === "overview" && (
            <section className="stats-strip" aria-label="Состояние задач">
              <button
                onClick={() => {
                  navigate("board");
                  setMetricFilter("active");
                }}
              >
                <span>
                  Активные задачи
                  <ArrowUpRight size={15} />
                </span>
                <strong>{active.length.toString().padStart(2, "0")}</strong>
                <small>В движении прямо сейчас</small>
              </button>
              <button
                className="late-stat"
                onClick={() => {
                  navigate("board");
                  setLateOnly(true);
                }}
              >
                <span>
                  Просрочены
                  <AlertCircle size={15} />
                </span>
                <strong>
                  {late.length.toString().padStart(2, "0")}
                  <i />
                </strong>
                <small>Нуждаются во внимании</small>
              </button>
              <button onClick={() => navigate(admin ? "approvals" : "board")}>
                <span>
                  На согласовании
                  <Clock size={15} />
                </span>
                <strong>{pending.length.toString().padStart(2, "0")}</strong>
                <small>Ждут решения по срокам</small>
              </button>
              <button
                onClick={() => {
                  navigate("board");
                  setMetricFilter("week");
                  setMobileCol("done");
                }}
              >
                <span>
                  Готово за неделю
                  <CheckCheck size={16} />
                </span>
                <strong>{doneWeek.length.toString().padStart(2, "0")}</strong>
                <small>Поводов сказать «сделано»</small>
              </button>
            </section>
          )}
          {setup && (
            <div className="setup-banner">
              <span className="setup-symbol">
                <Link2 size={17} />
              </span>
              <div>
                <strong>
                  Локальный предпросмотр —{" "}
                  {admin ? "администратор" : "сотрудник"}
                </strong>
                <span>
                  Это проверка интерфейса без входа и сохранения данных. Для
                  работы с задачами подключите Supabase.
                </span>
              </div>
              <button onClick={() => setSetupOpen(true)}>
                Подключить <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          {setup && (
            <div className="preview-switch">
              <a href="/preview?role=admin">Предпросмотр администратора</a>
              <a href="/preview?role=employee">Предпросмотр сотрудника</a>
              <a href="/auth">К настоящему входу →</a>
              {admin && (
                <button
                  className="outline"
                  onClick={() =>
                    showReaction(configFor("visit_streak", previewRole))
                  }
                >
                  Показать награду за 8 дней
                </button>
              )}
            </div>
          )}
          {setup && (
            <div className="preview-density">
              Демо-нагрузка:{" "}
              {[5, 15, 30].map((count) => (
                <a
                  key={count}
                  href={`/preview?role=${previewRole}&count=${count}`}
                >
                  {count} задач
                </a>
              ))}{" "}
              · Запись данных отключена
            </div>
          )}
          {error && (
            <div className="error global-error" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
              <button onClick={() => void load()}>Обновить</button>
              <button
                className="icon-button"
                aria-label="Закрыть сообщение"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "files" && (
            <ProjectFiles tasks={data?.tasks ?? []} preview={setup} />
          )}
          {(view === "overview" || (view === "board" && !admin)) && data && !loading && !error && (() => {
            const visible = tasks.filter(t => (admin || t.assignee_id === data.profile.id) && (!person || t.assignee_id === person));
            const overdueTasks = visible.filter(t => !t.archived_at && overdue(t, clock));
            if (overdueTasks.length) return (
              <NoirCharacter context={view === "board" ? "board" : "overview"} state="disappointed" size="medium" caption="Кажется, у нас разговор">
                <p>Просроченных задач: {overdueTasks.length}</p>
                <button onClick={() => {
                  showMetric(person || (admin ? "" : data.profile.id), "", true);
                  setBoardJump(value => value + 1);
                  setMobileCol(overdueTasks[0].status);
                }}>Посмотреть просроченные <ArrowRight size={14} aria-hidden="true" /></button>
              </NoirCharacter>
            );
            return view === "overview" && flawlessWeek(visible, weekStart, clock) ? (
              <NoirCharacter context="overview" state="celebrating" caption="Какое прекрасное выступление" />
            ) : null;
          })()}
          {(view === "board" || view === "archive") && (
            <>
              <div className="board-toolbar" ref={boardToolbar} tabIndex={-1} aria-label="Фильтры и результаты доски">
                <div className="board-view">
                  <LayoutGrid size={16} />
                  <strong>
                    {view === "archive" ? "Архив задач" : lateOnly ? "Просроченные задачи" : "Все задачи"}
                  </strong>
                  <span>{filtered.length}</span>
                </div>
                <div className="board-controls">
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      placeholder="Найти задачу…"
                      aria-label="Поиск по названию"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd>⌕</kbd>
                  </label>
                  {admin && (
                    <select
                      aria-label="Фильтр по исполнителю"
                      value={person}
                      onChange={(e) => setPerson(e.target.value)}
                    >
                      <option value="">Все участники</option>
                      {profiles
                        .filter((p) => p.access_status === "active")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    aria-label="Показать просроченные задачи"
                    aria-pressed={lateOnly}
                    className={`tool-button ${lateOnly ? "selected" : ""}`}
                    onClick={() => setLateOnly(!lateOnly)}
                  >
                    <SlidersHorizontal size={15} />
                    <span>
                      {view === "archive" ? "С опозданием" : "Просроченные"}
                    </span>
                  </button>
                  <button
                    className={`icon-button ${sort ? "selected" : ""}`}
                    title="Сначала ближайший срок"
                    aria-label="Сортировать по сроку"
                    aria-pressed={sort}
                    onClick={() => setSort(!sort)}
                  >
                    <ArrowDownUp size={16} />
                  </button>
                </div>
              </div>
              {view === "board" && (
                <div className="mobile-columns">
                  {statuses.map((s) => (
                    <button
                      key={s.id}
                      className={mobileCol === s.id ? "active" : ""}
                      onClick={() => setMobileCol(s.id)}
                    >
                      {s.label}
                      <span>
                        {filtered.filter((t) => t.status === s.id).length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {lateOnly && (
                <div className="filter-indicator" role="status">
                  {view === "archive" ? "Завершены с опозданием" : "Только просроченные задачи"} · Найдено: {filtered.length}
                  <button onClick={() => { setLateOnly(false); setMetricFilter(""); }}>Сбросить фильтр просрочки</button>
                </div>
              )}
              {metricFilter && (
                <div className="filter-indicator">
                  Выборка:{" "}
                  {
                    {
                      active: "Активные",
                      done: "Завершённые",
                      "on-time": "Завершены в срок",
                      changed: "С переносами сроков",
                      week: "Готово за неделю",
                    }[metricFilter]
                  }
                  <button onClick={() => setMetricFilter("")}>Сбросить</button>
                </div>
              )}
              {statusFilter && (
                <div className="filter-indicator">
                  Статус: {statuses.find((s) => s.id === statusFilter)?.label}
                  <button onClick={() => setStatusFilter("")}>
                    <X size={14} />
                    Сбросить
                  </button>
                </div>
              )}
              {view === "board" && data && !loading && !error && !tasks.some(t => !t.archived_at && (admin || t.assignee_id === data.profile.id)) && (
                <NoirCharacter context="board" state="playful" caption="Ну что, начнём?" />
              )}
              {view === "archive" ? (
                <div
                  className="archive-list"
                  role="region"
                  aria-label="Архив задач"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Задача</th>
                        <th>Исполнитель</th>
                        <th>Завершена</th>
                        <th>Первый срок</th>
                        <th>Финальный срок</th>
                        <th>Результат</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <button onClick={() => setSelected(t.id)}>
                              {t.title}
                            </button>
                          </td>
                          <td>
                            {profiles.find((p) => p.id === t.assignee_id)
                              ?.name ?? "Участник"}
                          </td>
                          <td>
                            {t.completed_at
                              ? date(t.completed_at, true)
                              : "Не завершена"}
                          </td>
                          <td>{date(t.original_deadline, true)}</td>
                          <td>{date(t.deadline, true)}</td>
                          <td className={t.completed_late ? "text-red" : ""}>
                            {t.completed_late
                              ? "С опозданием"
                              : t.status === "done"
                                ? "В срок"
                                : "Не завершена"}
                          </td>
                          <td>
                            {admin && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void mutate("restore", {
                                    id: t.id,
                                    version: t.version,
                                  })
                                }
                              >
                                Восстановить
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    data && !loading && !error && !tasks.some(t => t.archived_at) ?
                      <NoirCharacter context="archive" caption="История ещё не написана" /> :
                      <p className="compact-empty">Архивных задач не найдено.</p>
                  )}
                </div>
              ) : (
                <section className="kanban">
                  {statuses.map((s) => {
                    const items = filtered.filter((t) => t.status === s.id);
                    return (
                      <div
                        key={s.id}
                        className={`kanban-column ${s.id} ${mobileCol === s.id ? "mobile-active" : ""}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          void move(e.dataTransfer.getData("text/plain"), s.id);
                        }}
                      >
                        <div className="column-header">
                          <span className="status-marker">
                            {s.id === "done" && <Check size={10} />}
                          </span>
                          <h2>{s.label}</h2>
                          <span className="column-count">{items.length}</span>
                          <button
                            className="icon-button"
                            aria-label={`Создать задачу`}
                            onClick={newTask}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <p className="column-caption">{s.caption}</p>
                        <div className="column-tasks">
                          {loading ? (
                            <>
                              <div className="skeleton" />
                              <div className="skeleton" />
                            </>
                          ) : items.length ? (
                            items.map((t) => (
                              <article
                                key={t.id}
                                draggable={!busy && !t.archived_at}
                                onDragStart={(e) =>
                                  e.dataTransfer.setData("text/plain", t.id)
                                }
                                className={`task-card ${overdue(t, clock) ? "is-late" : ""}`}
                              >
                                <button
                                  className="card-open"
                                  onClick={() => setSelected(t.id)}
                                >
                                  <div className="card-meta">
                                    <span className={`priority ${t.priority}`}>
                                      {t.priority === "high"
                                        ? "↑ Высокий"
                                        : t.priority === "low"
                                          ? "↓ Низкий"
                                          : "— Обычный"}
                                    </span>
                                    <span>
                                      КТ–{t.id.slice(0, 4).toUpperCase()}
                                    </span>
                                  </div>
                                  <h3>{t.title}</h3>
                                  {t.description && <p>{t.description}</p>}
                                  {pending.some((r) => r.task_id === t.id) && (
                                    <span className="pending-label">
                                      <Clock size={12} />
                                      Срок на согласовании
                                    </span>
                                  )}
                                  <div className="card-deadline">
                                    <Clock size={13} />
                                    <span>{date(t.deadline)}</span>
                                    {overdue(t, clock) && <b>Просрочено</b>}
                                    {t.completed_late && <b>С опозданием</b>}
                                  </div>
                                </button>
                                <footer>
                                  <span className="assignee">
                                    <Avatar
                                      small
                                      name={
                                        profiles.find(
                                          (p) => p.id === t.assignee_id,
                                        )?.name ?? "Участник"
                                      }
                                      avatar={
                                        profiles.find(
                                          (p) => p.id === t.assignee_id,
                                        )?.avatar_id
                                      }
                                    />
                                    {profiles
                                      .find((p) => p.id === t.assignee_id)
                                      ?.name.split(" ")[0] ?? "Участник"}
                                  </span>
                                  <button
                                    className="card-comments"
                                    onClick={() => setSelected(t.id)}
                                    aria-label="Открыть обсуждение"
                                  >
                                    <MessageSquare size={13} />
                                    {data?.comments.filter(
                                      (c) => c.task_id === t.id,
                                    ).length ?? 0}
                                  </button>
                                  <select
                                    aria-label={`Статус задачи ${t.title}`}
                                    value={t.status}
                                    disabled={
                                      busy ||
                                      !!t.archived_at ||
                                      t.status === "done"
                                    }
                                    onChange={(e) =>
                                      void move(t.id, e.target.value as Status)
                                    }
                                  >
                                    {statuses.map((x) => (
                                      <option
                                        key={x.id}
                                        value={x.id}
                                        disabled={
                                          (x.id === "done" && !admin) ||
                                          (t.status === "review" &&
                                            x.id === "progress" &&
                                            !admin)
                                        }
                                      >
                                        {x.label}
                                      </option>
                                    ))}
                                  </select>
                                </footer>
                              </article>
                            ))
                          ) : (
                            <div className="column-empty">
                              <strong>
                                {query || lateOnly || person || statusFilter
                                  ? "Ничего не найдено"
                                  : s.id === "todo"
                                    ? "Нет новых задач"
                                    : s.id === "progress"
                                      ? "Нет задач в работе"
                                      : s.id === "review"
                                        ? "Нет задач на проверке"
                                        : "Нет завершённых задач"}
                              </strong>
                              <p>
                                {query || lateOnly || person || statusFilter
                                  ? "Попробуйте изменить фильтры"
                                  : s.id === "todo"
                                    ? "Добавьте задачу — и первый шаг уже сделан."
                                    : s.id === "progress"
                                      ? "Начатые задачи появятся в этой колонке."
                                      : s.id === "review"
                                        ? "Готовая работа ждёт здесь принятия."
                                        : "Принятые задачи появятся здесь."}
                              </p>
                              {s.id === "todo" && (
                                <button onClick={newTask}>
                                  <Plus size={14} />
                                  Добавить задачу
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {items.length > 0 && s.id === "todo" && (
                          <button className="add-task" onClick={newTask}>
                            <Plus size={14} />
                            Добавить задачу
                          </button>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}
              <div className="board-footer">
                <span>
                  <span className="tiny-dot" />{" "}
                  {setup
                    ? "Готовы начать общее дело"
                    : "У каждого дела есть свой контур"}
                </span>
                <span>Сроки по Москве · UTC+3</span>
              </div>
            </>
          )}
          {view === "approvals" && admin && (
            <section className="list-section approvals-list">
              <h2>
                Ожидают решения <span>{pending.length}</span>
              </h2>
              {!pending.length && (
                data && !loading && !error ?
                  <NoirCharacter context="approvals" state="playful" caption="Сегодня никаких переговоров" /> :
                  <p className="compact-empty">Данные согласований пока недоступны.</p>
              )}
              {pending.map((r) => {
                const t = tasks.find((t) => t.id === r.task_id);
                return (
                  t && (
                    <article className="approval-item" key={r.id}>
                      <button
                        className="approval-title"
                        onClick={() => setSelected(t.id)}
                      >
                        {t.title}
                      </button>
                      <p className="muted">
                        {profiles.find((p) => p.id === t.assignee_id)?.name ??
                          "Участник"}{" "}
                        · Запрос от {date(r.created_at, true)}
                      </p>
                      <dl>
                        <div>
                          <dt>Текущий срок</dt>
                          <dd>{date(t.deadline, true)}</dd>
                        </div>
                        <div>
                          <dt>Предложен</dt>
                          <dd>{date(r.proposed_deadline, true)}</dd>
                        </div>
                      </dl>
                      <p>{r.reason || "Предложен первоначальный срок"}</p>
                      <div className="approval-actions">
                        <button
                          className="primary"
                          disabled={
                            busy || !!t.archived_at || t.status === "done"
                          }
                          onClick={() =>
                            void mutate("approve", {
                              id: t.id,
                              version: t.version,
                              request_id: r.id,
                            })
                          }
                        >
                          Согласовать
                        </button>
                        <button
                          className="outline"
                          disabled={
                            busy || !!t.archived_at || t.status === "done"
                          }
                          onClick={() =>
                            void mutate("reject", {
                              id: t.id,
                              version: t.version,
                              request_id: r.id,
                            })
                          }
                        >
                          Отклонить
                        </button>
                        <button
                          className="outline"
                          onClick={() => setSelected(t.id)}
                        >
                          Предложить другую дату
                        </button>
                      </div>
                    </article>
                  )
                );
              })}
              <h2 className="approval-history-title">История согласований</h2>
              {!(data?.requests ?? []).some((r) => r.status !== "pending") && (
                <p className="compact-empty">Обработанных запросов пока нет.</p>
              )}
              {(data?.requests ?? [])
                .filter((r) => r.status !== "pending")
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((r) => {
                  const t = tasks.find((t) => t.id === r.task_id);
                  return (
                    <article
                      className="approval-item approval-history"
                      key={r.id}
                    >
                      <button
                        className="approval-title"
                        onClick={() => setSelected(r.task_id)}
                      >
                        {t?.title ?? "Задача"}
                      </button>
                      <p>
                        {r.status === "approved" ? "Согласовано" : "Отклонено"}{" "}
                        · Предлагался срок {date(r.proposed_deadline, true)}
                      </p>
                      <p className="muted">
                        {profiles.find((p) => p.id === t?.assignee_id)?.name ??
                          "Участник"}{" "}
                        · Запрос от {date(r.created_at, true)}
                      </p>
                      <p>{r.reason}</p>
                    </article>
                  );
                })}
            </section>
          )}
          {(view === "team" || view === "overview") && (
            <section className="list-section">
              <div className="section-heading">
                <h2>
                  {view === "team"
                    ? "Участники пространства"
                    : "Команда в цифрах"}
                </h2>
                <span>{profiles.length} участников</span>
                {view === "overview" && person && (
                  <button onClick={() => setPerson("")}>Все участники</button>
                )}
              </div>
              {!profiles.length ? (
                <Empty
                  title="Знакомство впереди"
                  text="После подключения базы здесь появятся участники вашей команды."
                />
              ) : (
                profiles
                  .filter(
                    (p) => view !== "overview" || !person || p.id === person,
                  )
                  .map((p) => {
                    const ts = tasks.filter((t) => t.assignee_id === p.id),
                      completed = ts.filter((t) => t.status === "done"),
                      withDeadline = completed.filter((t) => t.deadline),
                      onTime = withDeadline.filter((t) => !t.completed_late);
                    return (
                      <div className="member-row" key={p.id}>
                        <Avatar name={p.name} avatar={p.avatar_id} />
                        <button
                          className="member-name"
                          onClick={() => {
                            navigate("board");
                            setPerson(p.id);
                          }}
                        >
                          <strong>{p.name}</strong>
                          <small>
                            {view === "team"
                              ? p.email
                              : p.role === "admin"
                                ? "Администратор"
                                : "Сотрудник"}
                          </small>
                        </button>
                        {view === "overview" ? (
                          <div className="member-metrics">
                            <button onClick={() => showMetric(p.id, "active")}>
                              <b>
                                {
                                  ts.filter(
                                    (t) =>
                                      !t.archived_at && t.status !== "done",
                                  ).length
                                }
                              </b>
                              активных
                            </button>
                            <button
                              className="text-red"
                              onClick={() => showMetric(p.id, "active", true)}
                            >
                              <b>
                                {
                                  ts.filter(
                                    (t) => !t.archived_at && overdue(t, clock),
                                  ).length
                                }
                              </b>
                              просрочено
                            </button>
                            <button onClick={() => showMetric(p.id, "done")}>
                              <b>{completed.length}</b>готово
                            </button>
                            <button onClick={() => showMetric(p.id, "on-time")}>
                              <b>
                                {withDeadline.length
                                  ? `${Math.round((onTime.length / withDeadline.length) * 100)}%`
                                  : "Нет данных"}
                              </b>
                              в срок
                            </button>
                            <button onClick={() => showMetric(p.id, "changed")}>
                              <b>
                                {ts.reduce((s, t) => s + t.deadline_changes, 0)}
                              </b>
                              переносов
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="member-workload">
                              <button
                                onClick={() => showMetric(p.id, "active")}
                              >
                                {
                                  ts.filter(
                                    (t) =>
                                      !t.archived_at && t.status !== "done",
                                  ).length
                                }{" "}
                                активных
                              </button>
                              <button
                                className="text-red"
                                onClick={() => showMetric(p.id, "active", true)}
                              >
                                {
                                  ts.filter(
                                    (t) => !t.archived_at && overdue(t, clock),
                                  ).length
                                }{" "}
                                просрочено
                              </button>
                              <button
                                onClick={() => {
                                  navigate("overview");
                                  setPerson(p.id);
                                }}
                              >
                                Показатели
                              </button>
                            </div>
                            <span className="member-status">
                              {p.role === "admin"
                                ? "Администратор"
                                : p.access_status === "active"
                                  ? "Доступ открыт"
                                  : p.access_status === "pending"
                                    ? "Ждёт подтверждения"
                                    : "Доступ закрыт"}
                            </span>
                            {p.role !== "admin" && (
                              <button
                                className="outline"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    p.access_status !== "active" ||
                                    window.confirm(
                                      `Закрыть доступ для ${p.name}?`,
                                    )
                                  )
                                    void mutate("access", {
                                      id: p.id,
                                      status:
                                        p.access_status === "active"
                                          ? "blocked"
                                          : "active",
                                    });
                                }}
                              >
                                {p.access_status === "active"
                                  ? "Закрыть доступ"
                                  : "Предоставить доступ"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
              )}
              {view === "team" && (
                <div className="team-invite">
                  <Users size={20} />
                  <div>
                    <strong>Пригласите коллег в общее дело</strong>
                    <p>
                      Отправьте им адрес приложения. После регистрации
                      подтвердите доступ здесь.
                    </p>
                  </div>
                  <button
                    className="outline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(`${location.origin}/auth`)
                        .then(() => setToast("Ссылка скопирована"))
                        .catch(() =>
                          setError(
                            "Не удалось скопировать ссылку. Скопируйте адрес из браузера.",
                          ),
                        );
                    }}
                  >
                    Копировать ссылку
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      <ReactionPopup reaction={reaction} onClose={() => setReaction(null)} />
      {profileOpen && (
        <Overlay onClose={() => setProfileOpen(false)} title="Ваш профиль">
          <div className="profile-settings">
            <h2>{data?.profile.name ?? "Ваш аккаунт"}</h2>
            <p>
              {data?.profile.email ??
                "Подключите Supabase для сохранения настроек профиля."}
            </p>
            <fieldset
              className="avatar-picker"
              disabled={preferenceBusy || busy}
            >
              <legend>Ваша аватарка</legend>
              <p>
                {setup
                  ? "В предпросмотре выбор сохраняется в этом браузере отдельно для каждой роли."
                  : "Выберите портрет — он сохранится автоматически."}
              </p>
              <div className="avatar-options">
                {[{ id: null, name: "Инициалы" }, ...avatars].map((option) => (
                  <button
                    type="button"
                    key={option.id ?? "initials"}
                    aria-label={option.name}
                    aria-pressed={
                      (setup
                        ? previewAvatar
                        : (data?.profile.avatar_id ?? null)) === option.id
                    }
                    onClick={() => void saveAvatar(option.id)}
                  >
                    <Avatar
                      name={data?.profile.name ?? "Ваш аккаунт"}
                      avatar={option.id}
                    />
                    <span>{option.name}</span>
                  </button>
                ))}
              </div>
              {preferenceBusy && <small role="status">Сохраняем…</small>}
            </fieldset>
            <div className="reaction-preference">
              <div>
                <strong>Реакции включены</strong>
                <p>
                  Автоматические реакции на рабочие события для всех участников.
                </p>
              </div>
            </div>
            <small>
              При уменьшении движения в настройках устройства — только текст.
            </small>
            {admin && (
              <a
                className="outline"
                href={setup ? "/reactions?preview=admin" : "/reactions"}
              >
                Посмотреть все реакции
              </a>
            )}
            {preferenceError && (
              <p className="error" role="alert">
                {preferenceError}
              </p>
            )}
            {!setup && (
              <button
                className="outline"
                onClick={() =>
                  void authAction("logout", new FormData()).then(() =>
                    window.location.assign("/auth"),
                  )
                }
              >
                <LogOut size={16} />
                Выйти из аккаунта
              </button>
            )}
          </div>
        </Overlay>
      )}
      {creating && data && (
        <Overlay onClose={() => setCreating(false)} title="Новая задача">
          <TaskForm
            data={data}
            mutate={mutate}
            busy={busy}
            onDone={() => setCreating(false)}
          />
        </Overlay>
      )}
      {task && data && (
        <Overlay
          onClose={() => setSelected(null)}
          title={`КТ–${task.id.slice(0, 4).toUpperCase()}`}
        >
          <TaskDrawer
            key={task.id}
            task={task}
            preview={setup}
            data={data}
            mutate={mutate}
            busy={busy}
            now={clock}
            error={error}
            onClose={() => setSelected(null)}
          />
        </Overlay>
      )}
      {setupOpen && (
        <Overlay
          onClose={() => setSetupOpen(false)}
          title="Подключение пространства"
        >
          <div className="setup-content">
            <span className="eyebrow">ОДИН РАЗ — И МОЖНО НАЧИНАТЬ</span>
            <h2>
              Дадим делам
              <br />
              <em>свой дом.</em>
            </h2>
            <p>
              Контур хранит данные команды в Supabase. Сейчас база ещё не
              подключена, поэтому задачи и аккаунты не создаются.
            </p>
            <ol>
              <li>
                <strong>Создайте проект Supabase</strong>
                <span>Бесплатного тарифа достаточно для начала.</span>
              </li>
              <li>
                <strong>Примените SQL-миграцию</strong>
                <span>
                  Файл supabase/migrations/001_initial.sql создаст таблицы и
                  правила доступа.
                </span>
              </li>
              <li>
                <strong>Добавьте настройки</strong>
                <span>
                  Скопируйте .env.example в .env.local и заполните URL,
                  публичный ключ и адрес приложения.
                </span>
              </li>
              <li>
                <strong>Создайте первый аккаунт</strong>
                <span>
                  Назначьте его администратором через защищённый SQL Editor по
                  инструкции в README.
                </span>
              </li>
            </ol>
            <a
              className="primary"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Открыть Supabase
              <ArrowUpRight size={16} />
            </a>
            <small>Подробная инструкция находится в README.md проекта.</small>
          </div>
        </Overlay>
      )}
      {notifications && (
        <Overlay onClose={() => setNotifications(false)} title="Уведомления">
          <div className="notification-list">
            {unread > 0 && (
              <button
                className="outline"
                disabled={busy}
                onClick={() => void mutate("read_notifications", {})}
              >
                Отметить всё прочитанным
              </button>
            )}
            {!data?.notifications?.length ? (
              <Empty
                title="Пока тихо"
                text="Здесь появятся назначения, запросы сроков и решения по задачам."
              />
            ) : (
              data.notifications
                .slice()
                .reverse()
                .map((n) => (
                  <button
                    key={n.id}
                    className={n.is_read ? "read" : ""}
                    onClick={() => {
                      if (n.task_id) setSelected(n.task_id);
                      setNotifications(false);
                    }}
                  >
                    <span className="tiny-dot" />
                    <div>
                      <strong>{notificationLabels[n.type] ?? n.type}</strong>
                      <p>
                        {tasks.find((t) => t.id === n.task_id)?.title ??
                          "Задача недоступна"}
                      </p>
                      <small>{date(n.created_at, true)}</small>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))
            )}
          </div>
        </Overlay>
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="little-star">✳</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
