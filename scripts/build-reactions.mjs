import sharp from "sharp";
import { readFile, writeFile, copyFile } from "node:fs/promises";
const manifest = JSON.parse(
  await readFile(new URL("../assets/reactions/manifest.json", import.meta.url)),
);
for (const item of manifest) {
  const source = new URL(
    `../assets/reactions/${item.slug}.png`,
    import.meta.url,
  );
  if (item.source) await copyFile(item.source, source);
  const { width, height } = await sharp(source.pathname).metadata();
  const frameWidth = Math.floor(width / 4);
  const outputWidth = 320;
  const outputHeight = Math.round((height * outputWidth) / frameWidth);
  const frames = await Promise.all(
    [0, 1, 2, 3].map((i) =>
      sharp(source.pathname)
        .extract({ left: i * frameWidth, top: 0, width: frameWidth, height })
        .resize(outputWidth, outputHeight)
        .ensureAlpha()
        .raw()
        .toBuffer(),
    ),
  );
  const raw = {
    width: outputWidth,
    height: outputHeight * 4,
    channels: 4,
    pageHeight: outputHeight,
  };
  const target = new URL(
    `../public/reactions/${item.slug}.gif`,
    import.meta.url,
  );
  await sharp(Buffer.concat(frames), { raw })
    .gif({ loop: 0, delay: [700, 350, 650, 500], colours: 128, dither: 0.4 })
    .toFile(target.pathname);
  await sharp(frames[0], {
    raw: { width: outputWidth, height: outputHeight, channels: 4 },
  })
    .webp({ quality: 85 })
    .toFile(
      new URL(`../public/reactions/${item.slug}-poster.webp`, import.meta.url)
        .pathname,
    );
  const check = await sharp(target.pathname, { animated: true }).metadata();
  if (
    check.pages < 2 ||
    new Set(frames.map((f) => f.toString("base64"))).size < 2
  )
    throw Error(`No animation: ${item.slug}`);
  console.log(
    `${item.slug}: ${check.pages} frames, ${check.delay.reduce((a, b) => a + b, 0)} ms`,
  );
}
// Keep reproducible prompts and local sources, not machine-specific generation paths.
await writeFile(
  new URL("../assets/reactions/manifest.json", import.meta.url),
  JSON.stringify(
    manifest.map(({ source, ...item }) => item),
    null,
    2,
  ) + "\n",
);
