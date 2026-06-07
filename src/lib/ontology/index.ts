import { slug as githubSlug } from "github-slugger";
import { type CollectionEntry, getCollection } from "astro:content";
import type { DirNode, FileNode } from "../../loaders/globplus/index.ts";

export { ontology } from "./integration.ts"

/**
 * Shared content-ontology logic for the `Writings` collection.
 *
 * Two consumers:
 *  - the `ontology()` globplus integration, which classifies the raw on-disk
 *    file set (display-name segments) and stamps `data.category` / `data.series`
 *    onto each entry (see {@link classifyTree});
 *  - Astro pages, which read the authoritative node set the loader published to
 *    the in-memory store and pair it with `getCollection('Writings')` entries
 *    (see {@link getOntology}).
 *
 * Both slug via the same `github-slugger` the loader's `generateIdDefault` uses,
 * so node paths computed here match loader entry ids exactly.
 *
 * Node compatible (no `Deno` namespace, no `jsr:@std/*`).
 */

const ATTACHMENTS_DIR = "attachments";
const DISAMBIGUATE_FILE = "disambiguate.md";

/** Slug a single display segment, matching the loader's per-segment slugging. */
export function slugSegment(segment: string): string {
  return githubSlug(segment);
}

/** Slug a `/`-joined display path into a loader-style id/node path. */
export function slugPath(segments: string[]): string {
  return segments.map(slugSegment).join("/");
}

/**
 * The single rule for "is this matched file an article?" A relative POSIX path
 * (within the collection base) is an article unless any path segment is an
 * `attachments/` dir, its basename is the `disambiguate.md` marker, or it is not
 * a Markdown file. Matches the skip logic in {@link classifyTree} and both
 * loader integrations so they never diverge.
 */
export function isArticleFile(relPath: string): boolean {
  const segments = relPath.split("/");
  if (segments.includes(ATTACHMENTS_DIR)) return false;
  const fileName = segments.at(-1) ?? "";
  if (fileName.toLowerCase() === DISAMBIGUATE_FILE) return false;
  if (!fileName.toLowerCase().endsWith(".md")) return false;
  return true;
}

/**
 * The single rule for an article file's entry id: strip the trailing `.md` from
 * the last segment, then {@link slugPath} the segments. Byte-identical to the
 * loader's `generateIdDefault`, so node paths and resolved hrefs computed from
 * this match real entry ids exactly.
 */
export function entryIdForPath(relPath: string): string {
  const segments = relPath.split("/");
  const last = segments.pop() ?? "";
  segments.push(last.replace(/\.md$/i, ""));
  return slugPath(segments);
}

/**
 * Strip a raw tag down to its canonical display target, before slugging.
 *
 * A tag may be a plain string (`NixOS`) or an Obsidian wiki link Obsidian may
 * path-prefix (`[[NixOS]]`, `[[Tags/NixOS]]`, `[[Tags/NixOS|NixOS]]`,
 * `[[Tags/NixOS.md]]`). The wiki-link form is purely cosmetic. Steps:
 *  1. trim whitespace,
 *  2. strip surrounding `[[ ]]` brackets,
 *  3. drop any `|alias` suffix (keep the link target),
 *  4. take the basename after the last `/`,
 *  5. strip a trailing `.md`.
 */
function cleanTag(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("[[") && value.endsWith("]]")) {
    value = value.slice(2, -2);
  }
  const pipe = value.indexOf("|");
  if (pipe !== -1) value = value.slice(0, pipe);
  value = value.slice(value.lastIndexOf("/") + 1);
  if (value.toLowerCase().endsWith(".md")) value = value.slice(0, -3);
  return value.trim();
}

/**
 * Normalize a raw tag (any of the forms above) to its canonical slug. All of
 * `NixOS`, `[[NixOS]]`, `[[Tags/NixOS]]`, `[[Tags/NixOS|NixOS]]`, and
 * `[[Tags/NixOS.md]]` normalize to `nixos`. This slug is the tag's identity and
 * matches a `Tags` collection entry id (which slugs its filename the same way).
 */
export function normalizeTag(raw: string): string {
  return slugSegment(cleanTag(raw));
}

/**
 * A human-readable label for a raw tag: the cleaned target/basename with the
 * wiki-link cosmetics removed. The canonical display name should come from a
 * matching `Tags` entry when present; this is the fallback.
 */
export function displayTag(raw: string): string {
  return cleanTag(raw);
}

/** The kind of a directory node in the ontology. */
export type NodeKind = "category" | "series";

/**
 * The classification coordinates derived for a single article (Markdown) file.
 * `category` is the ordered category/subcategory display-name path; `series` is
 * the display name of the immediate parent directory iff that directory is a
 * series, else `null`.
 */
export interface ArticleCoords {
  category: string[];
  series: string | null;
}

/**
 * Result of classifying the full file set: per-file coordinates keyed by the
 * file's entry id, plus the set of directory nodes (categories and series)
 * keyed by their slugged node path.
 */
