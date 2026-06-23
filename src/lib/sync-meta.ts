import { readFile, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "astro/zod";
import type { Nodes, Root } from "mdast";
import type { GlobPlusIntegration } from "../loaders/globplus/index.ts";
import "../loaders/globplus/integrations/markdown/index.ts";

export type NodeTypes = Nodes["type"];

type NodeFilter = {
  /** Checks whether a node passes the filter, determined by its `type` field. */
  check(type: NodeTypes): boolean;
};

type SkeletonNode = { type: NodeTypes; children?: SkeletonNode[] };

/**
 * Reduces an MDAST node to its structural skeleton: only node type and parent-
 * child relationships are retained. All node data is stripped so that
 * the hash only reflects additions/removals, not edits. Nodes that do not pass
 * `filter` are removed entirely, along with their subtrees.
 */
export function buildSkeleton(node: Nodes, filter?: NodeFilter): SkeletonNode | null {
  if (filter && !filter.check(node.type)) {
    return null;
  }

  const skeleton: SkeletonNode = { type: node.type };

  if ("children" in node) {
    if (node.children.length > 0) {
      const children = (node.children as Nodes[])
        .map((c) => buildSkeleton(c, filter))
        .filter((c): c is SkeletonNode => c !== null);
      if (children.length > 0) skeleton.children = children;
    }
  }

  return skeleton;
}

/**
 * Builds a SHA-256 digest of an MDAST tree's structural skeleton.
 */
async function buildStructuralDigest(tree: Root, filter: NodeFilter): Promise<string> {
  const skeleton = buildSkeleton(tree, filter);
  const encoded = new TextEncoder().encode(JSON.stringify(skeleton));
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const MetaEntry = z.object({
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  digest: z.string(),
});
const MetaStore = z.map(z.string(), MetaEntry);

type MetaEntry = z.infer<typeof MetaEntry>;
type MetaStore = z.infer<typeof MetaStore>;

/** Read + validate the meta file; a missing or malformed file starts empty. */
async function readMeta(path: string | URL): Promise<MetaStore> {
  try {
    return MetaStore.parse(JSON.parse(await readFile(path, "utf-8")));
  } catch {
    return new Map();
  }
}

type FilterOption =
  | { whitelist: NodeTypes[]; blacklist?: never }
  | { blacklist: NodeTypes[]; whitelist?: never };

function buildFilter(options: FilterOption): NodeFilter {
  if (options.whitelist) {
    const allow = new Set(options.whitelist);
    return { check: (type) => allow.has(type) };
  }
  const deny = new Set(options.blacklist);
  return { check: (type) => !deny.has(type) };
}

/**
 * `sync-meta` is a globplus integration that maintains a per-collection
 * `meta.json` recording each entry's first-publish `date` and its most
 * recent `updated` date (tracked with a `digest` of its structural skeleton).
 */
export function syncMeta(
  options: {
    path: string | URL;
  } & FilterOption,
): GlobPlusIntegration {
  const path = options.path;
  const filter = buildFilter(options);

  // All reset / repopulated in `gp:files:resolved` (runs once per load, before
  // per-file work).
  let now: Date;
  // The working meta store: seeded from prior, mutated in place, pruned + written.
  let meta: MetaStore;
  // The live source-file set, as absolute fs paths, for end-of-load pruning.
  let liveFiles = new Set<string>();

  let rootDir: string;

  return {
    name: "sync-meta",
    hooks: {
      "gp:config:setup": ({ config }) => {
        rootDir = fileURLToPath(config.root);
      },

      "gp:files:resolved": async ({ files, base }) => {
        now = new Date();
        meta = await readMeta(path);

        const baseDir = fileURLToPath(base);
        liveFiles = new Set(files.map((file) => normalize(join(baseDir, file))));
      },

      "gp:entry:data": ({ id, fileURL, data }) => {
        // TODO: Don't fall back to the title. It should *always* be set.
        if (!data.title) {
          const basename = decodeURIComponent(fileURL.pathname.split("/").at(-1) ?? "");
          data.title = basename.replace(/\.[^.]+$/, "");
        }

        if (data.published) {
          const prior = meta.get(id);
          if (prior) {
            data.date = prior.date;
          } else {
            const date = new Date();
            data.date = date;
            meta.set(id, { date, digest: "" });
          }
        } else {
          data.date = new Date();
        }
      },

      "gp:markdown:mdast:postProcess": async ({ id, tree }) => {
        const digest = await buildStructuralDigest(tree, filter);
        const prior = meta.get(id);
        if (!prior) {
          meta.set(id, { date: now, digest: digest });
        } else if (prior.digest !== digest) {
          prior.updated = now;
          prior.digest = digest;
        }
      },

      "gp:entry:store": ({ entry }) => {
        const m = meta.get(entry.id);
        if (m) entry.data.updated = m.updated;
      },

      "gp:load:done": async ({ store }) => {
        const liveIds = new Set<string>();
        for (const entry of store.values()) {
          if (!entry.filePath) continue;
          const abs = normalize(join(rootDir, entry.filePath));
          if (liveFiles.has(abs)) liveIds.add(entry.id);
        }

        for (const id of meta.keys()) {
          if (!liveIds.has(id)) meta.delete(id);
        }

        if (import.meta.env.PROD) {
          await writeFile(path, JSON.stringify(meta, null, 2) + "\n", "utf-8");
        }
        if (import.meta.env.DEV) {
          console.log("[sync-meta] MetaStore:", meta);
        }
      },
    },
  };
}
