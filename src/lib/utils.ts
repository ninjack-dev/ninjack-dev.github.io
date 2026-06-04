import { extname } from "node:path";
import type { DirNode, FileNode } from "../loaders/globplus/types.ts";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The same-named file sitting next to `dir` (`Some Series/` ↔ `Some Series.md`):
 * the file in `dir.parent.files` whose basename-sans-extension equals `dir`'s
 * final path segment.
 */
export function siblingFileOf(dir: DirNode): FileNode | undefined {
  const parent = dir.parent;
  if (!parent) return undefined;
  const segment = dir.relativeDir.split("/").at(-1);
  return parent.files.find((file) => {
    const name = decodeURIComponent(file.url.pathname.split("/").at(-1) ?? "");
    return name.replace(new RegExp(`${escapeRegExp(extname(name))}$`), "") ===
      segment;
  });
}

/**
 * The same-named directory sitting next to `file` (`Some Series.md` ↔
 * `Some Series/`): the directory in `file.parent.dirs` whose final segment
 * equals `file`'s basename-sans-extension.
 */
export function siblingDirOf(file: FileNode): DirNode | undefined {
  const name = decodeURIComponent(file.url.pathname.split("/").at(-1) ?? "");
  const stem = name.replace(new RegExp(`${escapeRegExp(extname(name))}$`), "");
  return file.parent.dirs.get(stem);
}
