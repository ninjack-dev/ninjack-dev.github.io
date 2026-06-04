import type { Handle } from 'mdast-util-to-hast';
import type { ObsidianWikiLink } from '../types.ts';

export const wikiLinkHandler: Handle = (_state, node) => {
  const n = node as ObsidianWikiLink;
  const data = n.data as {
    hProperties?: { href?: string };
    hChildren?: [{ value: string }];
  } | undefined;
  return {
    type: 'element',
    tagName: 'a',
    properties: { href: data?.hProperties?.href ?? '#', className: ['wiki-link'] },
    children: [{ type: 'text', value: data?.hChildren?.[0]?.value ?? n.value }],
  };
};
