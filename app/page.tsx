import Link from "next/link";
import { ArrowUpRight, ArrowRight, Check, Music2 } from "lucide-react";
import MusicPlayer from "@/components/music-player";
import { configured, supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (configured()) {
    const db = await supabase();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) redirect("/workspace");
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="wordmark">
          контур<span>®</span>
        </Link>
        <nav aria-label="Главная навигация">
          <a href="#how-it-works">Как это работает</a>
          <Link href="/auth">
            Войти <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <div className="landing-radio">
        <MusicPlayer autoplayKey="visit" />
      </div>
      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <span className="eyebrow">ОБЩЕЕ ДЕЛО. ОСОБАЯ АТМОСФЕРА.</span>
            <h1>
              Дела идут.
              <br />
              <em>Джаз играет.</em>
            </h1>
            <p>
              Рабочее пространство, где у каждой задачи есть ответственный, у
              каждого срока — ясность, а у хорошей работы — свои маленькие
              награды.
            </p>
            <div className="landing-actions">
              <Link className="primary" href="/auth">
                Войти в команду <ArrowRight size={18} />
              </Link>
              <Link className="outline" href="/auth?mode=signup">
                Создать аккаунт <ArrowUpRight size={17} />
              </Link>
            </div>
            <span className="landing-caption">
              Задачи · Команда · Немного нуара
            </span>
          </div>
          <div className="landing-stage">
            <div className="landing-stage-heading">
              <span>КОНТУР / NOIR CABARET</span>
              <span>01 — ∞</span>
            </div>
            <img
              src="/reactions/v2/make-them-work-poster.webp"
              alt="Нуарная героиня в тёмных очках с красными губами"
              width={420}
              height={420}
            />
            <div className="landing-stage-caption">
              <span>Всё под контролем.</span>
              <em>Make things happen.</em>
            </div>
            <div className="landing-ticket">
              <Check size={17} />
              <span>
                Хорошая работа
                <br />
                <strong>заслуживает оваций.</strong>
              </span>
            </div>
          </div>
        </section>
        <section className="landing-features" id="how-it-works">
          <div>
            <span className="eyebrow">01 / ОРГАНИЗУЙТЕ</span>
            <h2>
              У каждого дела
              <br />
              <em>есть своё место.</em>
            </h2>
            <p>
              Ставьте задачи, назначайте исполнителей и следите за движением от
              первого шага до готового результата.
            </p>
          </div>
          <div>
            <span className="eyebrow">02 / ДОГОВАРИВАЙТЕСЬ</span>
            <h2>
              Сроки без
              <br />
              <em>недосказанности.</em>
            </h2>
            <p>
              Согласовывайте переносы, обсуждайте детали и принимайте работу.
              История решений остаётся рядом с задачей.
            </p>
          </div>
          <div>
            <span className="eyebrow">03 / ЛОВИТЕ РИТМ</span>
            <h2>
              Работа со
              <br />
              <em>своим настроением.</em>
            </h2>
            <p>
              Джазовый плейлист и нуарные реакции на достижения. Маленькие
              поводы улыбнуться в течение дня.
            </p>
          </div>
        </section>
        <section className="landing-join">
          <Music2 size={28} />
          <h2>
            Ваша команда.
            <br />
            <em>Ваш ритм.</em>
          </h2>
          <p>
            Сотрудник создаёт аккаунт, администратор открывает доступ — и можно
            начинать общее дело.
          </p>
          <Link className="primary" href="/auth?mode=signup">
            Присоединиться <ArrowUpRight size={18} />
          </Link>
          <Link href="/workspace" className="landing-workspace-link">
            Уже вошли? Открыть рабочее пространство →
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <span>контур®</span>
        <span>Business as unusual.</span>
        <Link href="/auth">Вход в рабочее пространство</Link>
      </footer>
    </div>
  );
}
