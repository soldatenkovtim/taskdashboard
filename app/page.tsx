import Link from "next/link";
import Image from "next/image";
import LandingBoard from "@/components/landing-board";
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
          <Link href="/auth">Войти</Link>
        </nav>
      </header>
      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-scene">
            <Image
              src="/landing/hero-restored.png"
              alt="Фирменная героиня Контура в тёмных очках и с красной помадой"
              width={1254}
              height={1254}
              sizes="(max-width: 700px) calc(100vw - 44px), (max-width: 1440px) 53vw, 752px"
              preload
            />
            <div className="landing-hero-copy">
              <h1 id="landing-title">
                <span>Дела идут.</span>
                <em>Джаз играет.</em>
              </h1>
              <div className="landing-intro">
                <p>
                  Задачи, сроки, ответственность.
                  <br />
                  Ничего лишнего.
                </p>
                <div className="landing-hero-actions">
                  <Link className="primary" href="/auth">
                    Войти в команду
                  </Link>
                  <Link className="landing-secondary" href="/auth?mode=signup">
                    Создать аккаунт
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="landing-radio">
          <MusicPlayer variant="landing" />
        </div>
        <section
          className="landing-product"
          id="how-it-works"
          aria-labelledby="product-title"
        >
          <div className="landing-product-intro">
            <h2 id="product-title">
              От задачи
              <br />
              до результата.
            </h2>
            <p>
              Назначайте исполнителей, согласовывайте дедлайны и отслеживайте
              работу команды. История решений всегда под рукой.
            </p>
          </div>
          <LandingBoard />
        </section>
        <section className="landing-join" aria-labelledby="join-title">
          <div>
            <h2 id="join-title">Начните с первой задачи.</h2>
            <p>Создайте аккаунт. Администратор откроет доступ к команде.</p>
          </div>
          <div className="landing-join-actions">
            <Link className="primary" href="/auth?mode=signup">
              Зарегистрироваться
            </Link>
            <Link href="/auth">Войти</Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <span>контур®</span>
        <Link href="/workspace">Рабочее пространство</Link>
      </footer>
    </div>
  );
}
