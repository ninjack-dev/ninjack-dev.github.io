import type { Plugin } from 'unified';
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
  node.data ??= {};
  node.data.hProperties = {
    ...(node.data.hProperties as Record<string, unknown> ?? {}),
    id: match[1],
  };
}

export function transformBlockLinks(tree: Root): void {
  visit(tree, ['paragraph', 'listItem'], (node) => {
    applyBlockId(node as Paragraph | ListItem);
  });
}

export const blockLinks: Plugin<[], Root> = () => transformBlockLinks;
