export function devPreviewEnabled(env = process.env) {
  return env.NODE_ENV === "development" && env.DEV_PREVIEW_ENABLED === "true";
}
