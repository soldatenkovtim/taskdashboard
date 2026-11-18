export const avatars = [
  { id: "noir-1", name: "Взгляд сквозь дым" },
  { id: "noir-2", name: "Полночь" },
  { id: "noir-3", name: "Ночной город" },
  { id: "noir-4", name: "За кулисами" },
  { id: "noir-5", name: "Тихий джаз" },
] as const;
export function validAvatar(value: unknown): value is string | null {
  return value === null || avatars.some((avatar) => avatar.id === value);
}
