"use client";
import { useState } from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { authAction } from "@/app/auth/actions";
export default function AuthForm({
  initialMode,
  callbackError,
  available,
  previewEnabled,
}: {
  initialMode: string;
  callbackError: boolean;
  available: boolean;
  previewEnabled: boolean;
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
      <section className="auth-image-panel" aria-label="Нуарное кабаре">
        <a
          className="auth-portrait-brand wordmark"
          href="/"
          aria-label="Контур — на главную"
        >
          контур<span>®</span>
        </a>
        <figure className="auth-portrait">
          <div className="auth-portrait-label">
            <span>NOIR CABARET</span>
            <span>КОНТУР / 01</span>
          </div>
          <img
            src="/loginscreen.png"
            alt="Нуарная героиня в красном платье"
            width={1192}
            height={1320}
          />
          <figcaption>
            <span>У каждого дела — свой ритм.</span>
            <em>
              Добро пожаловать
              <br />
              за кулисы.
            </em>
          </figcaption>
        </figure>
        <span className="auth-portrait-footer">
          ОБЩЕЕ ДЕЛО. ОСОБАЯ АТМОСФЕРА.
        </span>
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
              ? "Единый вход для администратора и сотрудников."
              : mode === "signup"
                ? "После регистрации администратор откроет вам доступ."
                : mode === "reset"
                  ? "Отправим ссылку на вашу почту."
                  : "Придумайте пароль от 8 символов."}
          </p>
          {!available && (
            <p className="auth-unavailable" role="status">
              Вход и регистрация пока не подключены. Владелец сайта настраивает
              авторизацию. После подключения здесь смогут войти и администратор,
              и сотрудники.
            </p>
          )}
          {previewEnabled && (
            <div className="auth-preview">
              <strong>Локальная проверка интерфейса</strong>
              <p>
                Без регистрации и сохранения задач. На проде этих кнопок нет.
              </p>
              <a className="outline" href="/preview?role=admin">
                Открыть как администратор →
              </a>
              <a className="outline" href="/preview?role=employee">
                Открыть как сотрудник →
              </a>
            </div>
          )}
          <form action={submit}>
            <fieldset disabled={!available || busy} className="auth-fields">
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
            </fieldset>
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
