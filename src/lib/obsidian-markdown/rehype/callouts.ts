import type { Element, ElementContent, Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * Marker property the MDAST stage stamps onto a callout node's `data.hProperties`
 * so the default mdast→hast conversion preserves the `obsidianCallout` (a custom
 * node type would otherwise be dropped). The HAST handler below finds these
 * marker `<div>`s and restructures them into the final callout markup.
 *
 * The mdast stage sets `hName: 'div'` + these props; the body children convert
 * normally and land as this div's children.
 */
export interface CalloutMarkerProps {
  dataObsidianCallout: string;
  dataCalloutType: string;
  dataCalloutTitle: string;
  dataCalloutFoldable: string;
  dataCalloutDefaultOpen: string;
}

function isCalloutMarker(node: Element): boolean {
  return (
    node.tagName === "div" &&
    (node.properties?.dataObsidianCallout === "" || node.properties?.dataObsidianCallout === true)
  );
}

/**
 * Restructure a callout marker `<div>` into final callout markup:
 *  - non-foldable → `<div class="callout" data-callout=TYPE>` with a
 *    `<div class="callout-title">` + `<div class="callout-body">`.
 *  - foldable → `<details class="callout" data-callout=TYPE [open]>` with a
 *    `<summary>` title + `<div class="callout-body">`. This matches the Phase 1
 *    CSS targeting `details.callout[data-callout] > summary`.
 */
function rebuildCallout(node: Element): void {
  const props = node.properties ?? {};
  const calloutType = String(props.dataCalloutType ?? "note");
  const title = String(props.dataCalloutTitle ?? "");
  const foldable = props.dataCalloutFoldable === "true";
  const defaultOpen = props.dataCalloutDefaultOpen === "true";

  const body = node.children;
  const titleText: ElementContent = { type: "text", value: title };

  if (foldable) {
    const summary: Element = {
      type: "element",
      tagName: "summary",
      properties: {},
      children: [titleText],
    };
    const bodyEl: Element = {
      type: "element",
      tagName: "div",
      properties: { className: ["callout-body"] },
      children: body,
    };
    node.tagName = "details";
    node.properties = {
      className: ["callout"],
      dataCallout: calloutType,
      ...(defaultOpen ? { open: true } : {}),
    };
    node.children = [summary, bodyEl];
    return;
  }

  const titleEl: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["callout-title"] },
    children: [titleText],
  };
  const bodyEl: Element = {
    type: "element",
    tagName: "div",
    properties: { className: ["callout-body"] },
    children: body,
  };
  node.tagName = "div";
  node.properties = { className: ["callout"], dataCallout: calloutType };
  node.children = [titleEl, bodyEl];
}

/** Rewrite all callout marker `<div>`s in a HAST tree into final markup. */
export function transformCalloutsHast(tree: Root): void {
  visit(tree, "element", (node: Element) => {
    if (isCalloutMarker(node)) rebuildCallout(node);
  });
}
