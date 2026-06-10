import type { Root } from "hast";

/**
 * Wiki links are emitted in final form by the MDAST stage: the `obsidian` loader
 * integration resolves each `obsidianWikiLink`'s href against the file tree and
 * stamps `data.hName='a'` + `hProperties={href, class}` + `hChildren=[label]`, so
 * the default mdast→hast conversion produces `<a class="wiki-link" href=…>`
 * (`<a class="wiki-link broken">` with no href for unresolved targets) directly.
 *
 * There is therefore nothing left to do at the HAST stage; this is an
 * intentional no-op kept for symmetry with the other handlers.
 */
export function transformWikiLinksHast(_tree: Root): void {
  // intentional no-op — see module doc.
}
