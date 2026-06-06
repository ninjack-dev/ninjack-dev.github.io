import { fileURLToPath } from "node:url";
import {
  classifyTree,
  entryIdForPath,
  type OntologyNode,
  type TreeClassification,
} from "../../../lib/ontology.ts";
import type { GlobPlusIntegration } from "../types.ts";

/**
 * `ontology` — a globplus integration that derives the `Writings` taxonomy from
 * the directory layout (ADR 0001) and stamps it onto each entry (ADR 0002).
 *
 * Hook design:
 *  - `gp:files:resolved` (whole-tree view): classify the full matched file set
 *    with {@link classifyTree}. Per-file hooks can't see siblings, so all
 *    classification happens here and is cached in `byPath` (keyed by absolute
 *    fs path) for the per-file `gp:entry:data` lookup. Also caches the node set
 *    for the end-of-load guard.
 *  - `gp:entry:data` (per file, before Zod parse): look the file up by its
 *    absolute path and stamp `data.category` (display-name path) and
 *    `data.series` (display name or `null`) onto the raw frontmatter.
 *  - `gp:load:done`: build-error guard (ADR 0002) — an entry id equal to a
 *    *category* node path is illegal (categories have no description); a match
 *    on a *series* node path is a valid series description.
 *
 * Classification includes `published: false` content and ignores `attachments/`
 * dirs and `disambiguate.md` markers (handled inside `classifyTree`).
 */
export function ontology(): GlobPlusIntegration {
  // Absolute fs path → article coordinates, rebuilt each load.
  let byPath = new Map<string, { category: string[]; series: string | null }>();
  // Node-path → node, rebuilt each load (for the build-error guard).
  let nodes = new Map<string, OntologyNode>();

  return {
    name: "gp:ontology",
    hooks: {
      "gp:files:resolved": ({ base, files }) => {
        const classification: TreeClassification = classifyTree(files);
        nodes = classification.nodes;

        byPath = new Map();
        const baseFs = fileURLToPath(base);
        for (const [rel, coords] of classification.coordsByPath) {
          const abs = fileURLToPath(new URL(encodeURI(rel), base));
          byPath.set(abs, coords);
          // Guard against URL-encoding mismatches by also keying the plain join.
          byPath.set(`${baseFs}${rel}`, coords);
        }

        // Build-error guard (ADR 0002): article-id collisions. The loader only
        // *warns* and overwrites on duplicate ids, so detect them here over the
        // full file set, where every sibling is visible. An article's id is the
        // slug of its full relative path sans `.md`.
        const idToPaths = new Map<string, string[]>();
        for (const rel of classification.coordsByPath.keys()) {
          const id = entryIdForPath(rel);
          (idToPaths.get(id) ?? idToPaths.set(id, []).get(id)!).push(rel);
        }
        for (const [id, paths] of idToPaths) {
          if (paths.length > 1) {
            throw new Error(
              `[gp:ontology] Duplicate entry id "${id}" from sibling files: ` +
                `${paths.join(", ")}. Ids (slugged hierarchical paths) must be ` +
                `unique; rename one of these files.`,
            );
          }
        }
      },

      "gp:entry:data": ({ fileURL, data }) => {
        const abs = fileURLToPath(fileURL);
        const coords = byPath.get(abs);
        if (!coords) {
          // Loose Markdown at the Writings root (forbidden, but degrade
          // gracefully): no category, no series.
          data.category = [];
          data.series = null;
          return;
        }
        data.category = coords.category;
        data.series = coords.series;
      },

      // `disambiguate.md` is a structural marker, never an article: skip storing
      // it so it isn't routed or counted. (`attachments/` never matches `*.md`.)
      "gp:entry:store": ({ entry, skip }) => {
        const base = (entry.filePath ?? "").split("/").at(-1)?.toLowerCase();
        if (base === "disambiguate.md") skip();
      },

      "gp:load:done": ({ entries }) => {
        for (const entry of entries) {
          const node = nodes.get(entry.id);
          if (node?.kind === "category") {
            throw new Error(
              `[gp:ontology] Entry id "${entry.id}" (${entry.filePath}) ` +
                `collides with a category node path. Categories do not have ` +
                `descriptions; only series do. Remove or rename this file.`,
            );
          }
        }
      },
    },
  };
}
