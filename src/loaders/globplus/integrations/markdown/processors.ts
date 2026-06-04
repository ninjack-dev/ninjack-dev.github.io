import { isUnifiedProcessor, unified } from "@astrojs/markdown-remark";
import type { Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";
import type { VFile } from "vfile";
import type { AstroConfig } from "astro";

/**
 * Processor-agnostic stage transformers the bridges install. Each runs at a
 * markdown render stage boundary, against the in-flight tree and its `VFile`:
 * - {@link StageBridges.mdast} at the MDAST boundary (post-parse, pre-HAST).
 * - {@link StageBridges.hast} at the HAST boundary (post-conversion).
 *
 * They are written once in `index.ts` (processor-independent) and handed to
 * `bridgeProcessor`, which knows how to splice them into a specific processor's
 * pipeline.
 */
export interface StageBridges {
  mdast: (tree: MdastRoot, file: VFile) => Promise<void>;
  hast: (tree: HastRoot, file: VFile) => Promise<void>;
}

/** The `processor` slot on `config.markdown` — `MarkdownProcessor | undefined`. */
type MarkdownProcessor = AstroConfig["markdown"]["processor"];

/**
 * Build a processor with the stage bridges spliced in. Returns `undefined` (with
 * no mutation) when the processor is unrecognized — the caller warns and disables
 * the mdast/hast hooks for the collection.
 *
 * Returning a fresh processor (rather than mutating) is mandatory for the
 * `unified()` processor: its `createRenderer` reads plugins LAZILY from a
 * closure over the original `processor` variable, so a spread/clone keeps the
 * old `createRenderer` and ignores the appended plugins. The only scoped way to
 * carry extra plugins is to rebuild via the factory, seeding it with the
 * existing processor's resolved `options`. Other processors (e.g. Sätteri)
 * follow the same rebuild-via-factory contract under their own option names.
 *
 * To support Astro 6.4's Sätteri processor (`@astrojs/markdown-satteri`), add a
 * second branch here. Sätteri is NOT installed, so it is not imported. It exposes
 * the same two stage boundaries under different option names — `mdastPlugins` /
 * `hastPlugins` — so the branch would detect it via its own `isSatteriProcessor`
 * guard and rebuild via the factory:
 *
 *   if (isSatteriProcessor(processor)) {
 *     return satteri({
 *       ...processor.options,
 *       mdastPlugins: [...processor.options.mdastPlugins, bridges.mdast],
 *       hastPlugins: [...processor.options.hastPlugins, bridges.hast],
 *     });
 *   }
 */
export function bridgeProcessor(
  processor: MarkdownProcessor,
  bridges: StageBridges,
): MarkdownProcessor | undefined {
  if (!processor || !isUnifiedProcessor(processor)) return undefined;
  return unified({
    ...processor.options,
    remarkPlugins: [...processor.options.remarkPlugins, () => bridges.mdast],
    rehypePlugins: [...processor.options.rehypePlugins, () => bridges.hast],
  });
}
