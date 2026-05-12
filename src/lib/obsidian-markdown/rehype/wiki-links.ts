import type { Handle } from 'mdast-util-to-hast';

export const wikiLinkHandler: Handle = (_state, _node) => {
  // TODO: convert ObsidianWikiLink node to an <a> HAST element
  return undefined;
};
