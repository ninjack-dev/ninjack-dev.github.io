import { slug as githubSlug } from "github-slugger";
import type { CollectionEntry } from "astro:content";

/**
 * Shared content-ontology logic for the `Writings` collection.
 *
 * Two consumers:
 *  - the `ontology()` globplus integration, which classifies the raw on-disk
 *    file set (display-name segments) and stamps `data.category` / `data.series`
 *    onto each entry (see {@link classifyTree});
 *  - Astro pages, which reconstruct the node set (categories + series) from the
 *    stamped coordinates over `getCollection('Writings')` (see
 *    {@link buildOntology}).
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
 * file's relative POSIX path, plus the set of directory nodes (categories and
 * series) keyed by their slugged node path.
 */
export interface TreeClassification {
  /** Coordinates per Markdown file, keyed by relative POSIX path. */
  coordsByPath: Map<string, ArticleCoords>;
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

interface RawDir {
  /** Display-name segments from the loader base to this dir. */
  segments: string[];
  /** Child directory display names → RawDir. */
  dirs: Map<string, RawDir>;
  /** Markdown file display names directly in this dir. */
  files: string[];
  /** Whether a `disambiguate.md` marker sits in this dir. */
  hasDisambiguate: boolean;
}

function newRawDir(segments: string[]): RawDir {
  return { segments, dirs: new Map(), files: [], hasDisambiguate: false };
}

/**
 * A directory is a CATEGORY when it has at least one non-`attachments`
 * subdirectory, OR it carries a `disambiguate.md` marker. Otherwise (only
 * Markdown files, no qualifying subdir) it is a SERIES. The loader base itself
 * is never a node.
 */
function isCategory(dir: RawDir): boolean {
  if (dir.hasDisambiguate) return true;
  for (const name of dir.dirs.keys()) {
    if (name !== ATTACHMENTS_DIR) return true;
  }
  return false;
}

/**
 * Classify the full set of matched Markdown files (relative POSIX paths with
 * on-disk casing). `attachments/` dirs and `disambiguate.md` markers never
 * become articles or nodes.
 */
export function classifyTree(relativePaths: string[]): TreeClassification {
  const root = newRawDir([]);

  // Build a raw display-name tree.
  for (const rel of relativePaths) {
    const parts = rel.split("/");
    const fileName = parts.pop()!;
    let node = root;
    let underAttachments = false;
    for (const segment of parts) {
      if (segment === ATTACHMENTS_DIR) underAttachments = true;
      let child = node.dirs.get(segment);
      if (!child) {
        child = newRawDir([...node.segments, segment]);
        node.dirs.set(segment, child);
      }
      node = child;
    }
    if (underAttachments) continue; // attachments are never files/nodes
    if (fileName.toLowerCase() === DISAMBIGUATE_FILE) {
      node.hasDisambiguate = true;
      continue;
    }
    if (fileName.toLowerCase().endsWith(".md")) {
      node.files.push(fileName);
    }
  }

  const nodes = new Map<string, OntologyNode>();
  const coordsByPath = new Map<string, ArticleCoords>();

  walk(root, []);

  // Walk the tree, carrying the running category display path. A node's parent
  // is the slug of the current category path (its enclosing categories), since
  // a series is always a leaf and categories nest only inside categories.
  function walk(dir: RawDir, categoryPath: string[]) {
    const isRoot = dir.segments.length === 0;
    let nodeCategoryPath = categoryPath;
    let dirIsSeries = false;

    if (!isRoot) {
      const slugged = slugPath(dir.segments);
      const parent = categoryPath.length ? slugPath(categoryPath) : null;
      if (isCategory(dir)) {
        nodeCategoryPath = [...categoryPath, dir.segments.at(-1)!];
        nodes.set(slugged, {
          kind: "category",
          path: slugged,
          displayPath: dir.segments,
          name: dir.segments.at(-1)!,
          parent,
        });
      } else {
        dirIsSeries = true;
        nodes.set(slugged, {
          kind: "series",
          path: slugged,
          displayPath: dir.segments,
          name: dir.segments.at(-1)!,
          parent,
        });
      }
    }

    for (const file of dir.files) {
      const rel = [...dir.segments, file].join("/");
      coordsByPath.set(rel, {
        category: nodeCategoryPath,
        series: dirIsSeries ? dir.segments.at(-1)! : null,
      });
    }

    for (const [name, child] of dir.dirs) {
      if (name === ATTACHMENTS_DIR) continue;
      walk(child, nodeCategoryPath);
    }
  }

  return { coordsByPath, nodes };
}

// ---------------------------------------------------------------------------
// Page-side helper: reconstruct the ontology from stamped collection entries.
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
 * Reconstruct the ontology node set from the stamped `data.category` /
 * `data.series` coordinates of every entry, and expose listing/count helpers.
 *
 * `entries` should already be publish-filtered by the caller for *route
 * emission*, but counts/listings here only ever reflect the entries passed in,
 * so pass the prod-published-only set in prod and the full set in dev.
 */
export function buildOntology(entries: WritingEntry[]): OntologyView {
  const nodes = new Map<string, OntologyNode>();

  // Reconstruct nodes from each entry's coordinates.
  for (const entry of entries) {
    const category = (entry.data.category ?? []) as string[];
    const series = (entry.data.series ?? null) as string | null;

    // Register every prefix of the category display path as a category node.
    for (let i = 0; i < category.length; i++) {
      const displayPath = category.slice(0, i + 1);
      const path = slugPath(displayPath);
      if (!nodes.has(path)) {
        nodes.set(path, {
          kind: "category",
          path,
          displayPath,
          name: displayPath.at(-1)!,
          parent: i === 0 ? null : slugPath(category.slice(0, i)),
        });
      }
    }

    // Register the series node (immediate parent dir of the article).
    if (series) {
      const displayPath = [...category, series];
      const path = slugPath(displayPath);
      if (!nodes.has(path)) {
        nodes.set(path, {
          kind: "series",
          path,
          displayPath,
          name: series,
          parent: category.length ? slugPath(category) : null,
        });
      }
    }
  }

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

  const articlesOf = (nodePath: string): WritingEntry[] =>
    articles.filter((e) => immediateNodePath(e) === nodePath);

  // Recursive published-article count: articles whose immediate node path is
  // this node or descends from it (prefix match on `path/`).
  const count = (nodePath: string): number =>
    articles.filter((e) => {
      const ip = immediateNodePath(e);
      return ip === nodePath || (ip !== null && ip.startsWith(`${nodePath}/`));
    }).length;

  const childrenOf = (nodePath: string | null): OntologyNode[] =>
    [...nodes.values()]
      .filter((n) => n.parent === nodePath)
      .sort((a, b) => a.name.localeCompare(b.name));

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
