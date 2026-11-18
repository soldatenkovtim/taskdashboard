"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import tracks from "@/lib/music.json";

export default function MusicPlayer({ autoplayKey }: { autoplayKey?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const initialized = useRef(false);
  const cancelAutoplay = useRef(() => {});
  const track = tracks[index];

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    if (!initialized.current) {
      initialized.current = true;
      const chosen = Math.floor(Math.random() * tracks.length);
      setIndex(chosen);
      player.src = tracks[chosen].src;
    }
    const stopWaiting = () => {
      document.removeEventListener("click", startAfterInteraction);
      document.removeEventListener("keydown", startAfterInteraction);
    };
    cancelAutoplay.current = stopWaiting;
    const startAfterInteraction = (event: Event) => {
      // Let explicit player controls handle their own play/pause intent.
      if (
        event.target instanceof Element &&
        event.target.closest(".music-player")
      )
        return;
      void player.play().catch(() => {});
    };
    // Defer claiming the visit so React's development effect replay is harmless.
    const timer = window.setTimeout(() => {
      if (!autoplayKey) return;
      try {
        const key = `kontur.music.intro.v1.${autoplayKey}`;
        if (localStorage.getItem(key)) return;
        // Count the visit even when the browser blocks playback.
        localStorage.setItem(key, "seen");
      } catch {
        // Without persistent storage, keep playback manual.
        return;
      }
      document.addEventListener("click", startAfterInteraction);
      document.addEventListener("keydown", startAfterInteraction);
      player.addEventListener("play", stopWaiting);
      void player.play().catch(() => {});
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stopWaiting();
      player.removeEventListener("play", stopWaiting);
    };
  }, [autoplayKey]);

  async function playTrack(next: number) {
    const player = audio.current;
    if (!player) return;
    const version = ++request.current;
    const chosen = (next + tracks.length) % tracks.length;
    setError("");
    if (chosen !== index) {
      setIndex(chosen);
      player.src = tracks[chosen].src;
    }
    try {
      await player.play();
    } catch {
      if (version === request.current)
        setError("Не удалось включить трек. Нажмите воспроизведение ещё раз.");
    }
  }

  function toggle() {
    if (audio.current && !audio.current.paused) {
      ++request.current;
      audio.current.pause();
    } else void playTrack(index);
  }

  return (
    <section
      className="music-player"
      aria-label="Музыкальный плеер"
      onPointerDownCapture={() => cancelAutoplay.current()}
      onKeyDownCapture={() => cancelAutoplay.current()}
    >
      <div className="music-brand">
        <Music2 size={22} />
        <span>
          NOIR
          <br />
          <strong>CABARET</strong>
        </span>
      </div>
      <div className="music-current" aria-live="polite">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </div>
      <div className="music-transport">
        <button
          aria-label="Предыдущий трек"
          onClick={() => void playTrack(index - 1)}
        >
          <SkipBack size={18} />
        </button>
        <button
          className="music-play"
          aria-label={playing ? "Пауза" : "Воспроизвести"}
          onClick={toggle}
        >
          {playing ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button
          aria-label="Следующий трек"
          onClick={() => void playTrack(index + 1)}
        >
          <SkipForward size={18} />
        </button>
      </div>
      <audio
        ref={audio}
        src={tracks[0].src}
        controls
        preload="none"
        aria-label="Перемотка и громкость"
        onPlay={() => {
          setPlaying(true);
          setError("");
        }}
        onPause={() => setPlaying(false)}
        onEnded={() =>
          void playTrack(
            index +
              1 +
              Math.floor(Math.random() * Math.max(1, tracks.length - 1)),
          )
        }
        onError={() => {
          setPlaying(false);
          setError("Этот трек недоступен. Попробуйте следующий.");
        }}
      />
      {error && (
        <p className="music-error" role="alert">
          {error}
        </p>
      )}
      <details
        className="music-playlist"
        ref={panel}
        onKeyDown={(event) => {
          if (event.key === "Escape" && panel.current) {
            panel.current.open = false;
            panel.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-label="Открыть плейлист">
          Плейлист <span>{tracks.length}</span>
        </summary>
        <section className="music-panel" aria-label="Список треков">
          <div className="music-heading">
            <span className="eyebrow">МУЗЫКА ПОСЛЕ ПОЛУНОЧИ</span>
            <button
              className="icon-button"
              aria-label="Закрыть плейлист"
              onClick={() => {
                if (panel.current) panel.current.open = false;
              }}
            >
              <X size={16} />
            </button>
          </div>
          <ol className="music-list">
            {tracks.map((item, i) => (
              <li key={item.src}>
                <button
                  className={i === index ? "is-current" : ""}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => void playTrack(i)}
                >
                  <span className="music-number">
                    {i === index && playing ? (
                      <Music2 size={14} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.artist}</small>
                  </span>
                  {i === index && <span className="music-dot" />}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </details>
    </section>
  );
}
