import type { Element, ElementContent, Root } from "hast";
import { SKIP, visit } from "unist-util-visit";

/**
 * Handle Obsidian `%%…%%` comments after mdast→hast conversion. The mdast stage
 * stamps each comment as a `<span class="obsidian-comment">` carrying the raw
 * `%%…%%` value. Production drops those spans; dev keeps them — darkened by the
 * `.obsidian-comment` CSS rule — with the delimiters stripped.
 */
export function transformCommentsHast(tree: Root): void {
  visit(tree, "element", (node: Element, index, parent) => {
    if (!isCommentMarker(node)) return;
    if (!import.meta.env.DEV) {
      if (parent === undefined || index === undefined) return;
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
    // Dev: strip the `%%` delimiters.
    node.children = node.children.map((child: ElementContent) =>
      child.type === "text" ? { ...child, value: stripDelimiters(child.value) } : child,
    );
  });
}

function isCommentMarker(node: Element): boolean {
  const className = node.properties?.className;
  return Array.isArray(className) && className.includes("obsidian-comment");
}

/** Strip the `%%` delimiters from a comment's raw source span. */
function stripDelimiters(value: string): string {
  return value.replace(/^%%/, "").replace(/%%$/, "");
}
