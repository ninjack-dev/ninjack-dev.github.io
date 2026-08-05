import type { Node, Parent, PhrasingContent, Root, RootContent, Text } from "mdast";
import type { ObsidianComment } from "../types.ts";

/**
 * Subtree types whose text is never scanned for `%%` markers: a marker inside
 * them is literal (matching Obsidian, where comments do not begin or end inside
 * code, math, links, or HTML). A comment may still span across one of these
 * nodes — it is then consumed as comment content and disappears with it.
 */
const PROTECTED = new Set<Node["type"]>([
  "code",
  "inlineCode",
  "html",
  "math",
  "inlineMath",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "footnote",
  "footnoteReference",
  "definition",
  "obsidianWikiLink",
  "obsidianEmbed",
  "obsidianCallout",
  "comment",
]);

/**
 * Parents whose children are block content. These are the levels at which a
 * comment that spans multiple blocks is spliced: the comment node replaces the
 * consumed sibling blocks (e.g. paragraphs separated by blank lines, or list
 * items). Phrasing containers (paragraphs, headings, `strong`, …) are scanned
 * in place and never spliced at.
 */
const BLOCK_CONTAINERS = new Set(["root", "blockquote", "list", "listItem", "table", "tableRow"]);

/** A comment that has opened but not yet found its closing `%%`. */
interface OpenComment {
  /** Raw content accumulated so far, excluding the opening `%%`. */
  value: string;
}

function isParent(node: Node): node is Parent {
  return Array.isArray((node as Parent).children);
}

function isProtected(node: Node): boolean {
  return PROTECTED.has(node.type);
}

function hasContent(node: Node): boolean {
  return isParent(node) ? node.children.length > 0 : true;
}

/** Build a `comment` node; `value` is the verbatim `%%…%%` source span. */
function commentNode(content: string): ObsidianComment {
  return { type: "comment", value: `%%${content}%%` };
}

/** Flatten a subtree into raw text (for nodes consumed by a comment). */
function serialize(node: Node): string {
  if (node.type === "text") return (node as Text).value;
  if (isParent(node)) return node.children.map(serialize).join("");
  if ("value" in node && typeof (node as { value?: unknown }).value === "string") {
    return (node as { value: string }).value;
  }
  return "";
}

/**
 * Scan a single text value for `%%…%%` spans, splitting it into alternating
 * `text` / `comment` nodes. `incoming` carries a comment that opened in an
 * earlier node; when present, the first `%%` encountered closes it (comments do
 * not nest — the next marker after an opening always closes). Returns the
 * emitted nodes and any comment still open at the end of the value.
 */
function scanText(
  value: string,
  incoming: OpenComment | null,
): { nodes: PhrasingContent[]; open: OpenComment | null } {
  const nodes: PhrasingContent[] = [];
  let open = incoming;
  let rest = value;

  while (true) {
    const marker = rest.indexOf("%%");
    if (marker < 0) {
      if (open === null) {
        if (rest !== "") nodes.push({ type: "text", value: rest });
      } else {
        open.value += rest;
      }
      return { nodes, open };
    }

    if (open === null) {
      // Opening marker.
      const prefix = rest.slice(0, marker);
      const tail = rest.slice(marker + 2);
      const close = tail.indexOf("%%");
      if (close >= 0) {
        if (prefix !== "") nodes.push({ type: "text", value: prefix });
        nodes.push(commentNode(tail.slice(0, close)));
        rest = tail.slice(close + 2);
        continue;
      }
      // No closer in this value: the comment continues past it.
      if (prefix !== "") nodes.push({ type: "text", value: prefix });
      return { nodes, open: { value: tail } };
    }

    // Closing marker.
    open.value += rest.slice(0, marker);
    nodes.push(commentNode(open.value));
    rest = rest.slice(marker + 2);
    open = null;
  }
}

/**
 * Scan a parent's children in document order, splicing `comment` nodes in and
 * rebuilding the children list in place. `incoming` carries a comment opened in
 * an earlier node; a comment that opens inside a nested child and does not
 * close there bubbles up as the return value, letting the caller consume its
 * siblings at this level.
 */
function scanContainer(container: Parent, incoming: OpenComment | null): OpenComment | null {
  const blockLevel = BLOCK_CONTAINERS.has(container.type);
  const children: Array<RootContent | PhrasingContent> = [];
  let open = incoming;
  let first = true;

  for (const child of container.children) {
    if (open === null) {
      // Looking for an opening marker inside this child.
      if (child.type === "text") {
        const result = scanText(child.value, null);
        open = result.open;
        children.push(...result.nodes);
      } else if (isProtected(child) || !isParent(child)) {
        children.push(child);
      } else {
        open = scanContainer(child, null);
        if (hasContent(child)) children.push(child);
      }
    } else {
      // A comment is open: everything up to the closing marker is comment content.
      // A blank-line separator belongs between block siblings, but not before a
      // container's first block when the parent already added one on entry.
      const boundary = blockLevel && !(incoming !== null && first);
      if (boundary) open.value += "\n\n";
      if (child.type === "text") {
        const result = scanText(child.value, open);
        open = result.open;
        children.push(...result.nodes);
      } else if (isParent(child) && !isProtected(child)) {
        open = scanContainer(child, open);
        if (hasContent(child)) children.push(child);
      } else {
        open.value += serialize(child);
      }
    }
    first = false;
  }

  container.children = children as Parent["children"];
  return open;
}

/**
 * Tokenize Obsidian `%% comment %%` spans into `comment` nodes.
 *
 * Comments follow Obsidian semantics: `%%` opens a comment and the next `%%`
 * closes it (no nesting); comments may span soft breaks, blank lines (multiple
 * paragraphs), and other block boundaries; an unclosed `%%` comments out the
 * rest of the document, mirroring Obsidian. A `comment` node's `value` is the
 * verbatim `%%…%%` source span; the loader integration decides its fate.
 *
 * This must run before the other Obsidian tokenizers: comment content is inert
 * in Obsidian, so nothing inside a span may be tokenized into wiki links,
 * embeds, callouts, or block ids.
 */
export function transformComments(tree: Root): void {
  const open = scanContainer(tree, null);
  if (open !== null) {
    // Unclosed comment: it runs to the end of the document.
    tree.children.push({ type: "comment", value: `%%${open.value}` });
  }
}
