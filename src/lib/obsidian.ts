import { slug as githubSlug } from "github-slugger";
import type { Root as HastRoot } from "hast";
import type { Image, Root as MdastRoot } from "mdast";
import { visit } from "unist-util-visit";
import { entryIdForPath, isArticleFile } from "./ontology/index.ts";
import type { ObsidianCallout, ObsidianWikiLink } from "./obsidian-markdown/types.ts";
import { tokenizeObsidian } from "./obsidian-markdown/remark/index.ts";
import { finalizeObsidian } from "./obsidian-markdown/rehype/index.ts";
import type { GlobPlusIntegration } from "../loaders/globplus/types.ts";
import "../loaders/globplus/integrations/markdown/index.ts";

/** Strip a trailing `.md` (case-insensitive) and surrounding whitespace. */
function stripMd(value: string): string {
  return value.replace(/\.md$/i, "").trim();
}

/**
 * `obsidian` — the resolution + slugging half of the Obsidian feature set
 * (ADR 0004). The remark/rehype plugins in `src/lib/obsidian-markdown` are pure
 * tokenizers; this loader integration owns everything that needs the content
 * tree or the slug authority:
 *
 *  - At `gp:files:resolved` it builds a wiki-link resolution index from the
 *    loader's matched file set, mapping raw targets (by lowercased basename and
 *    by lowercased relative path, both sans `.md`) to canonical entry ids. Ids
 *    are derived through the shared {@link entryIdForPath} rule (same
 *    `github-slugger` per-segment protocol the loader's `generateIdDefault`
 *    uses), so resolved hrefs match real entry ids exactly.
 *  - At `gp:markdown:mdast:postProcess` it runs the tokenizers, then resolves
 *    every `obsidianWikiLink` into final `<a>` markup by stamping `data.hName` /
 *    `hProperties` / `hChildren`. Targets resolve to `/writings/<id>`; `#heading`
 *    fragments slug through `github-slugger` (matching Astro's heading anchor
 *    ids); `#^blockId` fragments become `#<blockId>` (matching the id the
 *    block-link tokenizer stamps). Unresolved targets render as
 *    `<span class="wiki-link broken">` with no href, never crashing the build.
 *  - At `gp:markdown:hast:postProcess` it finalizes callouts (and any other
 *    HAST-stage handlers).
 *
 *  - At `gp:markdown:mdast:postProcess` it also resolves image-embed `Image`
 *    nodes (those carrying a `wiki-embed` class) by prepending
 *    `./attachments/` to their raw `url`, so they ride the loader's
 *    `imagePaths`/`assetImports` pipeline.
 */
export function obsidian(): GlobPlusIntegration {
  // Lowercased basename (sans `.md`) → entry id. First file wins on collision,
  // mirroring Obsidian's own short-name resolution.
  let byBasename = new Map<string, string>();
  // Lowercased relative POSIX path (sans `.md`) → entry id.
  let byRelPath = new Map<string, string>();

  /** Resolve a raw wiki target to an entry id, or `undefined` if unknown. */
  function resolveTarget(rawTarget: string): string | undefined {
    const clean = stripMd(rawTarget);
    if (!clean) return undefined;
    if (clean.includes("/")) {
      const key = clean.toLowerCase();
      return byRelPath.get(key) ?? byBasename.get(clean.split("/").at(-1)!.toLowerCase());
    }
    return byBasename.get(clean.toLowerCase());
  }

  /** Resolve every `obsidianWikiLink` in a tokenized MDAST tree. */
  function resolveWikiLinks(tree: MdastRoot): void {
    visit(tree, "obsidianWikiLink", (node: ObsidianWikiLink) => {
      const id = resolveTarget(node.target);
      const label =
        node.alias ?? node.heading ?? stripMd(node.target).split("/").at(-1) ?? node.target;

      if (id === undefined) {
        // Unresolved: render visible but inert, no href.
        node.data = {
          hName: "span",
          hProperties: { className: ["wiki-link", "broken"] },
          hChildren: [{ type: "text", value: label }],
        };
        return;
      }

      let href = `/writings/${id}`;
      if (node.blockId) {
        href += `#${node.blockId}`;
      } else if (node.heading) {
        href += `#${githubSlug(node.heading)}`;
      }

      node.data = {
        hName: "a",
        hProperties: { href, className: ["wiki-link"] },
        hChildren: [{ type: "text", value: label }],
      };
    });
  }

  /**
   * Stamp each `obsidianCallout` with a marker so the default mdast→hast
   * conversion preserves it (a custom node type with no `hName` is dropped). The
   * body children convert normally and become the marker `<div>`'s children; the
   * HAST handler {@link finalizeObsidian} then restructures it into the final
   * callout / `<details>` markup, reading these data attributes.
   */
  function stampCalloutMarkers(tree: MdastRoot): void {
    visit(tree, "obsidianCallout", (node: ObsidianCallout) => {
      node.data = {
        ...node.data,
        hName: "div",
        hProperties: {
          dataObsidianCallout: "",
          dataCalloutType: node.calloutType,
          dataCalloutTitle: node.title,
          dataCalloutFoldable: String(node.foldable),
          dataCalloutDefaultOpen: String(node.defaultOpen),
        },
      };
    });
  }

  /**
   * Resolve every `Image` node stamped with a `wiki-embed` class by prepending
   * `./attachments/` to its raw `url`. These nodes are produced by the
   * wiki-embeds tokenizer with raw embed targets (e.g.
   * {@code ![[image.png|200x100]]} becomes an `Image` with `url: "image.png"`);
   * the prefix is applied here so the path is relative for the loader's
   * `imagePaths`/`assetImports` pipeline during the mdast→hast conversion.
   */
  function resolveEmbedHrefs(tree: MdastRoot): void {
    visit(tree, "image", (node: Image) => {
      const hProps = (node.data as Record<string, unknown> | undefined)
        ?.hProperties as Record<string, unknown> | undefined;
      if (!hProps) return;
      const classes = hProps.className;
      if (!Array.isArray(classes) || !classes.includes("wiki-embed")) return;
      node.url = `./attachments/${node.url}`;
    });
  }

  return {
    name: "gp:obsidian",
    hooks: {
      "gp:files:resolved": ({ files }) => {
        byBasename = new Map();
        byRelPath = new Map();
        for (const rel of files) {
          // Shared article rule: only Markdown article files get an id/index.
          if (!isArticleFile(rel)) continue;
          const fileName = rel.split("/").at(-1)!;
          const id = entryIdForPath(rel);

          const relKey = stripMd(rel).toLowerCase();
          if (!byRelPath.has(relKey)) byRelPath.set(relKey, id);

          const baseKey = stripMd(fileName).toLowerCase();
          if (!byBasename.has(baseKey)) byBasename.set(baseKey, id);
        }
      },

      "gp:markdown:mdast:postProcess": ({ tree }) => {
        tokenizeObsidian(tree);
        resolveWikiLinks(tree);
        stampCalloutMarkers(tree);
        resolveEmbedHrefs(tree);
      },

      "gp:markdown:hast:postProcess": ({ tree }: { tree: HastRoot }) => {
        finalizeObsidian(tree);
      },
    },
  };
}
