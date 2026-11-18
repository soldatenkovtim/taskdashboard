import sharp from "sharp";
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = new URL("../assets/reactions/v2/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", base), "utf8"),
);
const output = new URL("../public/reactions/v2/", import.meta.url);
await mkdir(output, { recursive: true });
for (const item of manifest) {
  const source = new URL(`${item.slug}.png`, base);
  if (item.source) await copyFile(item.source, source);
  const { width, height } = await sharp(source.pathname).metadata();
  const columns = item.columns,
    rows = item.rows;
  const frames = [];
  const w = 256,
    h = 256;
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const left = Math.round((col * width) / columns),
        top = Math.round((row * height) / rows);
      frames.push(
        await sharp(source.pathname)
          .extract({
            left,
            top,
            width: Math.round(((col + 1) * width) / columns) - left,
            height: Math.round(((row + 1) * height) / rows) - top,
          })
          .resize(w, h, { fit: "contain", background: "#08090d" })
          .ensureAlpha()
          .raw()
          .toBuffer(),
      );
    }
  const unique = new Set(
    frames.map((frame) => createHash("sha256").update(frame).digest("hex")),
  );
  if (unique.size < frames.length * 0.75)
    throw Error(`Insufficient unique poses: ${item.slug}`);
  // 24 generated poses, with readable holds at the opening and final gesture.
  const delay = frames.map((_, i) =>
    i === 0 ? 250 : i === frames.length - 1 ? 550 : 150,
  );
  const target = new URL(`${item.slug}.gif`, output);
  await sharp(Buffer.concat(frames), {
    raw: { width: w, height: h * frames.length, channels: 4, pageHeight: h },
  })
    .gif({ loop: 0, delay, colours: 128, dither: 0.2 })
    .toFile(target.pathname);
  const posterFrame = item.posterFrame ?? 0;
  if (!Number.isInteger(posterFrame) || !frames[posterFrame])
    throw Error(`Invalid poster frame: ${item.slug}`);
  await sharp(frames[posterFrame], {
    raw: { width: w, height: h, channels: 4 },
  })
    .webp({ quality: 90 })
    .toFile(new URL(`${item.slug}-poster.webp`, output).pathname);
  const meta = await sharp(target.pathname, { animated: true }).metadata();
  item.durationMs = meta.delay.reduce((a, b) => a + b, 0);
  item.frames = meta.pages;
  console.log(`${item.slug}: ${meta.pages} frames, ${item.durationMs} ms`);
}
await writeFile(
  new URL("manifest.json", base),
  JSON.stringify(
    manifest.map(({ source, ...rest }) => rest),
    null,
    2,
  ) + "\n",
);