export interface TreeClassification {
  /** Coordinates per Markdown file, keyed by entry id. */
  coordsById: Map<string, ArticleCoords>;
  /** Directory nodes keyed by slugged node path. */
  nodes: Map<string, OntologyNode>;
}

/** A category/subcategory or series directory node. */
export interface OntologyNode {
  kind: NodeKind;
  /** Slugged node path (matches loader entry-id prefix). */
  path: string;
  /** Ordered display-name segments of this node's directory path. */
  displayPath: string[];
  /** Display name of this node (last display segment). */
  name: string;
  /** Slugged path of the parent node, or `null` for a top-level node. */
  parent: string | null;
}

/** The display-name basename of a {@link FileNode} (last URL path segment). */
function fileName(file: FileNode): string {
  return decodeURIComponent(file.url.pathname.split("/").at(-1) ?? "");
}

/** Display-name segments from the loader base to `dir` (`[]` for the root). */
function dirSegments(dir: DirNode): string[] {
  return dir.relativeDir === "" ? [] : dir.relativeDir.split("/");
}

/**
 * A directory is a CATEGORY when it has at least one non-`attachments`
 * subdirectory, OR it carries a `disambiguate.md` marker. Otherwise (only
 * Markdown files, no qualifying subdir) it is a SERIES. The loader base itself
 * is never a node.
 */
function isCategory(dir: DirNode): boolean {
  for (const file of dir.files) {
    if (fileName(file).toLowerCase() === DISAMBIGUATE_FILE) return true;
  }
  for (const name of dir.dirs.keys()) {
    if (name !== ATTACHMENTS_DIR) return true;
  }
  return false;
}

/**
 * Classify the loader's directory tree ({@link DirNode}, markdown-only since the
 * glob is `**\/*.md`). `attachments/` dirs and `disambiguate.md` markers never
 * become articles or nodes. FileNode ids are still empty at classification time,
 * so article ids are derived from the path via {@link entryIdForPath}.
 */
export function classifyTree(tree: DirNode): TreeClassification {
  const nodes = new Map<string, OntologyNode>();
  const coordsById = new Map<string, ArticleCoords>();
  // Build-error guard (ADR 0002): an article's id is the slug of its full
  // relative path sans `.md`. The loader only *warns* and overwrites on
  // duplicate ids, so detect them here over the full file set, where every
  // sibling is visible. Tracks the source paths per id to report collisions.
  const idToPaths = new Map<string, string[]>();

  walk(tree, []);

  for (const [id, paths] of idToPaths) {
    if (paths.length > 1) {
      throw new Error(
        `[gp:ontology] Duplicate entry id "${id}" from sibling files: ` +
          `${paths.join(", ")}. Ids (slugged hierarchical paths) must be ` +
          `unique; rename one of these files.`,
      );
    }
  }

  // Walk the tree, carrying the running category display path. A node's parent
  // is the slug of the current category path (its enclosing categories), since
  // a series is always a leaf and categories nest only inside categories.
  function walk(dir: DirNode, categoryPath: string[]) {
    const segments = dirSegments(dir);
    const isRoot = segments.length === 0;
    let nodeCategoryPath = categoryPath;
    let dirIsSeries = false;

    if (!isRoot) {
      const slugged = slugPath(segments);
      const parent = categoryPath.length ? slugPath(categoryPath) : null;
      if (isCategory(dir)) {
        nodeCategoryPath = [...categoryPath, segments.at(-1)!];
        nodes.set(slugged, {
          kind: "category",
          path: slugged,
          displayPath: segments,
          name: segments.at(-1)!,
          parent,
        });
      } else {
        dirIsSeries = true;
        nodes.set(slugged, {
          kind: "series",
          path: slugged,
          displayPath: segments,
          name: segments.at(-1)!,
          parent,
        });
      }
    }

    for (const file of dir.files) {
      const rel = [...segments, fileName(file)].join("/");
      // Shared article rule: skip `attachments/`, `disambiguate.md`, non-`.md`.
      if (!isArticleFile(rel)) continue;
      const id = entryIdForPath(rel);
      (idToPaths.get(id) ?? idToPaths.set(id, []).get(id)!).push(rel);
      coordsById.set(id, {
        category: nodeCategoryPath,
        series: dirIsSeries ? segments.at(-1)! : null,
      });
    }

    for (const [name, child] of dir.dirs) {
      if (name === ATTACHMENTS_DIR) continue;
      walk(child, nodeCategoryPath);
    }
  }

  return { coordsById, nodes };
}

// ---------------------------------------------------------------------------
// Page-side view: pair the authoritative node set with collection entries.
// ---------------------------------------------------------------------------

type WritingEntry = CollectionEntry<"writings">;

/** A category/series node enriched with its published-article count. */
export interface OntologyView {
  /** All nodes keyed by slugged path. */
  nodes: Map<string, OntologyNode>;
  /** Set of node paths (categories + series) — used to exclude descriptions. */
  nodePaths: Set<string>;
  /** Article entries only (excludes descriptions and node-path ids). */
  articles: WritingEntry[];
  /** True if `entry.id` equals a series node path (i.e. a series description). */
  isDescription: (entry: WritingEntry) => boolean;
  /** Published-article count for a node path (recursive for categories). */
  count: (nodePath: string) => number;
  /** Direct child nodes of a node path (or top-level when `null`). */
  childrenOf: (nodePath: string | null) => OntologyNode[];
  /** Articles whose immediate node is exactly this path. */
  articlesOf: (nodePath: string) => WritingEntry[];
}

