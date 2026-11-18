import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Контур — задачи команды",
  description:
    "Общее дело. Ясные сроки. Задачи, ответственность и движение команды в одном месте.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
