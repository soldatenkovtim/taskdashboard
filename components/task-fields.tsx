"use client";

import { useId, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export function TaskSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  const [value, setValue] = useState(
    options.some((o) => o.value === defaultValue)
      ? defaultValue
      : (options[0]?.value ?? ""),
  );
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="task-field"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input type="hidden" name={name} value={value} />
      <button
        ref={trigger}
        id={id}
        type="button"
        className="task-field-trigger"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen(!open)}
      >
        <span>
          {options.find((o) => o.value === value)?.label ??
            "Нет доступных участников"}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <fieldset
          id={`${id}-options`}
          className="task-options"
          aria-label={label}
        >
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={value === option.value ? "selected" : ""}
              aria-pressed={value === option.value}
              onClick={() => {
                setValue(option.value);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function moscowToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
}

export function TaskDateTime({
  label,
  name,
  defaultValue = "",
  required = false,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(defaultValue.slice(0, 10));
  const [time, setTime] = useState(defaultValue.slice(11, 16) || "18:00");
  const [month, setMonth] = useState(
    () => new Date(`${defaultValue.slice(0, 10) || moscowToday()}T12:00:00`),
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1),
  );
  return (
    <div
      className="task-field"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        className="task-date-validation"
        name={name}
        value={day && time ? `${day}T${time}` : ""}
        required={required || !!day}
        tabIndex={-1}
        aria-label={label}
        onChange={() => {}}
        onInvalid={(e) => {
          e.preventDefault();
          setOpen(true);
          trigger.current?.focus();
        }}
      />
      <button
        ref={trigger}
        type="button"
        id={id}
        className="task-field-trigger"
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        onClick={() => setOpen(!open)}
      >
        <span className={day ? "" : "muted"}>
          {day
            ? `${day.split("-").reverse().join(".")}, ${time}`
            : "Выберите дату и время"}
        </span>
        <CalendarDays size={17} aria-hidden="true" />
      </button>
      {open && (
        <section
          className="task-calendar"
          id={`${id}-calendar`}
          aria-label="Выбор даты и времени"
        >
          <div className="task-calendar-heading">
            <strong aria-live="polite">
              {month.toLocaleDateString("ru-RU", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="task-calendar-grid">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
              <span key={d}>{d}</span>
            ))}
            {days.map((d) => (
              <button
                type="button"
                key={dateValue(d)}
                className={`${d.getMonth() !== month.getMonth() ? "outside" : ""} ${dateValue(d) === day ? "selected" : ""}`}
                aria-label={d.toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                aria-pressed={dateValue(d) === day}
                onClick={() => setDay(dateValue(d))}
              >
                {d.getDate()}
              </button>
            ))}
          </div>
          <div className="task-calendar-time">
            <label htmlFor={`${id}-time`}>Время · Москва</label>
            <input
              id={`${id}-time`}
              type="time"
              value={time}
              required={!!day}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="task-calendar-actions">
            <button
              type="button"
              onClick={() => {
                const today = moscowToday();
                setDay(today);
                setMonth(new Date(`${today}T12:00:00`));
              }}
            >
              Сегодня
            </button>
            {!required && (
              <button
                type="button"
                onClick={() => {
                  setDay("");
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                Без срока
              </button>
            )}
            <button
              type="button"
              className="primary"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Готово
            </button>
          </div>
        </section>
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}