/**
 * Assemble an {@link OntologyView} from an authoritative node set and the
 * publish-filtered entries. The node set is the source of truth for taxonomy
 * structure; `entries` supplies the articles whose counts/listings the view
 * reflects. Used by {@link getOntology}, which sources the node set from the
 * in-memory store the loader published.
 */
function makeView(
  nodes: Map<string, OntologyNode>,
  entries: WritingEntry[],
): OntologyView {
  const nodePaths = new Set(nodes.keys());

  const isDescription = (entry: WritingEntry): boolean => {
    const node = nodes.get(entry.id);
    return node?.kind === "series";
  };

  const articles = entries.filter((e) => !nodePaths.has(e.id));

  // The immediate node path of an article = slug(category) + optional series.
  const immediateNodePath = (entry: WritingEntry): string | null => {
    const category = (entry.data.category ?? []) as string[];
    const series = (entry.data.series ?? null) as string | null;
    const display = series ? [...category, series] : category;
    return display.length ? slugPath(display) : null;
  };

  // Build the membership indexes in one pass over `articles`, so each closure
  // below is a map read instead of a re-scan/re-slug of the whole article set.
  const directArticles = new Map<string, WritingEntry[]>();
  const countByPath = new Map<string, number>();
  for (const entry of articles) {
    const ip = immediateNodePath(entry);
    if (ip === null) continue;
    // Direct membership: bucket the entry under its immediate node path.
    (directArticles.get(ip) ?? directArticles.set(ip, []).get(ip)!).push(entry);
    // Recursive counts: every `/`-boundary prefix of `ip` (including `ip`
    // itself) gets +1. This reproduces the membership rule exactly — a node
    // path counts an article iff `ip === path || ip.startsWith(path + "/")`,
    // which is precisely the set of `ip`'s prefixes at slash boundaries.
    const segments = ip.split("/");
    let prefix = "";
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      countByPath.set(prefix, (countByPath.get(prefix) ?? 0) + 1);
    }
  }

  // Group nodes by parent once, sorted by name (matching the prior order).
  const childrenByParent = new Map<string | null, OntologyNode[]>();
  for (const node of nodes.values()) {
    (childrenByParent.get(node.parent) ??
      childrenByParent.set(node.parent, []).get(node.parent)!).push(node);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  }

  const articlesOf = (nodePath: string): WritingEntry[] =>
    directArticles.get(nodePath) ?? [];

  // Recursive published-article count: articles whose immediate node path is
  // this node or descends from it (prefix match on `path/`).
  const count = (nodePath: string): number => countByPath.get(nodePath) ?? 0;

  const childrenOf = (nodePath: string | null): OntologyNode[] =>
    childrenByParent.get(nodePath) ?? [];

  return {
    nodes,
    nodePaths,
    articles,
    isDescription,
    count,
    childrenOf,
    articlesOf,
  };
}

// ---------------------------------------------------------------------------
// In-memory ontology store: the loader publishes the authoritative node set,
// pages read it back through getOntology(). Keyed on a global symbol so it
// survives module-instance duplication across the loader/page graphs.
// ---------------------------------------------------------------------------

const STORE_KEY = Symbol.for("ninjack.ontology");

interface OntologyStore {
  nodes: Map<string, OntologyNode>;
}

type StoreHost = typeof globalThis & {
  [STORE_KEY]?: OntologyStore;
};

function store(): StoreHost {
  return globalThis as StoreHost;
}

/** Memoized view, cleared by {@link publishNodes} on each (re)publish. */
let cachedView: OntologyView | null = null;

/**
 * Publish the authoritative ontology node set (computed by the loader's
 * `classifyTree`) into the global store and invalidate the memoized view, so the
 * next {@link getOntology} rebuilds from the fresh node set.
 */
export function publishNodes(nodes: Map<string, OntologyNode>): void {
  store()[STORE_KEY] = { nodes };
  cachedView = null;
}

/**
 * The single page-side accessor for the ontology view. Reads the published node
 * set from the global store (empty if none published) and pairs it with the
 * publish-filtered `Writings` entries — full set in dev, `published`-only in
 * prod. The result is memoized; {@link publishNodes} clears the memo so a dev
 * reload re-publishes and the next call rebuilds.
 */
export async function getOntology(): Promise<OntologyView> {
  if (cachedView) return cachedView;
  const livePredicate = ({ data }: WritingEntry) =>
    import.meta.env.PROD ? data.published : true;
  const entries = await getCollection("writings", livePredicate);
  const storeNodes = store()[STORE_KEY]?.nodes ?? new Map<string, OntologyNode>();
  cachedView = makeView(storeNodes, entries);
  return cachedView;
}
