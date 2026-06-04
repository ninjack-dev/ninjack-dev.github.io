import type { Plugin } from 'unified';
import type { Root, Blockquote, RootContent } from 'mdast';
import { visit, SKIP } from 'unist-util-visit';
import type { ObsidianCallout } from '../types.ts';

// Only match title text on the same line (no newlines in title)
const CALLOUT_MARKER = /^\[!(\w+)\]([+-])?(?:[ \t]+([^\n]+))?/;

export function transformCallouts(tree: Root): void {
  visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
    if (!parent || index === undefined) return;

    const firstChild = node.children[0];
    if (firstChild?.type !== 'paragraph') return;

    const firstPhrasing = firstChild.children[0];
    if (firstPhrasing?.type !== 'text') return;

    const match = firstPhrasing.value.match(CALLOUT_MARKER);
    if (!match) return;

    const [, calloutType, foldableFlag, customTitle] = match;
    // After the marker, the remainder of the first text node may start with \n (soft break)
    // followed by the body. Strip that leading newline.
    const afterMarker = firstPhrasing.value.slice(match[0].length).replace(/^\n/, '');

    let bodyChildren: RootContent[];
    if (afterMarker) {
      // Remaining text on the same paragraph (after the soft break)
      const newFirstPara = {
        ...firstChild,
        children: [{ ...firstPhrasing, value: afterMarker }, ...firstChild.children.slice(1)],
      };
      bodyChildren = [newFirstPara as RootContent, ...node.children.slice(1)];
    } else if (firstChild.children.length > 1) {
      const newFirstPara = { ...firstChild, children: firstChild.children.slice(1) };
      bodyChildren = [newFirstPara as RootContent, ...node.children.slice(1)];
    } else {
      bodyChildren = node.children.slice(1) as RootContent[];
    }

    const callout: ObsidianCallout = {
      type: 'obsidianCallout',
      calloutType: calloutType.toLowerCase(),
      title: customTitle?.trim() ?? calloutType.toUpperCase(),
      foldable: foldableFlag !== undefined,
      defaultOpen: foldableFlag !== '-',
      children: bodyChildren,
    };

    parent.children.splice(index, 1, callout as unknown as RootContent);
    return [SKIP, index];
  });
}

export const callouts: Plugin<[], Root> = () => transformCallouts;
