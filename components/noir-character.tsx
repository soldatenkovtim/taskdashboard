import type { ReactNode } from "react";
import { Image as Photo, Mail, Wine } from "lucide-react";
import { characterMedia, type CharacterState } from "@/lib/noir-character";

export default function NoirCharacter({ state = "neutral", context, caption, size = "small", children }: {
  state?: CharacterState;
  context: "board" | "approvals" | "archive" | "overview";
  caption?: string;
  children?: ReactNode;
  size?: "small" | "medium";
}) {
  const Symbol = context === "approvals" ? Mail : context === "archive" ? Photo : context === "overview" && state === "celebrating" ? Wine : null;
  return <figure className={`noir-character noir-character-${context} noir-character-${size}`}>
    <div className="noir-character-portrait">
      <img src={characterMedia[state]} width={256} height={256} alt="" loading="lazy" decoding="async" />
      {Symbol && <Symbol className="noir-character-symbol" size={20} aria-hidden="true" />}
    </div>
    {(caption || children) && <figcaption>{caption && <span className="noir-character-caption">{caption}</span>}{children}</figcaption>}
  </figure>;
}
