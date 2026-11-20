import { environment } from "@raycast/api";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ImageResult, UA } from "./ddg";

const execFileAsync = promisify(execFile);
const CACHE_DIR = path.join(environment.supportPath, "images");

export interface LocalImage {
  path: string;
  usedThumbnail: boolean;
}

function slug(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return s || "image";
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (type.startsWith("text/")) throw new Error(`Not an image (${type})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Converts any image macOS can read (jpg, webp, gif, heic, png…) to PNG using the built-in `sips`. */
async function toPng(src: string, dest: string): Promise<void> {
  await execFileAsync("sips", ["-s", "format", "png", src, "--out", dest], { timeout: 30_000 });
  if (!existsSync(dest)) throw new Error("PNG conversion failed");
}

async function downloadAndConvert(url: string, dest: string): Promise<void> {
  const raw = `${dest}.download`;
  try {
    await writeFile(raw, await fetchImage(url));
    await toPng(raw, dest);
  } finally {
    await rm(raw, { force: true });
  }
}

/**
 * Downloads the full-size image as PNG. If the host blocks hotlinking or the format
 * can't be converted (e.g. SVG), falls back to DuckDuckGo's proxied thumbnail.
 */
export async function getLocalPng(item: ImageResult): Promise<LocalImage> {
  await mkdir(CACHE_DIR, { recursive: true });
  const id = createHash("sha1").update(item.image).digest("hex").slice(0, 10);
  const full = path.join(CACHE_DIR, `${slug(item.title)}-${id}.png`);
  const thumb = path.join(CACHE_DIR, `${slug(item.title)}-${id}-thumb.png`);

  if (existsSync(full)) return { path: full, usedThumbnail: false };
  try {
    await downloadAndConvert(item.image, full);
    return { path: full, usedThumbnail: false };
  } catch {
    if (!existsSync(thumb)) await downloadAndConvert(item.thumbnail, thumb);
    return { path: thumb, usedThumbnail: true };
  }
}

/** Puts the PNG pixels on the clipboard, so it pastes as an image into Excalidraw, draw.io, Figma, Keynote… */
export async function copyPngData(file: string): Promise<void> {
  await execFileAsync(
    "osascript",
    [
      "-e",
      "on run argv",
      "-e",
      "set the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)",
      "-e",
      "end run",
      file,
    ],
    { timeout: 15_000 },
  );
}

export async function saveToDownloads(file: string): Promise<string> {
  const dest = path.join(homedir(), "Downloads", path.basename(file).replace(/-thumb\.png$/, ".png"));
  await copyFile(file, dest);
  return dest;
}

export async function clearCache(): Promise<void> {
  await rm(CACHE_DIR, { recursive: true, force: true });
}
