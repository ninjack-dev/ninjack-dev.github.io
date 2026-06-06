import { fileURLToPath } from "node:url";
import type { Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";
import type { VFile } from "vfile";
import { runHook } from "../../run-hook.ts";
import type { GlobPlusIntegration } from "../../types.ts";
import { bridgeProcessor, type StageBridges } from "./processors.ts";

/**
 * The first-party `gp:markdown` hook set. This is the reference implementation
 * of the globplus extension pattern (§3.4): it augments the hook contract below
 * and, in its own `gp:config:setup`, swaps `config.markdown.processor` for one
 * that calls the new hooks on peer integrations at the MDAST / HAST boundaries.
 *
 * globplus *core* knows nothing about `gp:markdown:*` or markdown processors; it
 * only provides the `gp:config:setup` hook (with a mutable per-collection
 * `config`) and the `integrations` list. This integration owns all markdown
 * concerns: it detects the configured `markdown.processor` via a small
 * processor-adapter layer ({@link bridgeProcessor}) and rebuilds it with two
 * bridge stage transformers appended.
 *
 * Supported processors:
 * - `unified()` (remark/rehype) — supported now.
 * - Sätteri (`@astrojs/markdown-satteri`, Astro 6.4) — a planned extension
 *   point; see the commented recipe in `processors.ts`.
 *
 * An unrecognized processor disables the `gp:markdown:*` hooks for that
 * collection with a warning (the config is left untouched). To support a new
 * processor, add a branch to `bridgeProcessor` in `processors.ts`.
 *
 * Third-party hook sets follow this exact template (with their own, non-`gp:`
 * prefix).
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace GlobPlus {
    export interface IntegrationHooks {
      /** Mutate the parsed MDAST before it is converted to HAST. */
      "gp:markdown:mdast:postProcess": (params: {
        /** The final loader-computed entry id (post `gp:entry:resolveId`). */
        id: string;
        tree: MdastRoot;
        file: VFile;
      }) => void | Promise<void>;
      /** Mutate the HAST after conversion from MDAST. */
      "gp:markdown:hast:postProcess": (params: {
        /** The final loader-computed entry id (post `gp:entry:resolveId`). */
        id: string;
        tree: HastRoot;
        file: VFile;
      }) => void | Promise<void>;
    }
  }
}

/**
 * Per-load map from a render VFile's absolute fs path to the loader-computed
 * entry id.
 *
 * `getRenderFunction` forwards only body / frontmatter / fileURL to the unified
 * pipeline — the `id` passed into the loader's `render({ id, … })` call is
 * dropped before the bridge plugins run, and renders run concurrently (under
 * `pLimit`), so a shared mutable "current id" would race. Instead the id is
 * captured in `gp:entry:data` keyed by the entry's absolute path, then recovered
 * in the bridges via `file.path`. Astro builds the render VFile as
 * `new VFile({ path: fileURL, … })` and vfile coerces that URL to an fs path, so
 * `file.path === fileURLToPath(fileURL)` — an identity-safe join key (verified).
 *
 * `markdownHooks` is a per-load factory: each call gets its own closure-scoped
 * `fileToEntryId` map, so concurrently-loading collections never share keys.
 */

/**
 * The `gp:markdown` integration factory. Call it in a `globplus({ integrations })`
 * list to enable the `gp:markdown:mdast:postProcess` /
 * `gp:markdown:hast:postProcess` hooks for that collection. Each invocation
 * closes over its own per-load path→id map.
 */
export function markdownHooks(): GlobPlusIntegration {
  /**
   * Per-load map from a render VFile's absolute fs path to the loader-computed
   * entry id. Closure-scoped to this factory call, so each collection's hook
   * set has an isolated map.
   */
  const fileToEntryId = new Map<string, string>();

  return {
    name: "gp:markdown",
    hooks: {
      "gp:config:setup": ({ config, logger, integrations }) => {
        // The two processor-agnostic stage bridges. Each recovers the loader-
        // computed `id` from `fileToEntryId` keyed by the render VFile's absolute
        // path (`file.path` == `fileURLToPath(fileURL)`; the id was stashed in
        // `gp:entry:data`), then dispatches the matching hook on every peer.
        const bridges: StageBridges = {
          // MDAST boundary → `gp:markdown:mdast:postProcess`.
          mdast: async (tree: MdastRoot, file: VFile) => {
            const id = fileToEntryId.get(file.path) ?? "";
            await runHook({
              integrations,
              hookName: "gp:markdown:mdast:postProcess",
              logger,
              params: () => ({ id, tree, file }),
            });
          },
          // HAST boundary → `gp:markdown:hast:postProcess`.
          hast: async (tree: HastRoot, file: VFile) => {
            const id = fileToEntryId.get(file.path) ?? "";
            await runHook({
              integrations,
              hookName: "gp:markdown:hast:postProcess",
              logger,
              params: () => ({ id, tree, file }),
            });
          },
        };

        // Resolve an adapter for the configured processor and build a bridged
        // one. An unrecognized processor is the accepted error path for now:
        // warn and leave the config untouched, disabling the `gp:markdown:*`
        // hooks for this collection.
        const bridged = bridgeProcessor(config.markdown.processor, bridges);
        if (!bridged) {
          const name = config.markdown.processor?.name ?? "none";
          logger.warn(
            `Unsupported markdown processor "${name}"; the ` +
              `gp:markdown:mdast:postProcess / gp:markdown:hast:postProcess hooks ` +
              `are disabled for this collection. Supported: unified().`,
          );
          return;
        }

        // Reassign the whole `markdown` branch on the cloned, per-collection
        // config. The global config (and the other collections sharing it) keep
        // their original processor.
        config.markdown = { ...config.markdown, processor: bridged };
      },

      // Reset the per-load path→id map at the start of every load. Setup is
      // memoized (runs once), so the map can't be reset there.
      "gp:files:resolved": () => {
        fileToEntryId.clear();
      },

      // Capture the loader-computed id keyed by the entry's absolute fs path, so
      // the bridges can recover it via `file.path` during render.
      "gp:entry:data": ({ id, fileURL }) => {
        fileToEntryId.set(fileURLToPath(fileURL), id);
      },
    },
  };
}
