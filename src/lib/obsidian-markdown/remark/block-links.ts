import type { Root, Paragraph, ListItem } from 'mdast';
import { visit } from 'unist-util-visit';

const BLOCK_ID = /[ \t]+\^([\w-]+)$/;

function applyBlockId(node: Paragraph | ListItem): void {
  const children = node.type === 'listItem'
    ? (node.children[0]?.type === 'paragraph' ? node.children[0].children : [])
    : node.children;

  const lastChild = children.at(-1);
  if (lastChild?.type !== 'text') return;

  const match = lastChild.value.match(BLOCK_ID);
  if (!match) return;

  lastChild.value = lastChild.value.slice(0, -match[0].length);
  // `hProperties` is the mdast-util-to-hast directive carrier; `@types/mdast`'s
  // per-node `Data` doesn't declare it without importing that package, so stamp
  // it through a structural cast. The default mdast→hast conversion reads it.
  const data = (node.data ??= {}) as { hProperties?: Record<string, unknown> };
  data.hProperties = { ...(data.hProperties ?? {}), id: match[1] };
}

export function transformBlockLinks(tree: Root): void {
  visit(tree, ['paragraph', 'listItem'], (node) => {
    applyBlockId(node as Paragraph | ListItem);
  });
}
