import { fileURLToPath } from "node:url";
import path from 'node:path';
import { slug as githubSlug } from "github-slugger";
import type { DirNode, FileNode, GenerateIdOptions } from "./types.ts";

// Multiple functions/types are extracted from the Astro codebase. "From *" is relative to the Astro repository root path.

// From src/core/viteUtils.ts
// Modified to remove Windows check
export function normalizePath(id: string) {
	return path.posix.normalize(id);
}

// From src/content/utils.ts
function getRelativeEntryPath(entry: URL, collection: string, contentDir: URL) {
	const relativeToContent = path.relative(fileURLToPath(contentDir), fileURLToPath(entry));
	const relativeToCollection = path.relative(collection, relativeToContent);
	return relativeToCollection;
}

// From src/content/utils.ts
export type ContentPaths = {
	root: URL;
	contentDir: URL;
	assetsDir: URL;
	typesTemplate: URL;
	virtualModTemplate: URL;
	config: {
		exists: boolean;
		url: URL;
	};
	liveConfig: {
		exists: boolean;
		url: URL;
	};
};

// From src/content/utils.ts
export function getContentEntryIdAndSlug({
	entry,
	contentDir,
	collection,
}: Pick<ContentPaths, 'contentDir'> & { entry: URL; collection: string }): {
	id: string;
	slug: string;
} {
	const relativePath = getRelativeEntryPath(entry, collection, contentDir);
	const withoutFileExt = relativePath.replace(new RegExp(path.extname(relativePath) + '$'), '');
	const rawSlugSegments = withoutFileExt.split(path.sep);

	const slug = rawSlugSegments
		// Slugify each route segment to handle capitalization and spaces.
		// Note: using `slug` instead of `new Slugger()` means no slug deduping.
		.map((segment) => githubSlug(segment))
		.join('/')
		.replace(/\/index$/, '');

	const res = {
		id: normalizePath(relativePath),
		slug,
	};
	return res;
}

// From src/content/loaders/glob.ts
export function generateIdDefault({ entry, base, data }: GenerateIdOptions, isLegacy?: boolean): string {
	if (data.slug) {
		return data.slug as string;
	}
	const entryURL = new URL(encodeURI(entry), base);
	if (isLegacy) {
		// Legacy behavior: use ID based on path, not slug
		const { id } = getContentEntryIdAndSlug({
			entry: entryURL,
			contentDir: base,
			collection: '',
		});
		return id;
	}
	const { slug } = getContentEntryIdAndSlug({
		entry: entryURL,
		contentDir: base,
		collection: '',
	});
	return slug;
}

/**
 * Build a directory tree from the set of matched files (relative to `base`).
 * Every {@link DirNode} carries a back-link to its `parent`, and each matched
 * file becomes a {@link FileNode} with an empty `id` placeholder (ids are
 * unknown at glob time; `syncData` fills them in later).
 */
export function buildDirTree(base: URL, files: string[]): DirNode {
  const root: DirNode = {
    dir: base,
    relativeDir: "",
    dirs: new Map(),
    files: [],
  };

  for (const file of files) {
    insertFile(root, file, new URL(encodeURI(file), base));
  }

  return root;
}

/**
 * Navigate to (creating as needed) the {@link DirNode} for `relativePath`'s
 * directory, then append a {@link FileNode} for it. Idempotent: if the file is
 * already in the tree the existing node is returned. Fully synchronous so
 * concurrent `syncData` calls under `pLimit` stay race-free.
 */
export function insertFile(
  root: DirNode,
  relativePath: string,
  url: URL,
): FileNode {
  // POSIX-style relative paths come out of tinyglobby / posixRelative.
  const segments = relativePath.split("/");
  segments.pop();
  let node = root;
  let accumulated = "";
  for (const segment of segments) {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment;
    let child = node.dirs.get(segment);
    if (!child) {
      child = {
        dir: new URL(`${encodeURI(accumulated)}/`, root.dir),
        relativeDir: accumulated,
        parent: node,
        dirs: new Map(),
        files: [],
      };
      node.dirs.set(segment, child);
    }
    node = child;
  }

  const existing = node.files.find((f) => f.url.href === url.href);
  if (existing) return existing;

  const fileNode: FileNode = { url, id: "", parent: node };
  node.files.push(fileNode);
  return fileNode;
}

/** Find the {@link FileNode} for `relativePath`, if present in the tree. */
export function findFile(
  root: DirNode,
  relativePath: string,
): FileNode | undefined {
  const segments = relativePath.split("/");
  const fileName = segments.pop()!;
  let node = root;
  for (const segment of segments) {
    const child = node.dirs.get(segment);
    if (!child) return undefined;
    node = child;
  }
  const url = new URL(encodeURI(relativePath), root.dir);
  return node.files.find((f) => f.url.href === url.href) ??
    node.files.find((f) =>
      decodeURIComponent(f.url.pathname.split("/").at(-1) ?? "") === fileName
    );
}

/**
 * Remove a {@link FileNode} from the tree, then prune now-empty ancestor
 * directories (no `files`, no `dirs`) walking upward. Pruned nodes keep their
 * `.parent` link so a `removed` handler can still navigate upward.
 */
export function removeFile(
  root: DirNode,
  target: FileNode | string,
): void {
  const fileNode = typeof target === "string"
    ? findFile(root, target)
    : target;
  if (!fileNode) return;

  let dir = fileNode.parent;
  const index = dir.files.indexOf(fileNode);
  if (index !== -1) dir.files.splice(index, 1);

  // Prune empty ancestors, walking up toward (but never removing) the root.
  while (dir.parent && dir.files.length === 0 && dir.dirs.size === 0) {
    const segment = dir.relativeDir.split("/").at(-1)!;
    dir.parent.dirs.delete(segment);
    dir = dir.parent;
  }
}
