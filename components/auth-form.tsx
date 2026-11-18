"use client";
import { useState } from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { authAction } from "@/app/auth/actions";
export default function AuthForm({
  initialMode,
  callbackError,
}: {
  initialMode: string;
  callbackError: boolean;
}) {
  const [mode, setMode] = useState(initialMode),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      callbackError
        ? "Ссылка недействительна или истекла. Повторите запрос."
        : "",
    ),
    [message, setMessage] = useState("");
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await authAction(mode, form);
      if (res.redirect) window.location.assign(res.redirect);
      else {
        setError(res.error ?? "");
        setMessage(res.message ?? "");
      }
    } catch {
      setError("Не удалось связаться с сервером. Повторите попытку.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-art">
        <a className="wordmark" href="/">
          контур<span>®</span>
        </a>
        <div>
          <span className="eyebrow">МЕСТО ДЛЯ ОБЩЕГО ДЕЛА</span>
          <h1>
            В одном
            <br />
            <em>контуре.</em>
          </h1>
          <p>
            Меньше вопросов о статусе.
            <br />
            Больше движения вперёд.
          </p>
        </div>
        <div className="orbit-art" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <ArrowUpRight />
        </div>
        <footer>Задачи. Люди. Ответственность.</footer>
      </section>
      <section className="auth-panel">
        <div className="auth-box">
          <span className="eyebrow">ВАША КОМАНДА НАЧИНАЕТСЯ ЗДЕСЬ</span>
          <h2>
            {mode === "login"
              ? "С возвращением"
              : mode === "signup"
                ? "Присоединиться"
                : mode === "reset"
                  ? "Восстановить пароль"
                  : "Новый пароль"}
          </h2>
          <p>
            {mode === "login"
              ? "Войдите, чтобы продолжить общее дело."
              : mode === "signup"
                ? "После регистрации администратор откроет вам доступ."
                : mode === "reset"
                  ? "Отправим ссылку на вашу почту."
                  : "Придумайте пароль от 8 символов."}
          </p>
          <form action={submit}>
            {mode === "signup" && (
              <label>
                Ваше имя
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Имя Фамилия"
                />
              </label>
            )}
            {mode !== "update" && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.ru"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Пароль
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 8}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="Не менее 8 символов"
                />
              </label>
            )}
            {(mode === "signup" || mode === "update") && (
              <label>
                Повторите пароль
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="success" role="status">
                {message}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Подождите…"
                : mode === "login"
                  ? "Войти"
                  : mode === "signup"
                    ? "Создать аккаунт"
                    : mode === "reset"
                      ? "Отправить ссылку"
                      : "Сохранить пароль"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-links">
            {mode === "login" ? (
              <>
                <button onClick={() => setMode("reset")}>Забыли пароль?</button>
                <button
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setMessage("");
                  }}
                >
                  Создать аккаунт <ArrowUpRight size={14} />
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMode("login");
                  setError("");
                  setMessage("");
                }}
              >
                Вернуться ко входу
              </button>
            )}
          </div>
          <small>Доступ к рабочим данным — только участникам команды.</small>
        </div>
      </section>
    </main>
  );
}
