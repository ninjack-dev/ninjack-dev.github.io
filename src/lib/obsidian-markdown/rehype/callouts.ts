import type { Handle } from 'mdast-util-to-hast';

export const calloutHandler: Handle = (_state, _node) => {
  // TODO: convert ObsidianCallout node to a <div data-callout="NOTE"> HAST element
  //       with optional title and body children
  return undefined;
};
