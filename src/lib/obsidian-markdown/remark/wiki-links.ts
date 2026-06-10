import type { Root, Paragraph, PhrasingContent, Text } from "mdast";
import { visit } from "unist-util-visit";
import type { ObsidianWikiLink } from "../types.ts";

// Matches [[target]], [[target#fragment]], [[target|alias]] — but NOT ![[...]].
// Pure tokenizer (ADR 0004): captures raw text only; no path resolution, no
// slugging, no tree knowledge. The `obsidian` loader integration resolves these.
const WIKI_LINK = /(?<!!)\[\[([^\]|#\n]+?)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/g;

function splitOnWikiLinks(children: PhrasingContent[]): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  for (const child of children) {
    if (child.type !== "text") {
      result.push(child);
      continue;
    }
    const { value } = child as Text;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    WIKI_LINK.lastIndex = 0;
    while ((match = WIKI_LINK.exec(value)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: value.slice(lastIndex, match.index) });
      }
      const [, rawTarget, fragment, alias] = match;
      // Keep the raw target verbatim (including any `.md` / path prefix); the
      // resolution hook normalizes and looks it up against the file tree.
      const target = rawTarget.trim();
      let heading: string | undefined;
      let blockId: string | undefined;
      if (fragment) {
        if (fragment.startsWith("^")) {
          blockId = fragment.slice(1).trim();
        } else {
          heading = fragment.trim();
        }
      }
      const node: ObsidianWikiLink = {
        type: "obsidianWikiLink",
        value: "",
        target,
        ...(alias !== undefined ? { alias: alias.trim() } : {}),
        ...(heading !== undefined ? { heading } : {}),
        ...(blockId !== undefined ? { blockId } : {}),
      };
      result.push(node);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      result.push({ type: "text", value: value.slice(lastIndex) });
    } else if (lastIndex === 0) {
      result.push(child);
    }
  }
  return result;
}

export function transformWikiLinks(tree: Root): void {
  visit(tree, "paragraph", (node: Paragraph) => {
    node.children = splitOnWikiLinks(node.children) as Paragraph["children"];
  });
}
