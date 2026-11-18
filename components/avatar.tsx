import { initials } from "@/lib/types";
import { validAvatar } from "@/lib/avatars";
export default function Avatar({
  name,
  avatar,
  small = false,
}: {
  name: string;
  avatar?: string | null;
  small?: boolean;
}) {
  return (
    <span className={`avatar${small ? " small" : ""}`}>
      {avatar && validAvatar(avatar) ? (
        <picture>
          <source
            media="(prefers-reduced-motion: reduce)"
            srcSet={`/avatars/${avatar}.webp`}
          />
          <img
            src={`/avatars/${avatar}.gif`}
            alt=""
            loading="lazy"
            width={64}
            height={64}
          />
        </picture>
      ) : (
        initials(name)
      )}
    </span>
  );
}
