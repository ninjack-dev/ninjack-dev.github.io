import type { Root } from 'hast';

/**
 * Image embeds (`![[x.png]]`, `![[x.png|WxH]]`) are tokenized by the MDAST stage
 * into ordinary relative `image` nodes (`./attachments/x.png`) carrying a
 * `wiki-embed` class and optional `width`/`height` via `data.hProperties`. They
 * therefore:
 *  - ride the loader's `imagePaths` → `assetImports` pipeline (Astro fingerprints
 *    and rewrites them into `_astro/…`), and
 *  - convert to `<img class="wiki-embed" src=… [width] [height]>` by default.
 *
 * Non-image embeds (page transclusion) are emitted as a text placeholder by the
 * MDAST tokenizer for now. Nothing remains for the HAST stage; this is an
 * intentional no-op kept for symmetry. Full page transclusion is a future
 * extension that would resolve and inline the transcluded entry's HAST here,
 * where the rendered content of sibling entries could be reached.
 */
export function transformWikiEmbedsHast(_tree: Root): void {
  // intentional no-op — see module doc.
}
