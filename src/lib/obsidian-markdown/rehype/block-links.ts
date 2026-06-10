import type { Root } from "hast";

/**
 * Obsidian block ids (`… ^block-id`) are handled entirely at the MDAST stage: the
 * trailing `^block-id` is stripped from the text and stamped as `id` on the host
 * paragraph/list-item via `data.hProperties`, so the default conversion yields
 * `<p id="block-id">` / `<li id="block-id">`. That makes a resolved wiki-link
 * fragment (`#block-id`, produced by the `obsidian` integration) a working
 * in-page anchor with no extra HAST work.
 *
 * Nothing remains for the HAST stage; this is an intentional no-op.
 */
export function transformBlockLinksHast(_tree: Root): void {
  // intentional no-op — see module doc.
}
