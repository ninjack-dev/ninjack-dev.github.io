import type { Handle } from 'mdast-util-to-hast';

export const blockLinkHandler: Handle = (_state, _node) => {
  // TODO: convert ObsidianBlockLink node to an <a href="#block-id"> HAST element
  return undefined;
};
