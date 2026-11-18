"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { mediaKind, type ReactionConfig } from "@/lib/reactions";
export type ReactionInstance = {
  id: number;
  expiresAt: number;
  config: ReactionConfig;
};
export default function ReactionPopup({
  reaction,
  onClose,
}: {
  reaction: ReactionInstance | null;
  onClose: () => void;
}) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const update = () => {
      const dialogs = document.querySelectorAll("dialog[open]");
      setHost(dialogs.item(dialogs.length - 1) ?? document.body);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);
  return host && reaction
    ? createPortal(
        <Popup
          key={reaction.id}
          expiresAt={reaction.expiresAt}
          config={reaction.config}
          onClose={onClose}
        />,
        host,
      )
    : null;
}
function Popup({
  config,
  onClose,
  expiresAt,
}: {
  config: ReactionConfig;
  onClose: () => void;
  expiresAt: number;
}) {
  const ref = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false),
    [reduce, setReduce] = useState(true);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Manual popover uses the top layer even over a task drawer, without stealing
    // focus, creating a backdrop, blocking a save or dismissing the current dialog.
    ref.current?.showPopover?.();
    const timeout = setTimeout(
      () => close.current(),
      Math.max(0, expiresAt - Date.now()),
    );
    const hide = () => {
      if (document.hidden) close.current();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("visibilitychange", hide);
    document.addEventListener("keydown", escape);
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduce(preference.matches);
    motion();
    preference.addEventListener("change", motion);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", hide);
      document.removeEventListener("keydown", escape);
      preference.removeEventListener("change", motion);
    };
  }, [expiresAt]);
  const kind = !reduce && !failed ? mediaKind(config.mediaPath) : null;
  return (
    <div
      ref={ref}
      popover="manual"
      className="reaction-popup"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <button
        className="reaction-close"
        onClick={onClose}
        aria-label="Закрыть реакцию"
      >
        <X size={16} />
      </button>
      <span className="reaction-kicker">A LITTLE REACTION / КОНТУР</span>
      {kind === "video" ? (
        <video
          ref={video}
          src={config.mediaPath!}
          muted
          autoPlay
          playsInline
          loop
          preload="metadata"
          aria-hidden="true"
          onError={() => setFailed(true)}
          onLoadedData={() => {
            if (video.current) {
              video.current.muted = true;
              void video.current.play().catch(() => setFailed(true));
            }
          }}
        />
      ) : kind === "image" ? (
        <img
          src={config.mediaPath!}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : null}
      <strong>{config.title}</strong>
      <span className="reaction-signoff">business as unusual.</span>
    </div>
  );
}
