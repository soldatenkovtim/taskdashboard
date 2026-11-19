export const MATERIAL_BUCKET = "project-files";
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export type FileProject = { id: string; name: string };
export type Material = {
  id: string;
  project_id: string;
  task_id: string | null;
  title: string;
  description: string;
  kind: "file" | "link";
  url: string | null;
  file_name: string | null;
  uploaded_by: string;
  author_name: string;
  ready: boolean;
  published_at: string | null;
  created_at: string;
};
export type MaterialComment = {
  id: string;
  material_id: string;
  author_name: string;
  content: string;
  created_at: string;
};
export function validMaterialUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
